#!/bin/sh
# One container run = the three modes of the tool, in the order that keeps a
# failed push from leaving EdTechRAG indexing content that never arrived in the
# mirror repository: build -> diff+commit+push -> notify. Skips push and notify
# when nothing changed, same as the .gitlab-ci.yml.example pipeline does.
set -eu

if [ -f /app/.ssh/id_ed25519 ]; then
	chmod 600 /app/.ssh/id_ed25519 2>/dev/null || true
	export GIT_SSH_COMMAND="ssh -i /app/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new"
fi

git config --global user.name "${GIT_AUTHOR_NAME:-GenAI Sync}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-noreply@tugraz.dev}"
git config --global --add safe.directory "${WORKDIR:-/work}"

run_once() {
	echo "[sitemapgenai2edtechrag] build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
	sitemapgenai2edtechrag -mode=build

	echo "[sitemapgenai2edtechrag] diff"
	sitemapgenai2edtechrag -mode=diff

	cd "${WORKDIR:-/work}"
	if git diff --cached --quiet; then
		echo "[sitemapgenai2edtechrag] nothing changed - no push, no notify"
		return 0
	fi

	git commit -m "genai sync $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
	git push origin "HEAD:${MIRROR_BRANCH:-main}"

	echo "[sitemapgenai2edtechrag] notify"
	sitemapgenai2edtechrag -mode=notify
}

if [ "${RUN_MODE:-once}" = "loop" ]; then
	interval="${RUN_INTERVAL_SECONDS:-3600}"
	while true; do
		run_once || echo "[sitemapgenai2edtechrag] run failed, will retry after the next interval"
		echo "[sitemapgenai2edtechrag] sleeping ${interval}s"
		sleep "$interval"
	done
else
	run_once
fi
