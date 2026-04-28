# Flowglad just-bash Release Procedure

Flowglad consumes this fork as a Bun Git dependency:

```text
github:flowglad/just-bash#v<upstream>-fgp.<n>
```

That tag must point at the `packages/just-bash` package root, not the monorepo
root. A plain `git tag` on `flowglad-main` is not consumable by Bun.

## Release Checklist

1. Sync and patch `flowglad-main`.

   ```bash
   git fetch upstream
   git merge upstream/main
   pnpm install --frozen-lockfile
   ```

2. Reapply or adjust the Flowglad patches as needed.

3. Build and verify the package.

   ```bash
   pnpm --filter just-bash build
   pnpm --filter just-bash typecheck
   pnpm --filter just-bash exec vitest run src/commands/sqlite3/sqlite3.test.ts src/commands/python3/python3.optin.test.ts
   ```

4. Commit source changes and built output.

   ```bash
   git add packages/just-bash/package.json packages/just-bash/src packages/just-bash/vendor
   git add -f packages/just-bash/dist
   git commit -m "sync: upstream <sha>"
   ```

5. Publish the consumable package-root tag.

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

The `Flowglad Consumability` workflow runs on `flowglad-main` pushes and PRs. It
does not publish tags; it checks that a package-root install from the current
checkout remains usable.
