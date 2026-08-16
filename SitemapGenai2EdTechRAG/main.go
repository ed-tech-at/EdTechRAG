package main

// SitemapGenai2EdTechRAG - mirrors GenAI sitemaps into a git repository and tells
// EdTechRAG to re-index what changed.
//
//	go run . -mode=build    # fetch the sitemaps and write the .md files
//	go run . -mode=diff     # stage everything and write changes.json
//	go run . -mode=notify   # POST /pull -> /chunk -> /embed, once per site
//
// Three modes and not one run, because the CI pipeline has three stages: the
// middle one commits and pushes, and that is git's job, not this tool's. Splitting
// it also means a failed push cannot leave EdTechRAG indexing content that never
// arrived in the repository.
//
// Sibling of GitLab2EdTechRAG and Github2EdTechRAG: one flat main.go, standard
// library only, HMAC-SHA256 over the raw body as X-Signature.

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

/* ------------------------------------------------------------------ Konstanten */

const (
	// The namespace of the metadata elements. Identical in TELucation and FLAAIT
	// on purpose, so this parser only has to know one.
	genaiNS = "https://ed-tech.at/ns/sitemap-genai/1"

	// The directory a GenAI sitemap and its .md files live in, on the website.
	// Everything below it becomes the path inside the mirror repository.
	genaiDir = "sitemap-genai"

	// Guard rails. A website that starts serving HTML or something enormous under
	// a .md address must not be able to flood the repository.
	maxFileBytes    = 2 << 20 // 2 MiB per document
	maxDocsPerSite  = 5000
	maxSitemapBytes = 32 << 20
	httpTimeout     = 2 * time.Minute
	notifyTimeout   = 10 * time.Minute
)

/* ------------------------------------------------------------------ Konfiguration */

// A site to mirror. Configured as JSON in SITEMAP_GENAI_SITES, because the three
// values belong together - a sitemap URL without its repository_path is useless,
// and three parallel env vars would let them drift apart.
type site struct {
	// Directory inside the mirror repository. Also the prefix of every path sent
	// to EdTechRAG.
	Key string `json:"key"`
	// Absolute URL of sitemap-genai.xml.
	Sitemap string `json:"sitemap"`
	// updateConfig.repository_path of the EdTechRAG repository row. MUST match
	// exactly, otherwise parseGitLabApiRequest answers 404 "Repository not found".
	// One row per site, so a search stays inside one website.
	RepositoryPath string `json:"repository_path"`
}

type config struct {
	sites    []site
	endpoint string
	secret   string
	workdir  string
}

/* ------------------------------------------------------------------ Sitemap */

// Only the fields this tool needs. <genai:meta> is skipped deliberately: the same
// facts are already inside every .md file as HTML comments, and EdTechRAG reads
// them from there (getMetaDataOutOfMd). Parsing them here as well would be a
// second source for the same statement.
type sitemapURL struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod"`
}

type urlset struct {
	XMLName xml.Name     `xml:"urlset"`
	URLs    []sitemapURL `xml:"url"`
}

/* ------------------------------------------------------------------ Aenderungen */

type movedEntry struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// The shape /api/gitlab/pull expects under "changes".
type changeSet struct {
	Added    []string     `json:"added"`
	Modified []string     `json:"modified"`
	Deleted  []string     `json:"deleted"`
	Moved    []movedEntry `json:"moved"`
}

func (c changeSet) empty() bool {
	return len(c.Added) == 0 && len(c.Modified) == 0 && len(c.Deleted) == 0 && len(c.Moved) == 0
}

func (c changeSet) count() int {
	return len(c.Added) + len(c.Modified) + len(c.Deleted) + len(c.Moved)
}

// What -mode=diff writes and -mode=notify reads. Keyed by site.Key, so notify can
// send one payload per EdTechRAG repository without re-reading the git state.
//
// Only base_sha is recorded here: it is the commit the previous index reflects,
// and it exists at diff time. The commit that CONTAINS the new content does not -
// the push stage creates it afterwards - so notify reads HEAD itself.
type changesFile struct {
	BaseSHA string               `json:"base_sha"`
	Sites   map[string]changeSet `json:"sites"`
}

