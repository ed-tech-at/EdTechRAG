# SitemapGenai2EdTechRAG

Mirrors the **GenAI sitemaps** of the TELucation and FLAAIT websites into a GitLab
repository and tells EdTechRAG to re-index what changed.

Sibling of `GitLab2EdTechRAG` and `Github2EdTechRAG`: one flat `main.go`, standard
library only, HMAC-SHA256 over the raw body as `X-Signature`, and the same
`/pull` → `/chunk` → `/embed` chain.

## What it does

Both websites are statically generated and publish, next to their normal
`sitemap.xml`, a second one:

```
https://telucation.tugraz.at/sitemap-genai/sitemap-genai.xml
https://flaait.tugraz.at/sitemap-genai/sitemap-genai.xml
```

Its `<loc>` entries do **not** point at HTML pages but at the Markdown version of
each page, `/sitemap-genai/<path>.md`. Every `.md` file carries its metadata as
HTML comments in the head:

```
<!-- URL: https://telucation.tugraz.at/beitraege/tools/08-prompt-engineering/ -->
<!-- URL_EN: https://telucation.tugraz.at/en/articles/tools/08-prompt-engineering/ -->
<!-- TYPE: article -->
<!-- CATEGORY: tools -->
```

That form is not a convention of this tool, it is the interface: EdTechRAG parses
exactly these comments (`getMetaDataOutOfMd` in
`sveltekit/src/lib/server/textSplitter.ts`), lowercases the keys, replaces spaces
with `_` and strips the comments before chunking. `meta.url` therefore becomes the
citation address — the human-readable page, not the GitLab path the text was
fetched from.

The tool itself only moves files and reports changes. It never parses the
metadata: the same facts also sit in `<genai:meta>` in the XML, and reading them
here would be a second source for one statement.

## The three modes

```bash
go run . -mode=build    # fetch the sitemaps, write the .md files
go run . -mode=diff     # stage everything, write changes.json
go run . -mode=notify   # POST /pull -> /chunk -> /embed, once per site
```


```bash
set -a && . ./.env && set +a && go run . -mode=build
```

Three modes rather than one run, because the pipeline has three stages and the
middle one is git's job. It also means a failed push cannot leave EdTechRAG
indexing content that never arrived in the repository.

**`-mode=build`** rebuilds each site directory from scratch. That is what makes
deletions work: git compares the working tree, so a page that vanished from the
sitemap has to vanish from the directory — otherwise it would stay in the
repository and in the vector database forever. Only the site's own subdirectory is
removed; `.git` and the other sites are untouched.

Documents are fetched from the **origin of `sitemap`**, not from the host inside
`<loc>`. Only the path of a `<loc>` is used. The two are the same in production, but
a local or staging build announces the site's public addresses — following those
would mirror production while claiming to mirror the checkout. The addresses inside
the `.md` files are untouched, so a citation still points at the public page.

It refuses to continue when a sitemap lists no `<url>` (that would empty the
mirror), when a `<loc>` is not a `.md` file below `/sitemap-genai/`, when a path
tries to escape its directory, when a document is larger than 2 MiB, or when a
`.md` address answers with something other than markdown or plain text.

**`-mode=diff`** runs `git add -A` and `git diff --cached --name-status -z -M`
per site, and writes `changes.json`. `-M` makes a renamed page a *move* instead of
a delete plus an add — EdTechRAG follows moves without re-embedding. Only `.md`
paths are reported: the archived copy of `sitemap-genai.xml` belongs in the commit
but must not become an indexed document.

**`-mode=notify`** sends one payload **per site**, so each website lands in its
own EdTechRAG repository row. A site with no changes is skipped — `/pull` answers
`400 No changes provided` for an empty change set, so skipping is correct rather
than lenient. The timestamp is refreshed between the three steps, because
`parseGitLabApiRequest` rejects payloads older than five minutes and `/chunk` can
take minutes.

## Configuration

See `.env.example`. Four variables matter:

