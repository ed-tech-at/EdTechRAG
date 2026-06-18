package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type config struct {
	addr           string
	githubSecret   string
	edtechEndpoint string
	edtechSecret   string
	publicBaseURL  string
	subfolder      string
	reposDir       string
	logDir         string
	sshKeyPath     string
}

type apiResponse struct {
	Success *bool  `json:"success"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type githubPushPayload struct {
	Ref        string         `json:"ref"`
	Before     string         `json:"before"`
	After      string         `json:"after"`
	Repository githubRepo     `json:"repository"`
	Commits    []githubCommit `json:"commits"`
	HeadCommit *githubCommit  `json:"head_commit"`
}

type githubRepo struct {
	FullName      string `json:"full_name"`
	SSHURL        string `json:"ssh_url"`
	CloneURL      string `json:"clone_url"`
	DefaultBranch string `json:"default_branch"`
}

type githubCommit struct {
	ID       string   `json:"id"`
	Added    []string `json:"added"`
	Modified []string `json:"modified"`
	Removed  []string `json:"removed"`
}

type movedEntry struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type changeSet struct {
	Added    []string
	Modified []string
	Deleted  []string
	Moved    []movedEntry
}

type filePayload struct {
	Path      string         `json:"path"`
	RemoteURL string         `json:"remoteUrl"`
	Meta      map[string]any `json:"meta,omitempty"`
}

type taskLog struct {
	file *os.File
	mu   sync.Mutex
}

var (
	repoNamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	shaPattern      = regexp.MustCompile(`^[0-9a-fA-F]{40}$`)
)

func main() {
	cfg := loadConfig()

	prefix := ""
	if cfg.subfolder != "" {
		prefix = "/" + cfg.subfolder
	}

	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc(prefix+"/webhook", cfg.handleWebhook)
	mux.HandleFunc(prefix+"/raw", cfg.handleRaw)

	log.Printf("Github2EdTechRAG listening on %s", cfg.addr)
	log.Fatal(http.ListenAndServe(cfg.addr, mux))
}

func loadConfig() config {
	return config{
		addr:           envOr("ADDR", ":8080"),
		githubSecret:   os.Getenv("GITHUBSECRET"),
		edtechEndpoint: firstEnv("Github2EdTechRAG_ENDPOINT", "EDTECHRAG_ENDPOINT"),
		edtechSecret:   firstEnv("Github2EdTechRAG_SHARED_SECRET", "GitLab2EdTechRAG_SHARED_SECRET", "EDTECHRAG_SHARED_SECRET"),
		publicBaseURL:  strings.TrimRight(envOr("PUBLIC_BASE_URL", "https://github2.edtechrag.local"), "/"),
		subfolder:      strings.Trim(envOr("SUBFOLDER", ""), "/"),
		reposDir:       envOr("GITHUB_REPOS_DIR", "/repos"),
		logDir:         envOr("LOG_DIR", "/log"),
		sshKeyPath:     envOr("GITHUB_SSH_KEY_PATH", "/app/.ssh/id_ed25519"),
	}
}

func envOr(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func (cfg config) handleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	taskLog, err := cfg.newTaskLog(r)
	if err != nil {
		log.Printf("failed to create task log: %v", err)
		http.Error(w, "failed to create task log", http.StatusInternalServerError)
		return
	}
	defer taskLog.Close()
	taskLog.Write("webhook request started: method=%s path=%s remote=%s", r.Method, r.URL.String(), r.RemoteAddr)

	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		taskLog.Write("failed to read request body: %v", err)
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	taskLog.Write("request body read: bytes=%d", len(rawBody))

	if cfg.githubSecret == "" {
		taskLog.Write("configuration error: GITHUBSECRET is missing")
		http.Error(w, "GITHUBSECRET is not configured", http.StatusInternalServerError)
		return
	}
	if !isGitHubSignatureValid(r.Header.Get("X-Hub-Signature-256"), cfg.githubSecret, rawBody) {
		taskLog.Write("github signature validation failed")
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}
	taskLog.Write("github signature validated")

	event := r.Header.Get("X-GitHub-Event")
	taskLog.Write("github event received: %s", event)
	if event == "ping" {
		taskLog.Write("ping event answered")
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "status": "pong"})
		return
	}
	if event != "push" {
		taskLog.Write("event ignored: %s", event)
		writeJSON(w, http.StatusAccepted, map[string]any{"success": true, "status": "ignored", "event": event})
		return
	}

	if cfg.edtechEndpoint == "" || cfg.edtechSecret == "" {
		taskLog.Write("configuration error: EdTechRAG endpoint or shared secret is missing")
		http.Error(w, "Github2EdTechRAG_ENDPOINT and Github2EdTechRAG_SHARED_SECRET are required", http.StatusInternalServerError)
		return
	}

	var payload githubPushPayload
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		taskLog.Write("invalid github JSON payload: %v", err)
		http.Error(w, "invalid JSON payload", http.StatusBadRequest)
		return
	}

	if err := payload.validate(); err != nil {
		taskLog.Write("github payload validation failed: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	taskLog.Write("github push payload accepted: repo=%s before=%s after=%s ref=%s", payload.Repository.FullName, payload.Before, payload.After, payload.Ref)

	branch := branchName(payload.Ref)
	if branch == "" {
		branch = payload.Repository.DefaultBranch
	}
	if branch == "" {
		branch = "main"
	}

	workdirPath := strings.TrimSpace(r.URL.Query().Get("path"))
	repoDir := ""
	if workdirPath != "" {
		taskLog.Write("using mounted repository path: /repos/%s", workdirPath)
		repoDir, err = cfg.prepareMountedRepository(workdirPath)
	} else {
		taskLog.Write("using automatic repository checkout")
		repoDir, err = cfg.prepareRepository(payload.Repository, branch)
	}
	if err != nil {
		log.Printf("repository preparation failed for %s: %v", payload.Repository.FullName, err)
		taskLog.Write("repository preparation failed: %v", err)
		http.Error(w, "repository preparation failed", http.StatusBadGateway)
		return
	}
	taskLog.Write("repository ready: dir=%s branch=%s", repoDir, branch)

	changes, err := detectChanges(repoDir, payload.Before, payload.After)
	if err != nil {
		log.Printf("git diff failed for %s: %v; falling back to webhook commits", payload.Repository.FullName, err)
		taskLog.Write("git diff failed, falling back to webhook commits: %v", err)
		changes = changesFromCommits(payload.Commits)
	}
	taskLog.Write("changes detected: added=%d modified=%d deleted=%d moved=%d", len(changes.Added), len(changes.Modified), len(changes.Deleted), len(changes.Moved))

	outgoing, err := cfg.buildEdTechPayload(r, payload, branch, workdirPath, changes)
	if err != nil {
		taskLog.Write("failed to build EdTechRAG payload: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	taskLog.Write("EdTechRAG payload built")

	client := &http.Client{Timeout: 10 * time.Minute}
	steps := []struct {
		name     string
		endpoint string
	}{
		{name: "pull", endpoint: joinEndpoint(cfg.edtechEndpoint, "/pull")},
		{name: "chunk", endpoint: joinEndpoint(cfg.edtechEndpoint, "/chunk")},
		{name: "embed", endpoint: joinEndpoint(cfg.edtechEndpoint, "/embed")},
	}

	for _, step := range steps {
		log.Printf("starting %s for %s", step.name, payload.Repository.FullName)
		taskLog.Write("starting EdTechRAG step: %s endpoint=%s", step.name, step.endpoint)
		if err := signedPost(client, step.endpoint, cfg.edtechSecret, outgoing, taskLog); err != nil {
			log.Printf("%s failed for %s: %v", step.name, payload.Repository.FullName, err)
			taskLog.Write("EdTechRAG step failed: %s error=%v", step.name, err)
			http.Error(w, fmt.Sprintf("%s failed", step.name), http.StatusBadGateway)
			return
		}
		taskLog.Write("EdTechRAG step completed: %s", step.name)
	}

	taskLog.Write("webhook task completed successfully")
	writeJSON(w, http.StatusOK, map[string]any{
		"success":    true,
		"repository": payload.Repository.FullName,
		"branch":     branch,
		"added":      len(changes.Added),
		"modified":   len(changes.Modified),
		"deleted":    len(changes.Deleted),
		"moved":      len(changes.Moved),
	})
}

func (cfg config) newTaskLog(r *http.Request) (*taskLog, error) {
	if err := os.MkdirAll(cfg.logDir, 0o755); err != nil {
		return nil, err
	}
	stamp := time.Now().UTC().Format("20060102T150405.000000000Z")
	delivery := safeFilename(r.Header.Get("X-GitHub-Delivery"))
	if delivery == "" {
		delivery = "no-delivery"
	}
	path := filepath.Join(cfg.logDir, stamp+"_"+delivery+".log")
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, err
	}
	taskLog := &taskLog{file: file}
	taskLog.Write("log file created: %s", path)
	return taskLog, nil
}

func (l *taskLog) Write(format string, args ...any) {
	if l == nil || l.file == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	line := fmt.Sprintf(format, args...)
	_, _ = fmt.Fprintf(l.file, "%s %s\n", time.Now().UTC().Format(time.RFC3339Nano), line)
}

func (l *taskLog) Close() {
	if l == nil || l.file == nil {
		return
	}
	l.Write("log file closed")
	_ = l.file.Close()
}

func (cfg config) handleRaw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query()
	repo := query.Get("repo")
	ref := query.Get("ref")
	path := query.Get("path")
	workdirPath := query.Get("workdir")

	if !repoNamePattern.MatchString(repo) || ref == "" || path == "" || !isSafeGitPath(path) {
		http.Error(w, "invalid raw file request", http.StatusBadRequest)
		return
	}

	repoDir := cfg.repoDir(repo)
	if workdirPath != "" {
		var err error
		repoDir, err = cfg.resolveMountedRepository(workdirPath)
		if err != nil {
			http.Error(w, "invalid repository path", http.StatusBadRequest)
			return
		}
	}
	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		http.Error(w, "repository not found", http.StatusNotFound)
		return
	}

	refspec := ref
	if !shaPattern.MatchString(ref) {
		refspec = "refs/remotes/origin/" + ref
	}

	content, err := gitOutput(cfg, repoDir, "show", refspec+":"+path)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	contentType := http.DetectContentType(content)
	if strings.HasPrefix(contentType, "text/plain") || strings.HasPrefix(contentType, "application/octet-stream") {
		contentType = "text/plain; charset=utf-8"
	}
	w.Header().Set("Content-Type", contentType)
	_, _ = w.Write(content)
}

func (payload githubPushPayload) validate() error {
	if !repoNamePattern.MatchString(payload.Repository.FullName) {
		return errors.New("repository.full_name is missing or invalid")
	}
	if payload.After == "" {
		return errors.New("after SHA is missing")
	}
	if payload.Repository.SSHURL == "" && payload.Repository.CloneURL == "" {
		return errors.New("repository clone URL is missing")
	}
	return nil
}

func (cfg config) prepareMountedRepository(subpath string) (string, error) {
	repoDir, err := cfg.resolveMountedRepository(subpath)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		return "", fmt.Errorf("%s is not a cloned git repository", repoDir)
	}
	if _, err := gitOutput(cfg, repoDir, "pull", "--ff-only"); err != nil {
		return "", err
	}
	return repoDir, nil
}

func (cfg config) resolveMountedRepository(subpath string) (string, error) {
	if !isSafeWorkdirPath(subpath) {
		return "", errors.New("path must be a relative subpath below GITHUB_REPOS_DIR")
	}

	root, err := filepath.Abs(cfg.reposDir)
	if err != nil {
		return "", err
	}
	repoDir, err := filepath.Abs(filepath.Join(root, filepath.Clean(subpath)))
	if err != nil {
		return "", err
	}

	rel, err := filepath.Rel(root, repoDir)
	if err != nil {
		return "", err
	}
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("path escapes GITHUB_REPOS_DIR")
	}
	return repoDir, nil
}

func (cfg config) prepareRepository(repo githubRepo, branch string) (string, error) {
	repoDir := cfg.repoDir(repo.FullName)
	cloneURL := repo.CloneURL
	if cfg.sshEnabled() && repo.SSHURL != "" {
		cloneURL = repo.SSHURL
	}

	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		if err := os.MkdirAll(filepath.Dir(repoDir), 0o755); err != nil {
			return "", err
		}
		if _, err := gitOutput(cfg, "", "clone", "--no-checkout", cloneURL, repoDir); err != nil {
			return "", err
		}
	} else {
		if _, err := gitOutput(cfg, repoDir, "remote", "set-url", "origin", cloneURL); err != nil {
			return "", err
		}
	}

	if _, err := gitOutput(cfg, repoDir, "fetch", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"); err != nil {
		return "", err
	}

	if branch != "" {
		_, _ = gitOutput(cfg, repoDir, "checkout", "-B", branch, "refs/remotes/origin/"+branch)
	}

	return repoDir, nil
}

func (cfg config) repoDir(fullName string) string {
	safe := strings.NewReplacer("/", "__").Replace(fullName)
	return filepath.Join(cfg.reposDir, safe)
}

func (cfg config) sshEnabled() bool {
	if cfg.sshKeyPath == "" {
		return false
	}
	info, err := os.Stat(cfg.sshKeyPath)
	return err == nil && !info.IsDir()
}

func gitOutput(cfg config, dir string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = os.Environ()
	if cfg.sshEnabled() {
		cmd.Env = append(cmd.Env, "GIT_SSH_COMMAND=ssh -i "+shellQuote(cfg.sshKeyPath)+" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/github_known_hosts")
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return out, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return out, nil
}

func detectChanges(repoDir string, before string, after string) (changeSet, error) {
	if isZeroSHA(after) {
		return changeSet{}, errors.New("delete-branch push does not have a head commit")
	}
	if isZeroSHA(before) {
		out, err := gitOutput(config{}, repoDir, "ls-tree", "-r", "--name-only", after)
		if err != nil {
			return changeSet{}, err
		}
		return changeSet{Added: lines(out)}, nil
	}

	out, err := gitOutput(config{}, repoDir, "diff", "--name-status", "-M", before, after)
	if err != nil {
		return changeSet{}, err
	}
	return parseNameStatus(string(out)), nil
}

func changesFromCommits(commits []githubCommit) changeSet {
	changes := changeSet{}
	for _, commit := range commits {
		changes.Added = append(changes.Added, commit.Added...)
		changes.Modified = append(changes.Modified, commit.Modified...)
		changes.Deleted = append(changes.Deleted, commit.Removed...)
	}
	changes.Added = uniqueStrings(changes.Added)
	changes.Modified = uniqueStrings(changes.Modified)
	changes.Deleted = uniqueStrings(changes.Deleted)
	return changes
}

func parseNameStatus(raw string) changeSet {
	changes := changeSet{}
	for _, line := range strings.Split(raw, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		status := parts[0]
		switch status[0] {
		case 'A':
			changes.Added = append(changes.Added, parts[1])
		case 'M', 'T':
			changes.Modified = append(changes.Modified, parts[1])
		case 'D':
			changes.Deleted = append(changes.Deleted, parts[1])
		case 'R':
			if len(parts) >= 3 {
				changes.Moved = append(changes.Moved, movedEntry{From: parts[1], To: parts[2]})
			}
		case 'C':
			if len(parts) >= 3 {
				changes.Added = append(changes.Added, parts[2])
			}
		}
	}
	changes.Added = uniqueStrings(changes.Added)
	changes.Modified = uniqueStrings(changes.Modified)
	changes.Deleted = uniqueStrings(changes.Deleted)
	return changes
}

func (cfg config) buildEdTechPayload(r *http.Request, payload githubPushPayload, branch string, workdirPath string, changes changeSet) (map[string]any, error) {
	baseURL := cfg.publicBaseURL
	if baseURL == "" {
		baseURL = requestBaseURL(r)
	}
	if cfg.subfolder != "" {
		baseURL = strings.TrimRight(baseURL, "/") + "/" + cfg.subfolder
	}

	toRawURLs := func(paths []string) []string {
		urls := make([]string, 0, len(paths))
		for _, path := range paths {
			urls = append(urls, rawURL(baseURL, payload.Repository.FullName, branch, workdirPath, path))
		}
		return urls
	}

	toMovedURLs := func(entries []movedEntry) []movedEntry {
		urls := make([]movedEntry, 0, len(entries))
		for _, entry := range entries {
			urls = append(urls, movedEntry{
				From: rawURL(baseURL, payload.Repository.FullName, branch, workdirPath, entry.From),
				To:   rawURL(baseURL, payload.Repository.FullName, branch, workdirPath, entry.To),
			})
		}
		return urls
	}

	files := make([]filePayload, 0, len(changes.Added)+len(changes.Modified)+len(changes.Moved))
	addFile := func(path string) {
		files = append(files, filePayload{
			Path:      path,
			RemoteURL: rawURL(baseURL, payload.Repository.FullName, branch, workdirPath, path),
			Meta: map[string]any{
				"source":                "github",
				"path":                  path,
				"workdir":               workdirPath,
				"branch":                branch,
				"ref":                   payload.Ref,
				"repository_full_name":  payload.Repository.FullName,
				"github_default_branch": payload.Repository.DefaultBranch,
			},
		})
	}
	for _, path := range changes.Added {
		addFile(path)
	}
	for _, path := range changes.Modified {
		addFile(path)
	}
	for _, entry := range changes.Moved {
		addFile(entry.To)
	}

	return map[string]any{
		"repository_path": payload.Repository.FullName,
		"pipeline_source": "github_webhook",
		"base_sha":        payload.Before,
		"head_sha":        payload.After,
		"timestamp":       time.Now().Unix(),
		"files":           files,
		"changes": map[string]any{
			"added":    toRawURLs(changes.Added),
			"modified": toRawURLs(changes.Modified),
			"deleted":  toRawURLs(changes.Deleted),
			"moved":    toMovedURLs(changes.Moved),
		},
		"github": map[string]any{
			"ref":        payload.Ref,
			"branch":     branch,
			"repository": payload.Repository.FullName,
		},
	}, nil
}

func signedPost(client *http.Client, endpoint string, secret string, payload map[string]any, taskLog *taskLog) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload for %s: %w", endpoint, err)
	}
	taskLog.Write("sending signed POST: endpoint=%s payload_bytes=%d", endpoint, len(body))

	sig := hmacHex(secret, body)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request for %s: %w", endpoint, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", "sha256="+sig)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed for %s: %w", endpoint, err)
	}
	defer resp.Body.Close()
	taskLog.Write("received response: endpoint=%s status=%s", endpoint, resp.Status)

	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return fmt.Errorf("read response for %s: %w", endpoint, readErr)
	}
	if len(respBody) > 0 {
		taskLog.Write("response body: endpoint=%s bytes=%d body=%s", endpoint, len(respBody), strings.TrimSpace(string(respBody)))
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status for %s: %s: %s", endpoint, resp.Status, strings.TrimSpace(string(respBody)))
	}

	var apiResp apiResponse
	if err := json.Unmarshal(respBody, &apiResp); err == nil {
		if apiResp.Success != nil && !*apiResp.Success {
			if apiResp.Message != "" {
				return fmt.Errorf("endpoint %s reported failure (%s): %s", endpoint, apiResp.Status, apiResp.Message)
			}
			return fmt.Errorf("endpoint %s reported failure (%s)", endpoint, apiResp.Status)
		}

		if apiResp.Status == "partial" {
			if apiResp.Message != "" {
				return fmt.Errorf("endpoint %s returned partial result: %s", endpoint, apiResp.Message)
			}
			return fmt.Errorf("endpoint %s returned partial result", endpoint)
		}
	}

	return nil
}

func isGitHubSignatureValid(provided string, secret string, body []byte) bool {
	if provided == "" {
		return false
	}
	provided = strings.TrimPrefix(strings.ToLower(provided), "sha256=")
	expected := hmacHex(secret, body)
	return hmac.Equal([]byte(expected), []byte(provided))
}

func hmacHex(key string, msg []byte) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

func joinEndpoint(base string, endpointPath string) string {
	parsed := strings.TrimRight(base, "/")
	return parsed + "/" + strings.TrimLeft(endpointPath, "/")
}

func branchName(ref string) string {
	return strings.TrimPrefix(ref, "refs/heads/")
}

func isZeroSHA(value string) bool {
	if value == "" {
		return true
	}
	return strings.Trim(value, "0") == ""
}

func rawURL(baseURL string, repo string, ref string, workdir string, path string) string {
	u, _ := url.Parse(strings.TrimRight(baseURL, "/") + "/raw")
	q := u.Query()
	q.Set("repo", repo)
	q.Set("ref", ref)
	if workdir != "" {
		q.Set("workdir", workdir)
	}
	q.Set("path", path)
	u.RawQuery = q.Encode()
	return u.String()
}

func requestBaseURL(r *http.Request) string {
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		scheme = "http"
	}
	return scheme + "://" + r.Host
}

func isSafeGitPath(path string) bool {
	return !strings.HasPrefix(path, "/") &&
		!strings.Contains(path, "\x00") &&
		!strings.Contains(path, "../") &&
		path != ".."
}

func isSafeWorkdirPath(path string) bool {
	if path == "" || filepath.IsAbs(path) || strings.Contains(path, "\x00") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(path))
	if clean == "." {
		return false
	}
	for _, part := range strings.Split(clean, "/") {
		if part == ".." {
			return false
		}
	}
	return true
}

func lines(out []byte) []string {
	values := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(values) == 1 && values[0] == "" {
		return nil
	}
	return uniqueStrings(values)
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func safeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('_')
	}
	return strings.Trim(builder.String(), "._")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
