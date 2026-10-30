# CrossSync — AGENTS.md

## Status

Phase 2 complete: the browser-extension / realtime-sync design was dropped and replaced by a
**pure CLI, scheduled-sync** tool. Working implementation with tests — see `CLAUDE.md` / `.cursorrules`
for the project charter and `产品说明.md` for the product spec.

## Repo layout

```
packages/
  shared/            # types, constants, path resolution, safe JSON IO, SQLite copy-read
  core/              # sync engine: readers, merger, backup, sync, browser-status, logger
  cli/               # commander CLI + cron installers (Windows/macOS/Linux)
.github/workflows/ci.yml
```

Dependency direction is fixed: `cli → core → shared`.

## Verified commands (run from repo root)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies (builds native `better-sqlite3`) |
| `pnpm build` | Build all packages (Turbo) |
| `pnpm test` | Run all package tests (Turbo) |
| `pnpm lint` | Lint `src/` in all packages (Turbo) |
| `pnpm typecheck` | Type-check all packages (Turbo) |
| `pnpm dev` | Watch-mode build for all packages |
| `pnpm format` | Prettier write |

Single package:

```
pnpm --filter @crosssync/shared build
pnpm --filter crosssync test
pnpm --filter @crosssync/core typecheck
```

Required local verification order: `lint -> typecheck -> test -> build`.

### Running the CLI from source

```
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js sync --bookmarks --dry-run
node packages/cli/dist/index.js status
node packages/cli/dist/index.js install-cron --dry-run
```

`--home-dir <path>` redirects all runtime data (`~/.crosssync`) elsewhere — use it for experiments.

**Rebuild after editing `core`/`shared` before running the CLI**, because the CLI resolves the
workspace packages through their `dist/` output.

## Toolchain notes

- pnpm workspace, `node-linker=hoisted` (`.npmrc`)
- pnpm 10 blocks lifecycle scripts by default; `pnpm.onlyBuiltDependencies` in the root
  `package.json` allow-lists `better-sqlite3` and `esbuild`
- Turborepo v2: `turbo.json` uses `tasks`; `test` and `typecheck` declare `dependsOn: ["^build"]`
  so workspace dependencies are compiled first
- TypeScript strict, root `tsconfig.json` is base; each package `tsconfig.json` extends it with
  `composite: true`, emits to `dist/`
- `module: NodeNext` and no `"type": "module"` → CommonJS output, relative imports have **no** `.js`
  suffix
- Vitest per package (`vitest.config.ts`, `environment: node`), tests in `__tests__/`
- ESLint + Prettier; ESLint lints `src/` only (`__tests__` excluded from tsconfig include)
- Line endings are pinned to LF via `.gitattributes`
- CLI bin: `crosssync` → `packages/cli/dist/index.js`

## Test data rules

Tests must never touch a real browser profile. They use `os.tmpdir()` fixtures, an in-memory
`CommandIo`, and injected `ProcessRunner` / `CronRunner` / clock / `homeDir` values.

## Intentional non-goals

- Browser extensions (Chrome/Edge) — removed on purpose
- Electron desktop app — removed on purpose; CrossSync is CLI-only
- WebSocket server, client connection management, heartbeats, auth tokens — removed on purpose
- Writing back to `History.sqlite` during sync — Chromium owns that file while running
  (the explicit `crosssync restore --history` recovery command is the only exception)
- Reading passwords, cookies or tab data

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`/`master`:

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `pnpm lint`

## npm publishing

`.github/workflows/publish.yml` is manual-only (`workflow_dispatch`). It reads the latest version
from the npm registry and picks the next one automatically (`auto` / `patch` / `minor` / `major`),
writes it into `packages/cli/package.json` and `CLI_VERSION` in `packages/cli/src/constants.ts`,
publishes, then commits the bump back to the branch. `auto` publishes the local version unchanged
when it is already ahead of npm, so manual bumps still work.
