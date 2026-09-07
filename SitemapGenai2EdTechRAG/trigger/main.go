package main

// HTTP front door for SitemapGenai2EdTechRAG, for setups where the tool runs
// as a long-lived container on its own server instead of as GitLab CI stages.
//
// GET/POST {SUBFOLDER}/{instance}/trigger starts one run of the tool's three
// modes against that instance's mirror checkout - build, diff, and (if
// anything changed) commit+push+notify - and returns immediately; the run
// itself continues in the background and its own commit is what would
// otherwise start the next pipeline, so this server never re-triggers itself.
//
// One container serves every site: an instance is a subfolder of CONFIG_DIR
// holding a .env with that site's SITEMAP_GENAI_SITES, endpoint, shared secret
// and TRIGGER_SECRET. The folder name is the path segment, so adding a site is
// a new folder plus its mirror checkout - no second service, no second Traefik
// router, no restart. The .env is read per request, so editing one takes
// effect on the next trigger.
//
// Sibling of the SitemapGenai2EdTechRAG binary, not a replacement: this file
// only adds the network-reachable trigger and the commit+push step, which is
// git's job and was previously entrypoint.sh's.
//
//	curl -X POST -H "Authorization: Bearer $TRIGGER_SECRET" https://.../sitemapgenai2edtechrag/flaait/trigger

import (
	"bufio"
	"crypto/subtle"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// The file inside an instance folder that holds its variables. Same name and
// same syntax as the .env the tool reads on the host, so a working local
// configuration can be moved into config/<name>/ unchanged.
const instanceEnvFile = ".env"

type config struct {
	addr      string
	subfolder string
	// Folder whose subfolders are the instances, mounted read-only from
	// ./config in docker-compose.yml.
	configDir string
	// Where the mirror checkouts are mounted (./out in docker-compose.yml).
	// An instance's workdir is workRoot/<MIRROR_DIR or instance name>.
	workRoot    string
	toolBin     string
	branch      string
	authorName  string
	authorEmail string
}

// One configured site. Built per request from config/<name>/.env, so it never
// holds a stale copy of a secret an operator has just rotated.
type instance struct {
	name        string
	workdir     string
	secret      string
	branch      string
	authorName  string
	authorEmail string
	// The instance's variables, passed to the tool as its environment.
	env []string
}

func envOr(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

func loadConfig() config {
	return config{
		addr:        envOr("ADDR", ":8080"),
		subfolder:   strings.Trim(envOr("SUBFOLDER", "sitemapgenai2edtechrag"), "/"),
		configDir:   envOr("CONFIG_DIR", "/app/config"),
		workRoot:    envOr("WORK_ROOT", "/work"),
		toolBin:     envOr("TOOL_BIN", "/usr/local/bin/sitemapgenai2edtechrag"),
		branch:      envOr("MIRROR_BRANCH", "main"),
		authorName:  envOr("GIT_AUTHOR_NAME", "GenAI Sync"),
		authorEmail: envOr("GIT_AUTHOR_EMAIL", "noreply@tugraz.at"),
	}
}

type runner struct {
	cfg  config
	mu   sync.Mutex
	busy map[string]bool
}

func main() {
	cfg := loadConfig()
	if fi, err := os.Stat(cfg.configDir); err != nil || !fi.IsDir() {
		log.Fatalf("CONFIG_DIR %q is not a directory - mount ./config into the container", cfg.configDir)
	}
	setupSSH()

	prefix := ""
	if cfg.subfolder != "" {
		prefix = "/" + cfg.subfolder
	}

	rn := &runner{cfg: cfg, busy: map[string]bool{}}

	rn.logInstances()

	mux := http.NewServeMux()
	// Health of the container itself, one level above the instances, so an
	// uptime check does not have to know which sites are configured.
	mux.HandleFunc(prefix+"/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeOK(w)
	})
	mux.HandleFunc(prefix+"/", rn.handle)

	log.Printf("sitemapgenai2edtechrag-trigger listening on %s (prefix %q, config %q, work root %q)",
		cfg.addr, prefix, cfg.configDir, cfg.workRoot)
	log.Fatal(http.ListenAndServe(cfg.addr, mux))
}

// setupSSH points git at the deploy key mounted into the container, same key
// path and options as the (now unused-by-default) entrypoint.sh used.
func setupSSH() {
	const keyPath = "/app/.ssh/id_ed25519"
	if _, err := os.Stat(keyPath); err != nil {
		return
	}
	_ = os.Chmod(keyPath, 0o600)
	_ = os.Setenv("GIT_SSH_COMMAND", "ssh -i "+keyPath+" -o StrictHostKeyChecking=accept-new")
}

/* ------------------------------------------------------------------ Routing */

// handle serves everything below the prefix: /{instance}/trigger and
// /{instance}/healthz. The instance is resolved per request instead of at
// startup, so a new config folder needs no restart.
func (rn *runner) handle(w http.ResponseWriter, r *http.Request) {
	name, action := splitInstancePath(r.URL.Path, rn.cfg.subfolder)
	if name == "" || action == "" {
		http.NotFound(w, r)
		return
	}

	inst, err := rn.loadInstance(name)
	if err != nil {
		// Deliberately the same answer as an unknown path: an unauthenticated
		// caller learns nothing about which sites this container serves.
		log.Printf("instance %q unavailable: %v", name, err)
		http.NotFound(w, r)
		return
	}

	switch action {
	case "healthz":
		writeOK(w)
	case "trigger":
		rn.handleTrigger(w, r, inst)
	default:
		http.NotFound(w, r)
	}
}

// splitInstancePath turns /{subfolder}/{instance}/{action} into its last two
// segments. Returns empty strings when the path has a different shape or when
// the instance is not a plain name - the name becomes a directory below
// CONFIG_DIR, so "..", a slash or a dot-file must not get through.
func splitInstancePath(urlPath, subfolder string) (name, action string) {
	rest := strings.Trim(strings.TrimPrefix(strings.Trim(urlPath, "/"), subfolder), "/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 {
		return "", ""
	}
	if !safeName(parts[0]) {
		return "", ""
	}
	return parts[0], parts[1]
}

func safeName(name string) bool {
	if name == "" || strings.HasPrefix(name, ".") {
		return false
	}
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '_', r == '.':
		default:
			return false
		}
	}
	return true
}

