import path from 'path';

import type { BookmarkFile, BrowserName, CliConfig, SyncStrategy } from '@crosssync/shared';
import { BROWSERS, ensureDir, pathExists, writeJsonFileSafe } from '@crosssync/shared';

import { createBackup, formatBackupId, type BackupResult, type BackupSource } from './backup';
import { getRunningBrowserNames } from './browser-status';
import { Logger } from './logger';
import {
  mergeBookmarkFiles,
  mergeHistory,
  type BookmarkMergeResult,
  type HistoryMergeResult,
} from './merger';
import {
  countBookmarkFileNodes,
  createConfiguredBrowserReaders,
  type BookmarkSource,
  type ChromiumProfileInfo,
  type HistorySource,
} from './readers';

export interface SyncTargets {
  bookmarks: boolean;
  history: boolean;
}

export interface SyncRunOptions {
  config: CliConfig;
  targets: SyncTargets;
  dryRun?: boolean;
  /** Write bookmarks back even when the browser is running. */
  force?: boolean;
  /** Overrides `config.sync.strategy`. */
  strategy?: SyncStrategy;
  logger?: Logger;
  /** Injectable clock, used by tests. */
  now?: Date;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Overrides browser-running detection, used by tests. */
  browserRunning?: (browser: BrowserName) => boolean;
}

export interface BrowserSyncOutcome {
  browser: BrowserName;
  profile: string;
  /** Local display name / signed-in account, when Chromium exposes it. */
  profileInfo: ChromiumProfileInfo | null;
  bookmarksRead: number;
  historyRead: number;
  writtenBack: boolean;
  skippedWriteBackReason: string | null;
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  strategy: SyncStrategy;
  targets: SyncTargets;
  browsers: BrowserSyncOutcome[];
  backup: BackupResult | null;
  bookmarkMerge: BookmarkMergeResult | null;
  historyMerge: HistoryMergeResult | null;
  exportFiles: string[];
  warnings: string[];
}

/**
 * Writes a merged bookmark tree back to a Chromium `Bookmarks` file.
 *
 * The `checksum` field is intentionally dropped: Chromium recomputes it, and a
 * stale checksum makes the browser discard externally written changes.
 */
export function writeBackBookmarks(filePath: string, file: BookmarkFile): void {
  const payload: BookmarkFile = { roots: file.roots };
  if (typeof file.version === 'number') {
    payload.version = file.version;
  }
  writeJsonFileSafe(filePath, payload);
}

/**
 * Orchestrates a full sync run:
 *
 * 1. read bookmarks/history from every enabled browser profile
 * 2. back everything up first (a failed backup aborts before any write-back)
 * 3. merge by `id` + `date_added` (bookmarks) and by URL (history)
 * 4. write merged bookmarks back, then export the merged data as JSON
 */
export function runSync(options: SyncRunOptions): SyncReport {
  const { config, targets } = options;
  const startedAtMs = Date.now();
  const dryRun = options.dryRun ?? false;
  const strategy = options.strategy ?? config.sync.strategy;
  const logger = options.logger ?? new Logger(config.logLevel, { console: false });

  const warnings: string[] = [];
  const browsers: BrowserSyncOutcome[] = [];
  const exportFiles: string[] = [];
  const bookmarkSources: BookmarkSource[] = [];
  const historySources: HistorySource[] = [];

  const finish = (
    backup: BackupResult | null,
    bookmarkMerge: BookmarkMergeResult | null,
    historyMerge: HistoryMergeResult | null,
  ): SyncReport => ({
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    dryRun,
    strategy,
    targets,
    browsers,
    backup,
    bookmarkMerge,
    historyMerge,
    exportFiles,
    warnings,
  });

  const readers = createConfiguredBrowserReaders(config, {
    platform: options.platform,
    env: options.env,
  });

  for (const reader of readers) {
    const profiles = reader.resolveProfiles(config.profile);
    if (profiles.length === 0) {
      const available = reader.profiles();
      const suffix = available.length > 0 ? ` Available: ${available.join(', ')}.` : '';
      warnings.push(`No ${reader.browser} profile found under ${reader.dataDir}.${suffix}`);
      continue;
    }

    for (const profile of profiles) {
      const outcome: BrowserSyncOutcome = {
        browser: reader.browser,
        profile,
        profileInfo: reader.profileInfo(profile),
        bookmarksRead: 0,
        historyRead: 0,
        writtenBack: false,
        skippedWriteBackReason: null,
      };

      if (targets.bookmarks && pathExists(reader.bookmarksPath(profile))) {
        try {
          const source = reader.readBookmarks(profile);
          bookmarkSources.push(source);
          outcome.bookmarksRead = countBookmarkFileNodes(source.file);
        } catch (error) {
          const reason = describeError(error);
          outcome.skippedWriteBackReason = reason;
          warnings.push(`Could not read ${reader.browser} bookmarks: ${reason}`);
        }
      }

      if (targets.history && pathExists(reader.historyPath(profile))) {
        try {
          const source = reader.readHistory(profile);
          historySources.push(source);
          outcome.historyRead = source.entries.length;
        } catch (error) {
          warnings.push(`Could not read ${reader.browser} history: ${describeError(error)}`);
        }
      }

      browsers.push(outcome);
    }
  }

  if (bookmarkSources.length === 0 && historySources.length === 0) {
    warnings.push('Nothing to sync: no bookmark or history data was found.');
    return finish(null, null, null);
  }

  return syncFoundData({
    options,
    config,
    dryRun,
    strategy,
    logger,
    warnings,
    browsers,
    exportFiles,
    bookmarkSources,
    historySources,
    finish,
  });
}

