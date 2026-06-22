# Flowglad just-bash Release Procedure

Flowglad consumes this fork as a Bun Git dependency:

```text
github:flowglad/just-bash#v<upstream>-fgp.<n>
```

That tag must point at the `packages/just-bash` package root, not the monorepo
root. A plain `git tag` on `flowglad-main` is not consumable by Bun.

## Standard Release Flow (Automated)

`.github/workflows/auto-tag.yml` cuts a tag automatically on every push to
`flowglad-main` that touches `packages/just-bash/**`. The standard flow is:

1. Sync, patch, build, and commit on `flowglad-main`.

   ```bash
   git fetch upstream
   git merge upstream/main
   pnpm install --frozen-lockfile
   pnpm --filter just-bash build
   pnpm --filter just-bash typecheck
   pnpm --filter just-bash exec vitest run src/commands/sqlite3/sqlite3.test.ts src/commands/python3/python3.optin.test.ts
   git add packages/just-bash/package.json packages/just-bash/src packages/just-bash/vendor
   git add -f packages/just-bash/dist
   git commit -m "sync: upstream <sha>"
   ```

   The `git add -f` is needed because `packages/just-bash/dist` is gitignored
   while its built artifacts are tracked. If you forget it (or miss a
   newly content-hashed `dist/bundle/chunks/*` file), the release tooling is a
   safety net: `create-flowglad-package-tag.mjs` rebuilds, force-adds `dist`,
   and commits any drift as `build: sync committed dist … [skip auto-tag]`
   before cutting the tag — so the package never resolves to an uncommitted
   chunk. Committing dist yourself still keeps `flowglad-main` self-consistent
   between releases.

2. Push.

   ```bash
   git push origin flowglad-main
   ```

3. The workflow computes the next `v<package-version>-fgp.<n>` (highest existing
   `<n>` for the current `package.json` version, plus one), runs
   `pnpm flowglad:tag --push`, and — if `PROVISIONING_AGENT_PR_TOKEN` is set —
   opens a PR to `flowglad/provisioning-agent` updating the pinned `just-bash`
   dependency in `packages/agent/package.json` and
   `packages/agent/trigger-smoke/package.json`. Watch the workflow run for the
   published tag and the consumer PR link.

To opt a commit out of auto-tagging, include `[skip auto-tag]` in the commit
message. To force a specific tag manually, use the workflow's
`workflow_dispatch` trigger with a `tag_override` input.

### Required secrets

- `PROVISIONING_AGENT_PR_TOKEN` — fine-grained PAT (or GitHub App token) with
  `Contents: Read & Write` and `Pull requests: Read & Write` on
  `flowglad/provisioning-agent`. Without it, the workflow still cuts the tag
  but logs a warning and skips opening the consumer PR.

## Manual Release (Out-of-band)

If you need to cut a tag locally — for example to test a release before pushing,
or while the auto-tag workflow is broken — invoke the script directly:

```bash
pnpm flowglad:tag -- --tag v<upstream-version>-fgp.<n> --push
```

The script validates that:

- the current branch is `flowglad-main`;
- the worktree is clean;
- the tag matches `packages/just-bash/package.json` version;
- the tag does not already exist locally or remotely;
- `python.wasm` is hydrated, not an LFS pointer;
- the package builds, typechecks, and passes focused sqlite/Python tests;
- the package-root tag contains the hydrated WASM blob;
- a clean Bun install can import `just-bash` and run Python, sqlite dot
  commands, jq control-character input, and awk comma-newline continuation.

## Local Dry Run

To create and smoke a local tag without pushing:

```bash
pnpm flowglad:tag -- --tag v<upstream-version>-fgp.<n>
```

If the dry run succeeds, delete the local tag before re-running with `--push`,
or use a fresh increment.

## CI

Two workflows gate `flowglad-main`:

- `Flowglad Consumability` (`flowglad-consumability.yml`) — runs on every push
  and PR. Checks that a package-root install from the current checkout remains
  usable. Does not publish tags.
- `Auto-tag flowglad release` (`auto-tag.yml`) — runs on every push to
  `flowglad-main` that touches `packages/just-bash/**`. Computes the next
  `fgp.<n>` increment for the current package version and publishes the tag via
  `pnpm flowglad:tag --push`.