func writeOK(w http.ResponseWriter) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok\n"))
}

/* ------------------------------------------------------------------ Instanzen */

// logInstances reports at startup what CONFIG_DIR currently holds. Only a
// report: an instance is loaded again on every request, so a folder fixed
// afterwards needs no restart - but an operator should not have to send a
// request to find out that a .env is missing its TRIGGER_SECRET.
func (rn *runner) logInstances() {
	entries, err := os.ReadDir(rn.cfg.configDir)
	if err != nil {
		log.Printf("cannot list %s: %v", rn.cfg.configDir, err)
		return
	}

	var ready []string
	for _, e := range entries {
		if !e.IsDir() || !safeName(e.Name()) {
			continue
		}
		if _, err := os.Stat(filepath.Join(rn.cfg.configDir, e.Name(), instanceEnvFile)); err != nil {
			continue
		}
		inst, err := rn.loadInstance(e.Name())
		if err != nil {
			log.Printf("instance %q is not usable: %v", e.Name(), err)
			continue
		}
		ready = append(ready, fmt.Sprintf("%s -> %s", inst.name, inst.workdir))
	}
	sort.Strings(ready)

	if len(ready) == 0 {
		log.Printf("no usable instance in %s yet - each site is a subfolder with a %s in it",
			rn.cfg.configDir, instanceEnvFile)
		return
	}
	log.Printf("instances: %s", strings.Join(ready, ", "))
}