type FinishReport = (
  backup: BackupResult | null,
  bookmarkMerge: BookmarkMergeResult | null,
  historyMerge: HistoryMergeResult | null,
) => SyncReport;

interface SyncFoundDataContext {
  options: SyncRunOptions;
  config: CliConfig;
  dryRun: boolean;
  strategy: SyncStrategy;
  logger: Logger;
  warnings: string[];
  browsers: BrowserSyncOutcome[];
  exportFiles: string[];
  bookmarkSources: BookmarkSource[];
  historySources: HistorySource[];
  finish: FinishReport;
}

function syncFoundData(context: SyncFoundDataContext): SyncReport {
  const {
    options,
    config,
    dryRun,
    strategy,
    logger,
    warnings,
    exportFiles,
    bookmarkSources,
    historySources,
    finish,
  } = context;

  let backup: BackupResult | null = null;
  if (!dryRun) {
    const sources: BackupSource[] = [
      ...bookmarkSources.map((source) => ({
        kind: 'bookmarks' as const,
        browser: source.browser,
        profile: source.profile,
        filePath: source.filePath,
      })),
      ...historySources.map((source) => ({
        kind: 'history' as const,
        browser: source.browser,
        profile: source.profile,
        filePath: source.filePath,
      })),
    ];

    try {
      backup = createBackup({
        backupDir: config.backupDir,
        sources,
        now: options.now,
        platform: options.platform,
      });
      logger.info('Backup created', { dir: backup.dir, files: backup.manifest.items.length });
    } catch (error) {
      warnings.push(`Backup failed; aborting before any write-back: ${describeError(error)}`);
      return finish(null, null, null);
    }
  }

  const bookmarkMerge =
    bookmarkSources.length > 0
      ? mergeBookmarkFiles(
          bookmarkSources.map((source) => ({ browser: source.browser, file: source.file })),
        )
      : null;

  const historyMerge =
    historySources.length > 0
      ? mergeHistory(
          historySources.map((source) => ({ browser: source.browser, entries: source.entries })),
        )
      : null;

  if (bookmarkMerge && strategy === 'merge') {
    if (dryRun) {
      warnings.push('Dry run: bookmark write-back skipped.');
    } else {
      writeBackMergedBookmarks(context, bookmarkMerge);
    }
  } else if (bookmarkMerge) {
    warnings.push('Strategy "export": browser bookmark files were left untouched.');
  }

  if (historyMerge) {
    warnings.push('History is exported only; CrossSync never writes back to History.sqlite.');
  }

  if (!dryRun) {
    ensureDir(config.exportDir);
    const stamp = formatBackupId(options.now ?? new Date());
    if (bookmarkMerge) {
      const file = path.join(config.exportDir, `bookmarks-merged-${stamp}.json`);
      writeJsonFileSafe(file, {
        exportedAt: new Date().toISOString(),
        source: 'crosssync',
        version: 1,
        roots: bookmarkMerge.roots,
      });
      exportFiles.push(file);
    }
    if (historyMerge) {
      const file = path.join(config.exportDir, `history-merged-${stamp}.json`);
      writeJsonFileSafe(file, {
        exportedAt: new Date().toISOString(),
        source: 'crosssync',
        entries: historyMerge.entries,
      });
      exportFiles.push(file);
    }
  }

  return finish(backup, bookmarkMerge, historyMerge);
}

/** Writes the merged tree to every browser that contributed bookmarks. */
function writeBackMergedBookmarks(
  context: SyncFoundDataContext,
  bookmarkMerge: BookmarkMergeResult,
): void {
  const { options, logger, warnings, browsers, bookmarkSources } = context;

  const running: BrowserName[] = options.browserRunning
    ? BROWSERS.filter((browser) => options.browserRunning?.(browser) === true)
    : getRunningBrowserNames({ platform: options.platform });

  const byBrowser = new Map<BrowserName, BookmarkSource[]>();
  for (const source of bookmarkSources) {
    const list = byBrowser.get(source.browser) ?? [];
    list.push(source);
    byBrowser.set(source.browser, list);
  }

  for (const [browser, sources] of byBrowser) {
    if (running.includes(browser) && !options.force) {
      warnings.push(
        `${browser} is running; skipping bookmark write-back (use --force to override).`,
      );
      for (const outcome of browsers) {
        if (outcome.browser === browser) {
          outcome.skippedWriteBackReason = 'browser-running';
        }
      }
      continue;
    }

    for (const source of sources) {
      writeBackBookmarks(source.filePath, {
        roots: bookmarkMerge.roots,
        version: source.file.version ?? 1,
      });
      logger.info('Wrote merged bookmarks', {
        browser,
        profile: source.profile,
        file: source.filePath,
      });
    }

    for (const outcome of browsers) {
      if (outcome.browser === browser) {
        outcome.writtenBack = true;
      }
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
