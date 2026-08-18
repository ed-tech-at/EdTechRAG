package main

// HTTP front door for SitemapGenai2EdTechRAG, for setups where the tool runs
// as a long-lived container on its own server instead of as GitLab CI stages.
//
// GET/POST {SUBFOLDER}/trigger starts one run of the tool's three modes
// against WORKDIR - build, diff, and (if anything changed) commit+push+notify
// - and returns immediately; the run itself continues in the background and
// its own commit is what would otherwise start the next pipeline, so this
// server never re-triggers itself. Sibling of the SitemapGenai2EdTechRAG
// binary, not a replacement: this file only adds the network-reachable
// trigger and the commit+push step, which is git's job and was previously
// entrypoint.sh's.
//
//	curl -X POST -H "Authorization: Bearer $TRIGGER_SECRET" https://.../trigger

import (
	"crypto/subtle"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type config struct {
	addr        string
	secret      string
	subfolder   string
	workdir     string
	toolBin     string
	branch      string
	authorName  string
	authorEmail string
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
		secret:      os.Getenv("TRIGGER_SECRET"),
		subfolder:   strings.Trim(envOr("SUBFOLDER", ""), "/"),
		workdir:     envOr("WORKDIR", "/work"),
		toolBin:     envOr("TOOL_BIN", "/usr/local/bin/sitemapgenai2edtechrag"),
		branch:      envOr("MIRROR_BRANCH", "main"),
		authorName:  envOr("GIT_AUTHOR_NAME", "GenAI Sync"),
		authorEmail: envOr("GIT_AUTHOR_EMAIL", "noreply@tugraz.at"),
	}
}

type runner struct {
	cfg  config
	mu   sync.Mutex
	busy bool
}

func main() {
	cfg := loadConfig()
	if cfg.secret == "" {
		log.Fatal("TRIGGER_SECRET is missing - refusing to start an unauthenticated trigger endpoint")
	}
	setupSSH()

	prefix := ""
	if cfg.subfolder != "" {
		prefix = "/" + cfg.subfolder
	}

	rn := &runner{cfg: cfg}

	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc(prefix+"/trigger", rn.handleTrigger)

	log.Printf("sitemapgenai2edtechrag-trigger listening on %s (prefix %q, workdir %q)", cfg.addr, prefix, cfg.workdir)
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

func (rn *runner) handleTrigger(w http.ResponseWriter, r *http.Request) {
	if !validToken(r, rn.cfg.secret) {
		http.Error(w, "invalid or missing token\n", http.StatusUnauthorized)
		return
	}

	rn.mu.Lock()
	if rn.busy {
		rn.mu.Unlock()
		http.Error(w, "a sync is already running\n", http.StatusConflict)
		return
	}
	rn.busy = true
	rn.mu.Unlock()

	go func() {
		defer func() {
			rn.mu.Lock()
			rn.busy = false
			rn.mu.Unlock()
		}()
		if err := rn.runOnce(); err != nil {
			log.Printf("sync failed: %v", err)
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

func (rn *runner) runOnce() error {
	log.Printf("build %s", time.Now().UTC().Format(time.RFC3339))
	if err := rn.runTool("-mode=build"); err != nil {
		return fmt.Errorf("build: %w", err)
	}

	log.Printf("diff")
	if err := rn.runTool("-mode=diff"); err != nil {
		return fmt.Errorf("diff: %w", err)
	}

	changed, err := rn.hasStagedChanges()
	if err != nil {
		return fmt.Errorf("check staged changes: %w", err)
	}
	if !changed {
		log.Printf("nothing changed - no push, no notify")
		return nil
	}

	if err := rn.commitAndPush(); err != nil {
		return fmt.Errorf("push: %w", err)
	}

	log.Printf("notify")
	if err := rn.runTool("-mode=notify"); err != nil {
		return fmt.Errorf("notify: %w", err)
	}
	log.Printf("done")
	return nil
}

func (rn *runner) runTool(arg string) error {
	cmd := exec.Command(rn.cfg.toolBin, arg)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (rn *runner) git(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = rn.cfg.workdir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return nil
}

func (rn *runner) hasStagedChanges() (bool, error) {
	cmd := exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = rn.cfg.workdir
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

func (rn *runner) commitAndPush() error {
	if err := rn.git("config", "user.name", rn.cfg.authorName); err != nil {
		return err
	}
	if err := rn.git("config", "user.email", rn.cfg.authorEmail); err != nil {
		return err
	}
	msg := fmt.Sprintf("genai sync %s [skip ci]", time.Now().UTC().Format(time.RFC3339))
	if err := rn.git("commit", "-m", msg); err != nil {
		return err
	}
	return rn.git("push", "origin", "HEAD:"+rn.cfg.branch)
}