func (rn *runner) loadInstance(name string) (*instance, error) {
	path := filepath.Join(rn.cfg.configDir, name, instanceEnvFile)
	vars, err := parseEnvFile(path)
	if err != nil {
		return nil, err
	}

	secret := strings.TrimSpace(vars["TRIGGER_SECRET"])
	if secret == "" {
		return nil, fmt.Errorf("%s has no TRIGGER_SECRET - refusing to expose an unauthenticated trigger", path)
	}
	if strings.TrimSpace(vars["SITEMAP_GENAI_SITES"]) == "" {
		return nil, fmt.Errorf("%s has no SITEMAP_GENAI_SITES", path)
	}

	workdir, err := rn.cfg.resolveWorkdir(name, vars)
	if err != nil {
		return nil, err
	}

	inst := &instance{
		name:        name,
		workdir:     workdir,
		secret:      secret,
		branch:      valueOr(vars["MIRROR_BRANCH"], rn.cfg.branch),
		authorName:  valueOr(vars["GIT_AUTHOR_NAME"], rn.cfg.authorName),
		authorEmail: valueOr(vars["GIT_AUTHOR_EMAIL"], rn.cfg.authorEmail),
	}

	// The tool's environment: the container's, then the instance's file, then
	// WORKDIR last. exec uses the last value of a duplicate key, so a relative
	// WORKDIR left in the file from a host dry run cannot reach the tool.
	inst.env = os.Environ()
	for _, k := range sortedKeys(vars) {
		if k == "TRIGGER_SECRET" {
			// Only this server authenticates; the tool has no use for it.
			continue
		}
		inst.env = append(inst.env, k+"="+vars[k])
	}
	inst.env = append(inst.env, "WORKDIR="+workdir)

	return inst, nil
}

// resolveWorkdir locates the instance's mirror checkout. MIRROR_DIR names it
// below WORK_ROOT and defaults to the instance name, which is why an instance
// needs no docker-compose entry of its own: ./out is mounted once, as a whole.
// An absolute WORKDIR in the file wins - that one can only have been meant as
// a container path.
func (c config) resolveWorkdir(name string, vars map[string]string) (string, error) {
	if w := strings.TrimSpace(vars["WORKDIR"]); filepath.IsAbs(w) {
		return filepath.Clean(w), nil
	}
	dir := strings.TrimSpace(vars["MIRROR_DIR"])
	if dir == "" {
		dir = name
	}
	if filepath.IsAbs(dir) {
		return filepath.Clean(dir), nil
	}
	if strings.Contains(dir, "..") {
		return "", fmt.Errorf("MIRROR_DIR %q must stay below WORK_ROOT", dir)
	}
	return filepath.Join(c.workRoot, dir), nil
}