/* ------------------------------------------------------------------ Werkzeuge */

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stdout, format+"\n", args...)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func env(key string) string { return strings.TrimSpace(os.Getenv(key)) }

func loadConfig() config {
	raw := env("SITEMAP_GENAI_SITES")
	if raw == "" {
		fatalf("SITEMAP_GENAI_SITES is missing (JSON array of {key, sitemap, repository_path})")
	}

	var sites []site
	if err := json.Unmarshal([]byte(raw), &sites); err != nil {
		fatalf("SITEMAP_GENAI_SITES is not valid JSON: %v", err)
	}
	if len(sites) == 0 {
		fatalf("SITEMAP_GENAI_SITES is an empty list")
	}

	seen := map[string]bool{}
	for _, s := range sites {
		if s.Key == "" || s.Sitemap == "" || s.RepositoryPath == "" {
			fatalf("site %q: key, sitemap and repository_path are all required", s.Key)
		}
		// The key becomes a directory name and a path prefix. A key with a slash or
		// a '..' in it would let a sitemap write outside its own subtree.
		if s.Key != safeSegment(s.Key) {
			fatalf("site %q: key must be a single path segment without '..'", s.Key)
		}
		if seen[s.Key] {
			fatalf("site %q: key appears twice", s.Key)
		}
		seen[s.Key] = true
		if _, err := url.Parse(s.Sitemap); err != nil {
			fatalf("site %q: sitemap is not a valid URL: %v", s.Key, err)
		}
	}

	workdir := env("WORKDIR")
	if workdir == "" {
		workdir = "./out"
	}

	return config{
		sites:    sites,
		endpoint: env("SitemapGenai2EdTechRAG_ENDPOINT"),
		secret:   env("SitemapGenai2EdTechRAG_SHARED_SECRET"),
		workdir:  workdir,
	}
}

// A path segment that cannot escape its directory. Returns "" when the input is
// unusable, so callers can compare instead of having to check a second error.
func safeSegment(segment string) string {
	if segment == "" || segment == "." || segment == ".." {
		return ""
	}
	if strings.ContainsAny(segment, "/\\") || strings.Contains(segment, "..") {
		return ""
	}
	return segment
}

/*
Where a <loc> lands inside the mirror repository.

The website serves /sitemap-genai/<path>.md; inside the repository that becomes
<key>/<path>.md. Everything is checked rather than trusted: the sitemap comes over
the network, and a crafted <loc> with '../..' in it would otherwise write anywhere
on the runner.
*/
func repoPathFor(s site, loc string) (string, error) {
	parsed, err := url.Parse(loc)
	if err != nil {
		return "", fmt.Errorf("<loc> is not a valid URL: %q", loc)
	}

	clean := path.Clean(parsed.Path)
	prefix := "/" + genaiDir + "/"
	if !strings.HasPrefix(clean, prefix) {
		return "", fmt.Errorf("<loc> is not below %s: %q", prefix, loc)
	}
	if !strings.HasSuffix(clean, ".md") {
		return "", fmt.Errorf("<loc> is not a .md file: %q", loc)
	}

	rel := strings.TrimPrefix(clean, prefix)
	for _, segment := range strings.Split(rel, "/") {
		if safeSegment(segment) == "" {
			return "", fmt.Errorf("<loc> has an unusable path segment: %q", loc)
		}
	}

	return s.Key + "/" + rel, nil
}

