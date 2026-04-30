#!/usr/bin/env bash
# Reactive upstream sync for flowglad/just-bash.
#
# Invoked by .github/workflows/sync-upstream.yml or manually from a clean
# checkout of flowglad-main. Fetches the latest upstream tag from
# vercel-labs/just-bash@main, merges it into a sync-<tag> branch, builds and
# tests, and writes step outputs the workflow uses to push and label the PR.
#
# Outputs (written to $GITHUB_OUTPUT when set):
#   latest_upstream=<tag>
#   sync_branch=<branch name>
#   status=up_to_date | pr_already_open | clean | conflicts

set -euo pipefail

UPSTREAM_REMOTE_NAME="${UPSTREAM_REMOTE_NAME:-upstream}"
UPSTREAM_REMOTE_URL="${UPSTREAM_REMOTE_URL:-https://github.com/vercel-labs/just-bash.git}"
BASE_BRANCH="${BASE_BRANCH:-flowglad-main}"
PACKAGE_DIST="packages/just-bash/dist"

emit_output() {
  local key="$1"
  local value="$2"
  echo "[sync-upstream] ${key}=${value}"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${key}=${value}" >>"${GITHUB_OUTPUT}"
  fi
}

if git remote get-url "${UPSTREAM_REMOTE_NAME}" >/dev/null 2>&1; then
  git remote set-url "${UPSTREAM_REMOTE_NAME}" "${UPSTREAM_REMOTE_URL}"
else
  git remote add "${UPSTREAM_REMOTE_NAME}" "${UPSTREAM_REMOTE_URL}"
fi

git fetch --prune --tags "${UPSTREAM_REMOTE_NAME}"
git fetch --prune origin

LATEST_UPSTREAM="$(git describe --tags --abbrev=0 "${UPSTREAM_REMOTE_NAME}/main")"
emit_output latest_upstream "${LATEST_UPSTREAM}"

UPSTREAM_SHA="$(git rev-parse "${LATEST_UPSTREAM}^{commit}")"

if git merge-base --is-ancestor "${UPSTREAM_SHA}" "origin/${BASE_BRANCH}"; then
  emit_output status up_to_date
  exit 0
fi

SYNC_BRANCH="sync-${LATEST_UPSTREAM}"
emit_output sync_branch "${SYNC_BRANCH}"

if git ls-remote --exit-code --heads origin "${SYNC_BRANCH}" >/dev/null 2>&1; then
  emit_output status pr_already_open
  exit 0
fi

git checkout -B "${SYNC_BRANCH}" "origin/${BASE_BRANCH}"

set +e
git merge --no-ff --no-edit "${LATEST_UPSTREAM}"
MERGE_STATUS=$?
set -e

if [ ${MERGE_STATUS} -ne 0 ]; then
  git add -A
  git commit --no-verify \
    -m "merge(upstream): ${LATEST_UPSTREAM} (UNRESOLVED CONFLICTS)" \
    -m "Conflict markers remain in the tree. Resolve locally before merging." \
    || true
  emit_output status conflicts
  exit 0
fi

pnpm install --frozen-lockfile
pnpm --filter just-bash build
pnpm --filter just-bash typecheck
pnpm --filter just-bash exec vitest run \
  src/commands/sqlite3/sqlite3.test.ts \
  src/commands/python3/python3.optin.test.ts

git add -f "${PACKAGE_DIST}"
if ! git diff --cached --quiet; then
  git commit -m "build: dist for upstream sync ${LATEST_UPSTREAM}"
fi

UNTRACKED="$(git status --porcelain)"
if [ -n "${UNTRACKED}" ]; then
  echo "[sync-upstream] Working tree dirty after build:" >&2
  echo "${UNTRACKED}" >&2
  exit 1
fi

emit_output status clean