| Variable | Meaning |
| --- | --- |
| `SITEMAP_GENAI_SITES` | JSON array of `{key, sitemap, repository_path}` |
| `SitemapGenai2EdTechRAG_ENDPOINT` | base of the ingest API, without `/pull` |
| `SitemapGenai2EdTechRAG_SHARED_SECRET` | shared secret of the repository rows |
| `WORKDIR` | the git checkout of the mirror repository |

⚠️ **The shared secret is the authentication, not optional hardening.** In
`sveltekit/src/lib/server/gitlabApi.ts` the HMAC check reads
`if (signatureSecret && ...)` — a repository row **without** a stored secret
accepts any request that carries some `X-Signature` header and a valid
`repository_path`. `-mode=notify` refuses to start without a secret so this tool
cannot be the reason that hole gets used.

## What to set up in EdTechRAG

**One repository row per website**, at `/admin/repositories/<encoded-url>`.
Two rows and not one, because the search embed searches *one* repository: with
both sites in one row, a search on `telucation.tugraz.at` would also return FLAAIT
pages.

Per row:

| Field | Value |
| --- | --- |
| EdTechRAG URL | anything unique, e.g. `telucation.tugraz.at` |
| `repository_path` | **exactly** the value from `SITEMAP_GENAI_SITES` |
| `gitlab_api_url` | `https://gitlab.tugraz.at/api/v4/projects/<id>/repository/files/` |
| `ref` | branch of the mirror repository, e.g. `main` |
| `PRIVATE-TOKEN` | read token for the mirror repository |
| Shared secret | the same value as `SitemapGenai2EdTechRAG_SHARED_SECRET` |
| Meta tags | `title, type, category, url_en, published, runtime` |

`Meta tags` must not be empty: `getRagMetadataJson` only emits the URL when at
least one tag is configured, and without a URL a search result has nothing to link
to.

`gitlab_api_url` + `ref` + `PRIVATE-TOKEN` are how EdTechRAG *fetches* the text:
`remoteUrl` of a document is the repo-relative path, and `/chunk` reconstructs a
GitLab Files API URL from these three fields.

## CI/CD

`.gitlab-ci.yml.example` is the pipeline for the **mirror** repository — not for
EdTechRAG, where it would run on every code commit. Three stages, `build` →
`push` → `embed`, restricted to `schedule`, `web` and `api` pipelines so the push
of stage 2 cannot start the next pipeline. `[skip ci]` in the commit message is the
second latch.

This is one of two ways to run `build` → `push` → `embed`. The other is the
Docker service below. Pick one per site — running both against the same mirror
repository races two pushes against each other.

## Running as a Docker service

Alternative to GitLab CI: a long-lived container per site, sitting behind
Traefik like `Github2EdTechRAG`, that runs `-mode=build` → `-mode=diff` →
commit+push → `-mode=notify` once per HTTP request instead of once per
pipeline. Built for the case where the thing that should start a sync is
another GitLab project's pipeline (the *website*, not the mirror) finishing its
own deploy job — a plain pipeline trigger can't reach across projects as
cleanly as an HTTP call the website's own job can make in one line.

Files, all sibling to `main.go`:

| File | Role |
| --- | --- |
| `trigger/main.go` | Separate `main` package, own binary. HTTP server that runs the three modes and the git commit/push in a goroutine. Never imported by or changed by `main.go` — the tool's three-modes contract stays as-is. |
| `Dockerfile` | Multi-stage build of **both** binaries (`sitemapgenai2edtechrag` and `sitemapgenai2edtechrag-trigger`). Alpine runtime with `git` and `openssh-client`, because unlike the CI pipeline this container does its own commit and push. `ENTRYPOINT` is the trigger server. |
| `docker-compose.yml` | One service per site (`sitemap-genai-telucation`, `sitemap-genai-flaait`) — the real mirror repositories are two separate GitLab projects, not the two-site-in-one-repo layout `.gitlab-ci.yml.example` assumes. |
| `entrypoint.sh` | Not the container's default entrypoint anymore. Kept in the image for a one-shot run without HTTP: `docker compose run --rm --entrypoint /usr/local/bin/entrypoint.sh sitemap-genai-telucation`. Reads `RUN_MODE=loop` to poll on an interval instead of running once, if you'd rather not wire up a trigger at all. |
| `website.gitlab-ci.yml.example` | Goes in the **website** repository (e.g. `telucation-website`), not here. Shows the existing `deploy` job unchanged plus a `trigger-genai-sync` job that `curl`s the endpoint below once `deploy` has succeeded. |
| `ssh/` | Mount point for the deploy key (`ssh/id_ed25519`), gitignored except `.gitkeep`. Needs **write** access to the mirror repository — the CI pipeline's `GENAI_PUSH_TOKEN` is HTTPS-based and doesn't apply here. |

