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

## JSON output conventions (`--json`)

CrossSync emits **parseable, versioned JSON** on stdout whenever `--json` is passed.
Human-readable text is written to stdout as before; warnings and errors go to stderr.

### Commands that support `--json`

| Command | JSON shape | Notes |
|---------|-----------|-------|
| `sync --json` | `SyncReport` (see below) | `--dry-run` adds `dryRunSummary` |
| `sync --json --dry-run` | `SyncJsonOutput` = `SyncReport` + `dryRunSummary` | No files are touched |
| `status --json` | `StatusReport` | Full runtime snapshot |
| `profiles --json` | `ProfilesListReport` or `ProfileMutationReport` | Shape depends on action |
| `logs --json` | `LogEntry[]` | One entry per line in raw log |

### `sync --json` — `SyncReport` (core `SyncReport` + CLI extensions)

```jsonc
{
  "startedAt": "2026-01-16T09:30:05.000Z",
  "finishedAt": "2026-01-16T09:30:07.000Z",
  "dryRun": false,
  "strategy": "merge",
  "targets": { "bookmarks": true, "history": true },
  "browsers": [
    {
      "browser": "chrome",
      "profile": "Default",
      "profileInfo": { "profile": "Default", "name": "Personal", "userName": "me@example.com", "gaiaName": "Me" },
      "bookmarksRead": 5,
      "historyRead": 2,
      "writtenBack": true,
      "skippedWriteBackReason": null
    }
  ],
  "bookmarkMerge": {
    "roots": { "bookmark_bar": { /* Chromium tree */ }, "other": { /* … */ } },
    "stats": { "total": 7, "added": 1, "updated": 1, "identical": 5 },
    "conflicts": [
      {
        "id": "3",
        "name": "Shared (edge)",
        "type": "url",
        "winnerOrigin": "edge",
        "loserOrigin": "chrome",
        "winnerDateAdded": 13395000000000000,
        "loserDateAdded": 13390000000000000
      }
    ]
  },
  "historyMerge": {
    "entries": [ /* HistoryEntry[] */ ],
    "stats": { "total": 4, "duplicates": 2 }
  },
  "backup": { "dir": "/path/to/backups/20260116-093005", "manifest": { /* … */ } },
  "exportFiles": [ "/path/to/exports/bookmarks-merged-20260116-093005.json" ],
  "warnings": [ "strategy 'export': browser bookmark files were left untouched." ]
}
```

**Dry-run addition** — when `--dry-run` is set, the JSON object also includes:

```jsonc
{
  // …all SyncReport fields, plus:
  "dryRunSummary": {
    "wouldBackup": true,
    "wouldExport": true,
    "bookmarkConflicts": 1,
    "historyConflicts": 0,
    "browsers": [
      {
        "browser": "chrome",
        "profile": "Default",
        "bookmarksRead": 5,
        "historyRead": 2,
        "wouldWriteBack": true,
        "skippedWriteBackReason": null
      }
    ]
  }
}
```

`bookmarkConflicts` mirrors `bookmarkMerge.conflicts.length`.  `historyConflicts` is always `0`
because history is never written back.  All `wouldWriteBack` values reflect `strategy === 'merge'`
and `!skippedWriteBackReason`.  No `backup.dir`, `exportFiles` or actual file is present in dry-run
output; `dryRunSummary.wouldBackup`/`wouldExport` describe what *would* happen.

### `status --json` — `StatusReport`

```jsonc
{
  "version": "0.1.8",
  "configFile": "/home/user/.crosssync/config.json",
  "dataDir": "/home/user/.crosssync",
  "logLevel": "info",
  "logFile": "/home/user/.crosssync/logs/crosssync.log",
  "profile": "Default",
  "schedule": { "installed": false, "expression": "0 9 * * *" },
  "browsers": [
    {
      "browser": "chrome",
      "dataDir": "/home/user/.config/google-chrome",
      "exists": true,
      "running": false,
      "profiles": [
        { "profile": "Default", "bookmarks": true, "history": true }
      ]
    }
  ],
  "backups": { "count": 3, "latest": "/path/to/backups/20260116-093005", "dir": "/path/to/backups" },
  "exports": { "count": 2, "latest": "/path/to/exports/bookmarks-merged-20260116-093005.json", "dir": "/path/to/exports" }
}
```

### `profiles --json` — list action → `ProfilesListReport`

```jsonc
{
  "selected": "Default",
  "browsers": [
    {
      "browser": "chrome",
      "dataDir": "/home/user/.config/google-chrome",
      "enabled": true,
      "available": [
        { "profile": "Default", "selected": true,  "account": { "name": "Personal", "userName": "me@example.com", "gaiaName": "Me" } },
        { "profile": "Profile 11", "selected": false, "account": { "name": "Work", "userName": "work@example.com", "gaiaName": "Work" } }
      ],
      "missingConfigured": []
    }
  ]
}
```

When the configured selection is `all`, `selected` is `null`.

**Mutation actions** (`--set`, `--add`, `--remove`, `--all`, `--reset`) → `ProfileMutationReport`:

```jsonc
{ "changed": true, "profile": "Profile 11,Profile 12" }
```

### Conflict list guarantees

`SyncReport.bookmarkMerge.conflicts` is always an array (possibly empty).  Each entry has:

| Field | Type | Meaning |
|-------|------|---------|
| `id` | `string` | Chromium bookmark node id |
| `name` | `string` | Winning node name |
| `type` | `"url" \| "folder"` | Node type |
| `winnerOrigin` | `BrowserName` | Browser whose version was kept |
| `loserOrigin` | `BrowserName` | Browser whose version was overridden |
| `winnerDateAdded` | `number` | Microseconds since Chromium epoch |
| `loserDateAdded` | `number` | Microseconds since Chromium epoch |
| `winnerDateModified` | `number?` | Folder only; `date_modified` of winner |
| `loserDateModified` | `number?` | Folder only; `date_modified` of loser |

### Parsing rules

* Output is always a **single JSON value** (object or array) printed to stdout.
* `JSON.parse()` on the full stdout string must succeed — no trailing log lines.
* Timestamps are ISO 8601 UTC (`toISOString()`).
* Chromium timestamps (`date_added`, `date_modified`, `lastVisitTime`) are **microseconds** as `number`.
* `profileInfo` / `account` may be `null` when the browser profile is unsigned or the data is unreadable.
* Exit code `0` on success, `1` on hard failures (backup failure, write-back failure, no data).

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
