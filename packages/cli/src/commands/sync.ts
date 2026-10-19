import type { BrowserName, CliConfig, SyncStrategy } from '@crosssync/shared';
import {
  BROWSERS,
  isBrowserName,
  resolveExportRetention,
  SYNC_STRATEGIES,
} from '@crosssync/shared';
import { runSync, type SyncReport } from '@crosssync/core';

import type { CliContext } from '../context';
import { pruneExports } from '../export-files';

export interface SyncCommandOptions {
  bookmarks?: boolean;
  history?: boolean;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  /** `chrome`, `edge` or `all`. */
  browser?: string;
  profile?: string;
  /** `merge` or `export`. */
  strategy?: string;
  /** Print the report as JSON. */
  json?: boolean;
  /** Injectable for tests. */
  browserRunning?: (browser: BrowserName) => boolean;
  now?: Date;
  platform?: NodeJS.Platform;
}

export interface SyncTargets {
  bookmarks: boolean;
  history: boolean;
}

/** `--all` (or no flag at all) syncs bookmarks and history. */
export function resolveTargets(options: SyncCommandOptions): SyncTargets {
  if (options.all) {
    return { bookmarks: true, history: true };
  }
  const bookmarks = options.bookmarks === true;
  const history = options.history === true;
  if (!bookmarks && !history) {
    return { bookmarks: true, history: true };
  }
  return { bookmarks, history };
}

export function resolveBrowsers(value: string | undefined): BrowserName[] {
  if (!value || value === 'all') {
    return [...BROWSERS];
  }
  if (!isBrowserName(value)) {
    throw new Error(`Unknown browser "${value}". Use one of: ${BROWSERS.join(', ')}, all.`);
  }
  return [value];
}

export function resolveStrategy(value: string | undefined): SyncStrategy | undefined {
  if (!value) {
    return undefined;
  }
  if (!(SYNC_STRATEGIES as readonly string[]).includes(value)) {
    throw new Error(`Unknown strategy "${value}". Use one of: ${SYNC_STRATEGIES.join(', ')}.`);
  }
  return value as SyncStrategy;
}

/** Applies the CLI overrides on top of the stored config. */
export function buildSyncConfig(config: CliConfig, options: SyncCommandOptions): CliConfig {
  const enabled = new Set(resolveBrowsers(options.browser));
  return {
    ...config,
    profile: options.profile ?? config.profile,
    browsers: {
      chrome: {
        ...config.browsers.chrome,
        enabled: enabled.has('chrome') && config.browsers.chrome.enabled !== false,
      },
      edge: {
        ...config.browsers.edge,
        enabled: enabled.has('edge') && config.browsers.edge.enabled !== false,
      },
    },
  };
}

export function runSyncCommand(context: CliContext, options: SyncCommandOptions = {}): number {
  const targets = resolveTargets(options);
  const strategy = resolveStrategy(options.strategy) ?? context.config.sync.strategy;
  const config = buildSyncConfig(context.config, options);

  const report = runSync({
    config,
    targets,
    dryRun: options.dryRun,
    force: options.force,
    strategy,
    logger: context.logger,
    browserRunning: options.browserRunning,
    now: options.now,
    platform: options.platform,
  });

  if (!options.dryRun && report.exportFiles.length > 0) {
    const removed = pruneExports(context.config.exportDir, resolveExportRetention(context.config));
    if (removed.length > 0) {
      context.logger.info('Pruned old exports', { removed: removed.length });
    }
  }

  if (options.json) {
    context.io.out(JSON.stringify(report, null, 2));
  } else {
    for (const line of formatSyncReport(report)) {
      context.io.out(line);
    }
  }

  const failed = report.warnings.some((warning) => warning.startsWith('Backup failed'));
  return failed ? 1 : 0;
}

export function formatSyncReport(report: SyncReport): string[] {
  const lines: string[] = [];
  const kinds = [
    report.targets.bookmarks ? 'bookmarks' : null,
    report.targets.history ? 'history' : null,
  ]
    .filter((kind): kind is string => kind !== null)
    .join(' + ');

  lines.push(`CrossSync sync (${report.strategy}, ${kinds})${report.dryRun ? ' [dry run]' : ''}`);

  for (const outcome of report.browsers) {
    const parts = [`${outcome.browser}/${outcome.profile}`];
    if (report.targets.bookmarks) {
      parts.push(`${outcome.bookmarksRead} bookmark nodes`);
    }
    if (report.targets.history) {
      parts.push(`${outcome.historyRead} history entries`);
    }
    if (outcome.writtenBack) {
      parts.push('written back');
    } else if (outcome.skippedWriteBackReason) {
      parts.push(`write-back skipped (${outcome.skippedWriteBackReason})`);
    }
    lines.push(`  ${parts.join(', ')}`);
  }

  if (report.bookmarkMerge) {
    const { added, updated, identical, total } = report.bookmarkMerge.stats;
    lines.push(
      `  merged bookmarks: ${total} nodes (added ${added}, updated ${updated}, identical ${identical}, conflicts ${report.bookmarkMerge.conflicts.length})`,
    );
  }
  if (report.historyMerge) {
    lines.push(
      `  merged history: ${report.historyMerge.stats.total} entries (${report.historyMerge.stats.duplicates} duplicates collapsed)`,
    );
  }
  if (report.backup) {
    lines.push(`  backup: ${report.backup.dir}`);
  }
  for (const file of report.exportFiles) {
    lines.push(`  export: ${file}`);
  }
  if (report.warnings.length > 0) {
    lines.push('  warnings:');
    for (const warning of report.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  return lines;
}
