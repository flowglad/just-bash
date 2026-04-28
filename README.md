# just-bash monorepo

> ## Flowglad fork notes
>
> This is [Flowglad](https://github.com/flowglad)'s fork of [`vercel-labs/just-bash`](https://github.com/vercel-labs/just-bash).
> We carry three patches that fix issues encountered while embedding just-bash
> in our reasoning agent. Each patch lives at TypeScript-source level on the
> `flowglad-main` branch (this repo's default) and is reflected in the
> committed `dist/`. Releases are tagged `v<upstream>-fgp.<n>` (e.g.
> `v2.14.0-fgp.1`) — consumers should pin a tag, not the branch.
>
> | Patch | What it fixes | Upstream PR |
> | --- | --- | --- |
> | `sqlite3-worker` | The published npm tarball omits `dist/commands/sqlite3/worker.js`, so the bundled `sqlite3` command falls through to the Python worker and throws on every invocation. We ship the worker. | _filed in Patch 2_ |
> | `awk-comma-continuation` | The bundled awk lexer emits a `NEWLINE` token after a trailing comma, breaking POSIX comma-continuation in scripts our agent runs. | _filed in Patch 2_ |
> | `jq-permissive-control-chars` | The bundled jq input scanner calls `JSON.parse` on raw bytes that may contain literal control characters (which Shopify's Admin API responses do), failing parse. We sanitize the slice before parsing. | _filed in Patch 2_ |
>
> ### Syncing from upstream
>
> ```bash
> git fetch upstream && git merge upstream/main && pnpm build && git add -f packages/just-bash/dist && git commit -m "sync: upstream <sha>" && git tag v<upstream>-fgp.<n>
> ```
>
> See `docs/SYNC.md` (added in Patch 4) for the manual fallback procedure when the
> automated cron-polled GitHub Action can't merge cleanly.

This repository hosts the [`just-bash`](./packages/just-bash) package and its examples.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| [`just-bash`](./packages/just-bash) | `packages/just-bash` | A simulated bash environment with virtual filesystem |

See the package's own [README](./packages/just-bash/README.md) for usage documentation.

## Layout

```
packages/         publishable npm packages
examples/         example consumers (bash-agent, cjs-consumer, website)
.github/          CI workflows
```

## Working in the repo

```bash
pnpm install              # install all workspace deps
pnpm build                # build all packages
pnpm test:run             # run unit + comparison tests
pnpm test:dist            # smoke-test the bundled output
pnpm lint                 # biome + per-package banned-pattern checks
pnpm typecheck            # tsc across all packages
```

Per-package commands run via `pnpm --filter <name> <script>` — e.g.
`pnpm --filter just-bash test:wasm`.
