# Github2EdTechRAG

Small GitHub webhook bridge for EdTechRAG.

## Configuration

Copy `.env.example` to `.env` and set:

- `GITHUBSECRET`: GitHub webhook secret. Configure the webhook URL as `https://github2.edtechrag.local/webhook` and select push events.
- `Github2EdTechRAG_ENDPOINT`: EdTechRAG API base, usually ending in `/api/gitlab` while the existing EdTechRAG endpoints are reused.
- `Github2EdTechRAG_SHARED_SECRET`: outgoing HMAC secret expected by the matching repository `updateConfig` in EdTechRAG.
- `PUBLIC_BASE_URL`: public URL where this bridge exposes `/raw` file content for EdTechRAG chunking.
- `LOG_DIR`: task log directory inside the container, defaults to `/log`.

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