/*
Where a document is actually fetched from.

The <loc> entries are absolute and carry the website's PUBLIC origin - the one its
generator was built with, not necessarily the one this sitemap was served from. A
local or staging checkout therefore announces production addresses, and following
them would mirror production while claiming to mirror the checkout. Mirroring the
host that was asked for is the only defensible reading of `sitemap`.

In production both are the same host, so this changes nothing there.

Only the origin is replaced. The path stays untouched, so repoPathFor still sees
the address the website published - and the citation URLs inside the .md files are
not this tool's business anyway.
*/
func documentURL(sitemap string, loc string) (string, error) {
	base, err := url.Parse(sitemap)
	if err != nil {
		return "", fmt.Errorf("sitemap is not a valid URL: %q", sitemap)
	}
	target, err := url.Parse(loc)
	if err != nil {
		return "", fmt.Errorf("<loc> is not a valid URL: %q", loc)
	}

	fetchFrom := *base
	fetchFrom.Path = target.Path
	fetchFrom.RawPath = target.RawPath
	fetchFrom.RawQuery = target.RawQuery
	fetchFrom.Fragment = ""

	return fetchFrom.String(), nil
}

func fetch(client *http.Client, target string, limit int64) ([]byte, string, error) {
	resp, err := client.Get(target)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("status %s", resp.Status)
	}

	// LimitReader with one extra byte, so an oversized body is detected instead of
	// being silently truncated into a valid-looking document.
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(body)) > limit {
		return nil, "", fmt.Errorf("body larger than %d bytes", limit)
	}

	return body, resp.Header.Get("Content-Type"), nil
}

/* ------------------------------------------------------------------ mode=build */

func runBuild(cfg config) {
	client := &http.Client{Timeout: httpTimeout}

	for _, s := range cfg.sites {
		logf("== %s: %s", s.Key, s.Sitemap)

		xmlBody, _, err := fetch(client, s.Sitemap, maxSitemapBytes)
		if err != nil {
			fatalf("%s: fetching the sitemap failed: %v", s.Key, err)
		}

		var set urlset
		if err := xml.Unmarshal(xmlBody, &set); err != nil {
			fatalf("%s: the sitemap is not valid XML: %v", s.Key, err)
		}
		if len(set.URLs) == 0 {
			// Not an error we can recover from by writing an empty tree: that would
			// delete every document of this site from the index.
			fatalf("%s: the sitemap lists no <url> - refusing to empty the mirror", s.Key)
		}
		if len(set.URLs) > maxDocsPerSite {
			fatalf("%s: %d documents exceed the limit of %d", s.Key, len(set.URLs), maxDocsPerSite)
		}

		/*
		 * The site directory is rebuilt from scratch. That is what makes DELETIONS
		 * work: git compares the working tree, so a document missing from the new
		 * sitemap has to be missing from the directory - otherwise it would stay in
		 * the repository and in the vector database forever.
		 *
		 * Only this one subdirectory is removed. .git and the other sites live
		 * beside it and are untouched; the key was checked to be a single segment.
		 */
		siteDir := filepath.Join(cfg.workdir, s.Key)
		if err := os.RemoveAll(siteDir); err != nil {
			fatalf("%s: clearing %s failed: %v", s.Key, siteDir, err)
		}
		if err := os.MkdirAll(siteDir, 0o755); err != nil {
			fatalf("%s: creating %s failed: %v", s.Key, siteDir, err)
		}

		// The sitemap itself is kept next to the documents: it is the record of what
		// the website claimed at the time of this commit.
		if err := os.WriteFile(filepath.Join(siteDir, genaiDir+".xml"), xmlBody, 0o644); err != nil {
			fatalf("%s: writing the sitemap copy failed: %v", s.Key, err)
		}

		written := 0
		for _, entry := range set.URLs {
			loc := strings.TrimSpace(entry.Loc)
			if loc == "" {
				continue
			}

			repoPath, err := repoPathFor(s, loc)
			if err != nil {
				fatalf("%s: %v", s.Key, err)
			}

			docURL, err := documentURL(s.Sitemap, loc)
			if err != nil {
				fatalf("%s: %v", s.Key, err)
			}

			body, contentType, err := fetch(client, docURL, maxFileBytes)
			if err != nil {
				fatalf("%s: fetching %s failed: %v", s.Key, docURL, err)
			}
			// A .md address answering with HTML is a misconfigured server or a
			// captive portal; indexing that would poison the repository quietly.
			if ct := strings.ToLower(contentType); ct != "" && !strings.Contains(ct, "markdown") && !strings.Contains(ct, "text/plain") {
				fatalf("%s: %s answered with Content-Type %q, expected markdown", s.Key, docURL, contentType)
			}

			target := filepath.Join(cfg.workdir, filepath.FromSlash(repoPath))
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				fatalf("%s: creating %s failed: %v", s.Key, filepath.Dir(target), err)
			}
			if err := os.WriteFile(target, body, 0o644); err != nil {
				fatalf("%s: writing %s failed: %v", s.Key, target, err)
			}
			written++
		}

		logf("%s: %d documents written to %s", s.Key, written, siteDir)
	}
}

