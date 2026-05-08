# Github2EdTechRAG

Small GitHub webhook bridge for EdTechRAG.

## Configuration

Copy `.env.example` to `.env` and set:

The Docker image does not bake runtime configuration; `docker-compose.yml` loads `.env` into the container.

- `GITHUBSECRET`: GitHub webhook secret. Configure the webhook URL as `https://github2.edtechrag.local/webhook` and select push events.
- `Github2EdTechRAG_ENDPOINT`: EdTechRAG API base, usually ending in `/api/gitlab` while the existing EdTechRAG endpoints are reused.
- `Github2EdTechRAG_SHARED_SECRET`: outgoing HMAC secret expected by the matching repository `updateConfig` in EdTechRAG.
- `ADDR`: listen address inside the container, usually `:8080`.
- `PUBLIC_BASE_URL`: public URL where this bridge exposes `/raw` file content for EdTechRAG chunking.
- `GITHUB_REPOS_DIR`: repository checkout directory inside the container, usually `/repos`.
- `LOG_DIR`: task log directory inside the container, usually `/log`.
- `GITHUB_SSH_KEY_PATH`: SSH deploy key path inside the container, usually `/app/.ssh/id_ed25519`. Readonly is enough, create with `ssh-keygen -t ed25519 -C "github_readonly"`

## Repository checkout

By default the service clones/fetches repositories automatically below `repos/` as `<owner>__<repo>`.

For an already cloned repository, mount it below `repos/` and configure the GitHub webhook URL with the repository subpath:

```text
https://github2.edtechrag.local/webhook?path=my-project
```

On every push webhook the service runs:

```sh
git -C /repos/my-project pull --ff-only
```

Without `path`, the service clones or fetches under `/repos/<owner>__<repo>`. With `path`, the value must be a relative subpath below `GITHUB_REPOS_DIR`.

## GitHub SSH key

Place a deploy key at `ssh/id_ed25519`. The compose file mounts `./ssh` read-only to `/app/.ssh`.

The container uses that key for automatic clone/fetch operations and for `git pull` when the mounted repository remote is configured with SSH.

## Logs

Every webhook task writes a timestamped log file to `/log`. The compose file mounts this to `./log`.

## Run

```sh
docker compose up -d --build
```

## EdTechRAG repository admin config

Create or edit the repository at:

```text
/admin/repositories/<encoded-edtechrag-repository-url>
```

Required GitHub2EdTechRAG fields:

- `Repository name`: display name in EdTechRAG.
- `GitHub repository path`: GitHub `owner/repository`. This must match the webhook payload `repository.full_name`; Github2EdTechRAG sends it as `repository_path`.
- `Bridge public base URL`: normally `https://github2.edtechrag.local`.
- `Mounted repo path`: optional. Leave empty for automatic clone/fetch under `/repos/<owner>__<repo>`. Set it when the webhook should use an existing mounted clone under `/repos/<path>` and only run `git pull --ff-only`.
- `EdTechRAG shared secret`: must match `Github2EdTechRAG_SHARED_SECRET` in this service. The admin UI treats it as write-only.

Required LLM fields:

- `OpenAI-compatible API key`: write-only. Existing keys are never sent back to the frontend; enter a value only to create or overwrite.
- `Chat API base`, `Chat model`, `API language`.
- `Embedding API base`, `Embedding model`.
- `Embedding API key`: optional and write-only. If omitted, EdTechRAG falls back to the LLM API key.

Optional fields:

- Azure OpenAI URL, deployment model, and API version.
- RAG chunk size, chunk overlap, number of documents, metadata tags, and system prompt.
