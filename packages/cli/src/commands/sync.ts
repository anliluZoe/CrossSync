import * as readline from 'node:readline/promises';

import type { BrowserName, CliConfig, SyncStrategy } from '@crosssync/shared';
import {
  addProfilesToSelection,
  BROWSERS,
  isBrowserName,
  resolveExportRetention,
  SYNC_STRATEGIES,
} from '@crosssync/shared';
import { createConfiguredBrowserReaders, runSync, type SyncReport } from '@crosssync/core';

import type { CliContext } from '../context';
import { saveConfigFile } from '../context';
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
  /** Asked when the configured profile cannot be found for a browser. */
  selectProfiles?: ProfileSelector;
  now?: Date;
  platform?: NodeJS.Platform;
}

export interface ProfileSelectionRequest {
  browser: BrowserName;
  dataDir: string;
  /** Profiles that actually exist on disk. */
  available: string[];
  /** The currently configured profile value. */
  current: string;
}

/** Returns the chosen profiles, or null/[] to skip that browser. */
export type ProfileSelector = (request: ProfileSelectionRequest) => Promise<string[] | null>;

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

/**
 * When the configured profile does not exist for a browser, interactively list
 * the profiles that do exist and persist the user's choice. The chosen names are
 * merged into the configured comma-separated list, so other browsers keep their
 * own profiles.
 */
async function ensureProfilesSelected(
  context: CliContext,
  options: SyncCommandOptions,
): Promise<void> {
  if (options.profile !== undefined || options.json) {
    return;
  }
  const interactive =
    options.selectProfiles !== undefined ||
    (process.stdin.isTTY === true && process.stdout.isTTY === true);
  if (!interactive) {
    return;
  }

  const effective = buildSyncConfig(context.config, options);
  const readers = createConfiguredBrowserReaders(effective, { platform: options.platform });
  const select = options.selectProfiles ?? promptForProfiles;
  let changed = false;

  for (const reader of readers) {
    if (reader.resolveProfiles(context.config.profile).length > 0) {
      continue;
    }
    const available = reader.profiles();
    if (available.length === 0) {
      continue;
    }

    const selected = await select({
      browser: reader.browser,
      dataDir: reader.dataDir,
      available,
      current: context.config.profile,
    });
    if (!selected || selected.length === 0) {
      continue;
    }

    const valid = selected.filter((name) => available.includes(name));
    if (valid.length === 0) {
      continue;
    }
    context.config.profile = addProfilesToSelection(context.config.profile, valid);
    changed = true;
  }

  if (changed) {
    saveConfigFile(context.dirs.configFile, context.config);
    context.io.out(`Profile selection saved: ${context.config.profile}`);
  }
}

/** Default interactive selector, used when stdin is a terminal. */
export async function promptForProfiles(
  request: ProfileSelectionRequest,
): Promise<string[] | null> {
  const output = process.stdout;
  output.write(`\nNo ${request.browser} profile matched "${request.current}".\n`);
  output.write(`Available ${request.browser} profiles in ${request.dataDir}:\n`);
  request.available.forEach((name, index) => {
    output.write(`  ${index + 1}) ${name}\n`);
  });

  const rl = readline.createInterface({ input: process.stdin, output });
  try {
    for (;;) {
      const answer = await rl.question(
        'Select profiles (comma-separated numbers or names, "all", empty to skip): ',
      );
      const parsed = parseProfileAnswer(answer, request.available);
      if (parsed !== undefined) {
        return parsed;
      }
      output.write('Invalid selection; please try again.\n');
    }
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

/**
 * Parses a prompt answer.
 * Returns an empty result (`null`) to skip, or `undefined` for invalid input.
 */
export function parseProfileAnswer(
  answer: string,
  available: readonly string[],
): string[] | null | undefined {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.toLowerCase() === 'all') {
    return [...available];
  }

  const selected: string[] = [];
  for (const token of trimmed.split(',')) {
    const value = token.trim();
    if (value.length === 0) {
      continue;
    }
    if (/^\d+$/.test(value)) {
      const index = Number(value) - 1;
      if (index < 0 || index >= available.length) {
        return undefined;
      }
      const name = available[index];
      if (!selected.includes(name)) {
        selected.push(name);
      }
      continue;
    }
    if (!available.includes(value)) {
      return undefined;
    }
    if (!selected.includes(value)) {
      selected.push(value);
    }
  }

  return selected.length > 0 ? selected : undefined;
}

export async function runSyncCommand(
  context: CliContext,
  options: SyncCommandOptions = {},
): Promise<number> {
  const targets = resolveTargets(options);
  const strategy = resolveStrategy(options.strategy) ?? context.config.sync.strategy;

  await ensureProfilesSelected(context, options);

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