func valueOr(value, fallback string) string {
	if v := strings.TrimSpace(value); v != "" {
		return v
	}
	return fallback
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// parseEnvFile reads the KEY=VALUE subset of shell syntax these files use:
// comments, blank lines, an optional `export`, and a value that may be wrapped
// in single or double quotes. The quotes are not decoration - SITEMAP_GENAI_SITES
// is JSON, and its inner double quotes only survive inside single ones.
func parseEnvFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vars := map[string]string{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for line := 1; scanner.Scan(); line++ {
		text := strings.TrimSpace(scanner.Text())
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		text = strings.TrimPrefix(text, "export ")
		key, value, ok := strings.Cut(text, "=")
		if !ok {
			return nil, fmt.Errorf("%s:%d: not a KEY=VALUE line", path, line)
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return nil, fmt.Errorf("%s:%d: empty key", path, line)
		}
		vars[key] = unquote(strings.TrimSpace(value))
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return vars, nil
}

func unquote(value string) string {
	if len(value) >= 2 {
		if q := value[0]; (q == '\'' || q == '"') && value[len(value)-1] == q {
			return value[1 : len(value)-1]
		}
	}
	// An unquoted value ends at the first inline comment, as it would in a
	// shell: `KEY=value # note`.
	if i := strings.Index(value, " #"); i >= 0 {
		return strings.TrimSpace(value[:i])
	}
	return value
}

/* ------------------------------------------------------------------ Trigger */

func (rn *runner) handleTrigger(w http.ResponseWriter, r *http.Request, inst *instance) {
	if !validToken(r, inst.secret) {
		http.Error(w, "invalid or missing token\n", http.StatusUnauthorized)
		return
	}

	// Per instance, not per container: two sites have two checkouts and two
	// EdTechRAG repositories, so their syncs do not collide.
	rn.mu.Lock()
	if rn.busy[inst.name] {
		rn.mu.Unlock()
		http.Error(w, "a sync is already running\n", http.StatusConflict)
		return
	}
	rn.busy[inst.name] = true
	rn.mu.Unlock()

	go func() {
		defer func() {
			rn.mu.Lock()
			delete(rn.busy, inst.name)
			rn.mu.Unlock()
		}()
		if err := rn.runOnce(inst); err != nil {
			log.Printf("[%s] sync failed: %v", inst.name, err)
		}
	}()

	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte("sync started\n"))
}

// validToken accepts the secret as a bearer token (preferred - a curl call
// from CI) or as a query parameter (convenience for a manual click in the
// browser). The query form ends up in Traefik's access log and browser
// history, so prefer the header for anything automated.
func validToken(r *http.Request, secret string) bool {
	if auth := r.Header.Get("Authorization"); auth != "" {
		if constantTimeEqual(strings.TrimPrefix(auth, "Bearer "), secret) {
			return true
		}
	}
	return constantTimeEqual(r.URL.Query().Get("token"), secret)
}

func constantTimeEqual(a, b string) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func (rn *runner) runOnce(inst *instance) error {
	log.Printf("[%s] build %s (workdir %s)", inst.name, time.Now().UTC().Format(time.RFC3339), inst.workdir)
	if err := rn.runTool(inst, "-mode=build"); err != nil {
		return fmt.Errorf("build: %w", err)
	}

	log.Printf("[%s] diff", inst.name)
	if err := rn.runTool(inst, "-mode=diff"); err != nil {
		return fmt.Errorf("diff: %w", err)
	}

	changed, err := inst.hasStagedChanges()
	if err != nil {
		return fmt.Errorf("check staged changes: %w", err)
	}
	if !changed {
		log.Printf("[%s] nothing changed - no push, no notify", inst.name)
		return nil
	}

	if err := inst.commitAndPush(); err != nil {
		return fmt.Errorf("push: %w", err)
	}

	log.Printf("[%s] notify", inst.name)
	if err := rn.runTool(inst, "-mode=notify"); err != nil {
		return fmt.Errorf("notify: %w", err)
	}
	log.Printf("[%s] done", inst.name)
	return nil
}

func (rn *runner) runTool(inst *instance, arg string) error {
	cmd := exec.Command(rn.cfg.toolBin, arg)
	// The tool resolves everything from WORKDIR, so this only keeps relative
	// paths and git commands of a run inside that instance's checkout.
	cmd.Dir = inst.workdir
	cmd.Env = inst.env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (inst *instance) git(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = inst.workdir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return nil
}

func (inst *instance) hasStagedChanges() (bool, error) {
	cmd := exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = inst.workdir
	switch err := cmd.Run(); {
	case err == nil:
		return false, nil
	default:
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return true, nil
		}
		return false, err
	}
}

func (inst *instance) commitAndPush() error {
	if err := inst.git("config", "user.name", inst.authorName); err != nil {
		return err
	}
	if err := inst.git("config", "user.email", inst.authorEmail); err != nil {
		return err
	}
	msg := fmt.Sprintf("genai sync %s [skip ci]", time.Now().UTC().Format(time.RFC3339))
	if err := inst.git("commit", "-m", msg); err != nil {
		return err
	}
	return inst.git("push", "origin", "HEAD:"+inst.branch)
}
