#!/bin/sh
# One container run = the three modes of the tool, in the order that keeps a
# failed push from leaving EdTechRAG indexing content that never arrived in the
# mirror repository: build -> diff+commit+push -> notify. Skips push and notify
# when nothing changed, same as the .gitlab-ci.yml.example pipeline does.
#
# Not the default entrypoint - that is the trigger server. This is the one-shot
# path for a single instance, named by argument or by INSTANCE:
#
#	docker compose run --rm --entrypoint /usr/local/bin/entrypoint.sh sitemap-genai flaait
set -eu

INSTANCE="${1:-${INSTANCE:-}}"
if [ -z "$INSTANCE" ]; then
	echo "usage: entrypoint.sh <instance>   (a folder name in ${CONFIG_DIR:-/app/config})" >&2
	exit 2
fi

env_file="${CONFIG_DIR:-/app/config}/${INSTANCE}/.env"
if [ ! -f "$env_file" ]; then
	echo "no such instance: $env_file does not exist" >&2
	exit 2
fi

# set -a so the tool, a child process, actually sees these.
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

# Same rule as the trigger server: the checkout is WORK_ROOT/MIRROR_DIR, and
# MIRROR_DIR defaults to the instance name. A WORKDIR left in the .env for host
# dry runs is a host-relative path and must not win here.
WORKDIR="${WORK_ROOT:-/work}/${MIRROR_DIR:-$INSTANCE}"
export WORKDIR

if [ -f /app/.ssh/id_ed25519 ]; then
	chmod 600 /app/.ssh/id_ed25519 2>/dev/null || true
	export GIT_SSH_COMMAND="ssh -i /app/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new"
fi

git config --global user.name "${GIT_AUTHOR_NAME:-GenAI Sync}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-noreply@tugraz.dev}"
git config --global --add safe.directory "$WORKDIR"

run_once() {
	echo "[$INSTANCE] build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	sitemapgenai2edtechrag -mode=build

	echo "[$INSTANCE] diff"
	sitemapgenai2edtechrag -mode=diff

	cd "$WORKDIR"
	if git diff --cached --quiet; then
		echo "[$INSTANCE] nothing changed - no push, no notify"
		return 0
	fi

	git commit -m "genai sync $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
	git push origin "HEAD:${MIRROR_BRANCH:-main}"

	echo "[$INSTANCE] notify"
	sitemapgenai2edtechrag -mode=notify
}

if [ "${RUN_MODE:-once}" = "loop" ]; then
	interval="${RUN_INTERVAL_SECONDS:-3600}"
	while true; do
		run_once || echo "[$INSTANCE] run failed, will retry after the next interval"
		echo "[$INSTANCE] sleeping ${interval}s"
		sleep "$interval"
	done
else
	run_once
fi