/* ------------------------------------------------------------------ mode=diff */

func gitOut(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func runDiff(cfg config) {
	if _, err := gitOut(cfg.workdir, "rev-parse", "--git-dir"); err != nil {
		fatalf("%s is not a git repository: %v", cfg.workdir, err)
	}

	if _, err := gitOut(cfg.workdir, "add", "-A"); err != nil {
		fatalf("staging failed: %v", err)
	}

	/*
	 * The base of the diff, resolved to a real SHA - not the string "HEAD". It ends
	 * up in the payload as base_sha and is stored as document metadata; a literal
	 * "HEAD" there would name a moving target and be worthless in six months.
	 *
	 * Without a HEAD - the very first run against an empty repository - the empty
	 * tree takes its place. Otherwise git reports nothing as added at all.
	 */
	base := ""
	if head, err := gitOut(cfg.workdir, "rev-parse", "--verify", "HEAD"); err == nil {
		base = strings.TrimSpace(head)
	} else {
		emptyTree, treeErr := gitOut(cfg.workdir, "hash-object", "-t", "tree", os.DevNull)
		if treeErr != nil {
			fatalf("determining the empty tree failed: %v", treeErr)
		}
		base = strings.TrimSpace(emptyTree)
	}

	out := changesFile{BaseSHA: strings.TrimSpace(base), Sites: map[string]changeSet{}}

	total := 0
	for _, s := range cfg.sites {
		// -z because paths may contain anything, -M so a renamed document becomes a
		// move instead of a delete plus an add - EdTechRAG handles moves without
		// re-embedding.
		raw, err := gitOut(cfg.workdir, "diff", "--cached", "--name-status", "-z", "-M", out.BaseSHA, "--", s.Key+"/")
		if err != nil {
			fatalf("%s: diff failed: %v", s.Key, err)
		}

		set := onlyDocuments(parseNameStatusZ(raw))
		out.Sites[s.Key] = set
		total += set.count()
		logf("%s: %d added, %d modified, %d deleted, %d moved",
			s.Key, len(set.Added), len(set.Modified), len(set.Deleted), len(set.Moved))
	}

	target := filepath.Join(cfg.workdir, "changes.json")
	body, err := json.MarshalIndent(out, "", "\t")
	if err != nil {
		fatalf("serialising changes.json failed: %v", err)
	}
	if err := os.WriteFile(target, append(body, '\n'), 0o644); err != nil {
		fatalf("writing %s failed: %v", target, err)
	}

	logf("changes.json written: %d changes in total", total)
}

/*
Only the documents - everything that is not a .md file drops out.

The sitemap copy beside them is the reason this exists: it is an audit record of
what the website claimed, it belongs in the commit, and it must NOT be announced
to EdTechRAG. Without the filter it becomes a DataFile, gets chunked and embedded,
and a search would return a wall of XML.

A whitelist rather than one exclusion, so anything else that ever lands in the
tree - a README, a .gitattributes, a stray .DS_Store - is out by default.
*/
func onlyDocuments(set changeSet) changeSet {
	isDoc := func(p string) bool { return strings.HasSuffix(strings.ToLower(p), ".md") }

	filtered := changeSet{Added: []string{}, Modified: []string{}, Deleted: []string{}, Moved: []movedEntry{}}
	for _, p := range set.Added {
		if isDoc(p) {
			filtered.Added = append(filtered.Added, p)
		}
	}
	for _, p := range set.Modified {
		if isDoc(p) {
			filtered.Modified = append(filtered.Modified, p)
		}
	}
	for _, p := range set.Deleted {
		if isDoc(p) {
			filtered.Deleted = append(filtered.Deleted, p)
		}
	}
	for _, m := range set.Moved {
		// Both sides have to be documents: a rename from or to something else is not
		// a move EdTechRAG can follow.
		if isDoc(m.From) && isDoc(m.To) {
			filtered.Moved = append(filtered.Moved, m)
		}
	}
	return filtered
}

/*
Parses `git diff --name-status -z`.

The format is NUL-separated fields, not lines: a status, then one path - or two
paths for R and C, which is why this cannot be a simple pairwise loop.
*/
func parseNameStatusZ(raw string) changeSet {
	set := changeSet{Added: []string{}, Modified: []string{}, Deleted: []string{}, Moved: []movedEntry{}}

	fields := strings.Split(raw, "\x00")
	for i := 0; i < len(fields); {
		status := strings.TrimSpace(fields[i])
		if status == "" {
			i++
			continue
		}

		letter := status[0]
		if letter == 'R' || letter == 'C' {
			if i+2 >= len(fields) {
				break
			}
			from, to := fields[i+1], fields[i+2]
			if from != "" && to != "" {
				if letter == 'R' {
					set.Moved = append(set.Moved, movedEntry{From: from, To: to})
				} else {
					// A copy has no source to invalidate - the original stays.
					set.Added = append(set.Added, to)
				}
			}
			i += 3
			continue
		}

		if i+1 >= len(fields) {
			break
		}
		p := fields[i+1]
		if p != "" {
			switch letter {
			case 'A':
				set.Added = append(set.Added, p)
			case 'M', 'T':
				set.Modified = append(set.Modified, p)
			case 'D':
				set.Deleted = append(set.Deleted, p)
			}
		}
		i += 2
	}

	sort.Strings(set.Added)
	sort.Strings(set.Modified)
	sort.Strings(set.Deleted)
	return set
}

/* ------------------------------------------------------------------ mode=notify */

type apiResponse struct {
	Success *bool  `json:"success"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func hmacHex(key string, msg []byte) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

func joinEndpoint(base string, endpointPath string) string {
	if base == "" {
		return endpointPath
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(endpointPath, "/")
}

func signedPost(client *http.Client, endpoint string, secret string, payload map[string]any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload for %s: %w", endpoint, err)
	}

	sig := hmacHex(secret, body)

	// The payload is NOT logged, unlike in GitLab2EdTechRAG: it lists every changed
	// path of the run, and a CI log is readable by everyone with project access.
	logf("POST %s (%d bytes)", endpoint, len(body))

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
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

	respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if readErr != nil {
		return fmt.Errorf("read response for %s: %w", endpoint, readErr)
	}

	logf("Response: %s", resp.Status)
	if len(respBody) > 0 {
		logf("%s", strings.TrimSpace(string(respBody)))
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status for %s: %s", endpoint, resp.Status)
	}

	// Same two failure shapes the sibling tools check: an explicit success:false
	// and the "partial" status, which means some files were skipped.
	var api apiResponse
	if err := json.Unmarshal(respBody, &api); err == nil {
		if api.Success != nil && !*api.Success {
			return fmt.Errorf("endpoint %s reported failure (%s): %s", endpoint, api.Status, api.Message)
		}
		if api.Status == "partial" {
			return fmt.Errorf("endpoint %s returned partial result: %s", endpoint, api.Message)
		}
	}

	return nil
}

func runNotify(cfg config) {
	if cfg.endpoint == "" {
		fatalf("SitemapGenai2EdTechRAG_ENDPOINT is missing")
	}
	/*
	 * The secret is not optional hardening, it is the authentication itself: in
	 * src/lib/server/gitlabApi.ts the HMAC check reads
	 * `if (signatureSecret && ...)`, so a repository row WITHOUT a stored secret
	 * accepts any request that carries some X-Signature header. Refusing to run
	 * without one keeps this tool from being the reason that hole is used.
	 */
	if cfg.secret == "" {
		fatalf("SitemapGenai2EdTechRAG_SHARED_SECRET is missing")
	}

	raw, err := os.ReadFile(filepath.Join(cfg.workdir, "changes.json"))
	if err != nil {
		fatalf("reading changes.json failed (run -mode=diff first): %v", err)
	}

	var changes changesFile
	if err := json.Unmarshal(raw, &changes); err != nil {
		fatalf("changes.json is not valid JSON: %v", err)
	}

	/*
	 * head_sha is determined HERE and not taken from changes.json: the commit that
	 * contains the new content is created by the push stage, which runs between diff
	 * and notify. At diff time it does not exist yet.
	 *
	 * GENAI_HEAD_SHA first, because in a pipeline the notify stage has a checkout of
	 * the commit the PIPELINE started from - not of the one the push stage just
	 * created. The push stage passes the real SHA in that variable (dotenv report,
	 * see .gitlab-ci.yml.example). Falling back to the local HEAD keeps a manual
	 * run correct, and empty is acceptable: EdTechRAG stores the value as metadata
	 * and never fetches by it.
	 */
	headSHA := env("GENAI_HEAD_SHA")
	if headSHA == "" {
		if out, err := gitOut(cfg.workdir, "rev-parse", "HEAD"); err == nil {
			headSHA = strings.TrimSpace(out)
		}
	}

	client := &http.Client{Timeout: notifyTimeout}
	notified := 0

	for _, s := range cfg.sites {
		set := changes.Sites[s.Key]
		if set.empty() {
			// /pull answers 400 "No changes provided" for an empty change set, so
			// skipping is correct rather than lenient.
			logf("%s: nothing changed, skipping", s.Key)
			continue
		}

		payload := map[string]any{
			"repository_path": s.RepositoryPath,
			"pipeline_source": env("CI_PIPELINE_SOURCE"),
			"base_sha":        changes.BaseSHA,
			"head_sha":        headSHA,
			// Unix seconds, and it must be fresh: parseGitLabApiRequest rejects a
			// payload older than five minutes. Stamped per site, immediately before
			// its own three requests, so a slow /chunk cannot age out the next site.
			"timestamp": time.Now().Unix(),
			"changes": map[string]any{
				"added":    set.Added,
				"modified": set.Modified,
				"deleted":  set.Deleted,
				"moved":    set.Moved,
			},
		}

		// Sequential and in this order: /pull records the files, /chunk fetches and
		// splits them, /embed vectorises what /chunk left pending. Each one drains
		// all pending work for the repository, so they are catch-up passes and safe
		// to repeat.
		for _, step := range []string{"/pull", "/chunk", "/embed"} {
			logf("%s: %s (%d changes)", s.Key, step, set.count())
			if err := signedPost(client, joinEndpoint(cfg.endpoint, step), cfg.secret, payload); err != nil {
				fatalf("%s: step %s failed: %v", s.Key, step, err)
			}
			// Refresh the timestamp between steps: /chunk can take minutes, and
			// /embed would otherwise be rejected as stale.
			payload["timestamp"] = time.Now().Unix()
		}
		notified++
	}

	logf("Done: %d of %d sites re-indexed", notified, len(cfg.sites))
}

/* ------------------------------------------------------------------ main */

func main() {
	mode := flag.String("mode", "", "build | diff | notify")
	flag.Parse()

	logf("SitemapGenai2EdTechRAG -mode=%s started %s", *mode, time.Now().Format(time.RFC3339))

	cfg := loadConfig()

	switch *mode {
	case "build":
		runBuild(cfg)
	case "diff":
		runDiff(cfg)
	case "notify":
		runNotify(cfg)
	default:
		fatalf("unknown -mode=%q (expected build, diff or notify)", *mode)
	}
}