### The endpoint

```
GET/POST /{SUBFOLDER}/trigger
```

One path prefix per site so both containers can share one Traefik host
instead of needing a subdomain each, the same pattern as `SUBFOLDER` in
`Github2EdTechRAG`:

```
https://flaait-test.flaait.app/sitemapgenai2edtechrag-telucation/trigger
https://flaait-test.flaait.app/sitemapgenai2edtechrag-flaait/trigger
```

Authenticated by `TRIGGER_SECRET` (required — the server refuses to start
without it), sent as either:

- `Authorization: Bearer <secret>` — use this for the actual call from the
  website's pipeline (`website.gitlab-ci.yml.example`).
- `?token=<secret>` — convenience for opening the URL by hand in a browser.
  Avoid it for anything automated: the value ends up in Traefik's access log
  and in browser history, the header doesn't.

The response is immediate (`202 Accepted`, "sync started") and does not wait
for the sync to finish — `-mode=notify`'s `/chunk` call alone can take
minutes. A second request while one is still running gets `409 Conflict`
instead of overlapping it. Watch the actual run with:

```bash
docker compose logs -f sitemap-genai-telucation
```

`GET /{SUBFOLDER}/healthz` answers `200 ok` without touching git or the
network, for Traefik/uptime checks.

### Setup

1. Clone each mirror repository once into `out/<key>-website-md` with its
   `origin` remote already pointing at the `git@gitlab.tugraz.at:...` SSH URL —
   the container mounts this checkout, it doesn't create it.
2. Put a deploy key with **write** access to both mirror repositories at
   `ssh/id_ed25519`.
3. In `.env.telucation` / `.env.flaait`: point `SITEMAP_GENAI_SITES` at the
   **production** sitemap URL, not a `localhost` one — a container on the
   server can't reach your laptop's dev server. Add `TRIGGER_SECRET` (`openssl
   rand -hex 32`), a different value per site.
4. `docker compose up -d --build`.
5. In the **website** repository's own `.gitlab-ci.yml`, add the
   `trigger-genai-sync` job from `website.gitlab-ci.yml.example` after the
   `deploy` job, and set `GENAI_TRIGGER_SECRET` in that repository's CI/CD
   variables (masked, protected) to the matching `TRIGGER_SECRET`.

## Dry run without CI

```bash
WORKDIR=/tmp/mirror \
SITEMAP_GENAI_SITES='[{"key":"telucation","sitemap":"http://localhost:5173/sitemap-genai/sitemap-genai.xml","repository_path":"llt/telucation-genai"}]' \
go run . -mode=build && go run . -mode=diff
```

The sitemap may be a `localhost` address: the documents come from there as well.
`WORKDIR` needs its own `.git`, otherwise `-mode=diff` finds the repository *above*
it and `git add -A` stages that working tree instead of the mirror. Note the single
quotes — a `.env` read with `. ./.env` loses the inner `"` of an unquoted
assignment, and the tool then sees `[{key:…}]`.

Then read `changes.json`. `-mode=notify` against a local EdTechRAG succeeds when
`/admin/repositories/<url>/files` lists the new `DataFile` rows, `/admin/embeddings`
shows vectors, and a test question in `/admin/queryRewrite/<url>` returns hits
whose URL points at `telucation.tugraz.at/beitraege/…` — not at a GitLab path.
