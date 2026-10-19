import path from 'path';

import type { BookmarkRoots, HistoryEntry } from '@crosssync/shared';
import {
  ensureDir,
  pathExists,
  readJsonFile,
  resolveExportRetention,
  writeJsonFileSafe,
} from '@crosssync/shared';
import { formatBackupId, type BookmarkMergeStats, type HistoryMergeStats } from '@crosssync/core';

import type { CliContext } from '../context';
import { collectExportFiles, pruneExports } from '../export-files';
import { describeError, readMergedData, type MergedData } from './read';
import { resolveBrowsers } from './sync';

export interface ExportCommandOptions {
  /** Only `json` is supported. */
  format?: string;
  /** Directory to write into; defaults to the configured export dir. */
  out?: string;
  browser?: string;
  profile?: string;
  /** Write to stdout instead of a file. */
  stdout?: boolean;
  now?: Date;
  platform?: NodeJS.Platform;
}

export interface ExportPayload {
  exportedAt: string;
  source: 'crosssync';
  version: number;
  bookmarks: { stats: BookmarkMergeStats; roots: BookmarkRoots } | null;
  history: { stats: HistoryMergeStats; entries: HistoryEntry[] } | null;
}

export function buildExportPayload(data: MergedData, exportedAt = new Date()): ExportPayload {
  return {
    exportedAt: exportedAt.toISOString(),
    source: 'crosssync',
    version: 1,
    bookmarks: data.bookmarkMerge
      ? { stats: data.bookmarkMerge.stats, roots: data.bookmarkMerge.roots }
      : null,
    history: data.historyMerge
      ? { stats: data.historyMerge.stats, entries: data.historyMerge.entries }
      : null,
  };
}

/** Reads and merges browser data, then writes it out as JSON. Never writes back. */
export function runExportCommand(context: CliContext, options: ExportCommandOptions = {}): number {
  const format = (options.format ?? 'json').toLowerCase();
  if (format !== 'json') {
    context.io.err(`Unsupported export format "${format}". Only "json" is supported.`);
    return 1;
  }

  let data: MergedData;
  try {
    data = readMergedData(context.config, {
      browser: resolveBrowsers(options.browser),
      profile: options.profile,
      platform: options.platform,
    });
  } catch (error) {
    context.io.err(`Export failed: ${describeError(error)}`);
    return 1;
  }

  for (const warning of data.warnings) {
    context.io.err(`warning: ${warning}`);
  }

  if (!data.bookmarkMerge && !data.historyMerge) {
    context.io.err('Nothing to export: no bookmark or history data was found.');
    return 1;
  }

  const payload = buildExportPayload(data, options.now ?? new Date());

  if (options.stdout) {
    context.io.out(JSON.stringify(payload, null, 2));
    return 0;
  }

  const outDir = options.out ?? context.config.exportDir;
  const target = path.join(
    outDir,
    `crosssync-export-${formatBackupId(options.now ?? new Date())}.json`,
  );

  try {
    ensureDir(outDir);
    writeJsonFileSafe(target, payload);
  } catch (error) {
    context.io.err(`Export failed: ${describeError(error)}`);
    return 1;
  }

  // Only the managed export directory is pruned; custom --out dirs are left alone.
  if (path.resolve(outDir) === path.resolve(context.config.exportDir)) {
    const removed = pruneExports(outDir, resolveExportRetention(context.config));
    if (removed.length > 0) {
      context.logger.info('Pruned old exports', { removed: removed.length });
    }
  }

  context.logger.info('Export written', { file: target });
  context.io.out(`Export written: ${target}`);
  if (data.bookmarkMerge) {
    context.io.out(`  bookmarks: ${data.bookmarkMerge.stats.total} nodes`);
  }
  if (data.historyMerge) {
    context.io.out(`  history: ${data.historyMerge.stats.total} entries`);
  }
  return 0;
}

export interface ExportSummary {
  count: number;
  latest: string | null;
  /** Newest first, capped by `limit`. */
  files: string[];
}

/** Summarises the CrossSync export files written into a directory. */
export function listExports(exportDir: string, limit = 5): ExportSummary {
  const files = collectExportFiles(exportDir);
  return {
    count: files.length,
    latest: files.length > 0 ? files[0].file : null,
    files: files.slice(0, limit).map((entry) => entry.file),
  };
}

/** Reads an exported payload back from disk. */
export function readExportFile(filePath: string): ExportPayload | null {
  if (!pathExists(filePath)) {
    return null;
  }
  return readJsonFile<ExportPayload>(filePath);
}
