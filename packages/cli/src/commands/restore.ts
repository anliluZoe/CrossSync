import path from 'path';

import type { BrowserName } from '@crosssync/shared';
import { BROWSERS, copyFileSafe, pathExists, readJsonFile } from '@crosssync/shared';
import {
  BACKUP_MANIFEST_FILE,
  createBackup,
  getRunningBrowserNames,
  listBackups,
  type BackupItem,
  type BackupManifest,
  type BackupResult,
  type BackupSource,
  type BackupSummary,
} from '@crosssync/core';

import type { CliContext } from '../context';
import { describeError } from './read';

export interface RestoreCommandOptions {
  /** Backup id to restore; defaults to the newest backup. */
  id?: string;
  /** Also restore `History` databases (bookmarks are restored by default). */
  history?: boolean;
  /** Restore even while a browser is running. */
  force?: boolean;
  dryRun?: boolean;
  now?: Date;
  platform?: NodeJS.Platform;
  /** Injectable for tests. */
  browserRunning?: (browser: BrowserName) => boolean;
}

export interface RestorePlanItem {
  item: BackupItem;
  /** Absolute path of the file inside the backup directory. */
  backupFile: string;
  /** False when the manifest points at a file the backup no longer holds. */
  exists: boolean;
}

/** Builds the list of files a restore would write, skipping history by default. */
export function buildRestorePlan(
  manifest: BackupManifest,
  backupDir: string,
  includeHistory: boolean,
): RestorePlanItem[] {
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  return items
    .filter((item): item is BackupItem => isRestorableItem(item))
    .filter((item) => includeHistory || item.kind === 'bookmarks')
    .map((item) => {
      // `basename` keeps a tampered manifest from writing outside the backup dir.
      const backupFile = path.join(backupDir, path.basename(item.file));
      return { item, backupFile, exists: pathExists(backupFile) };
    });
}

/**
 * Restores browser files from a backup. Bookmark files are restored by default;
 * History databases require `--history` because CrossSync never writes them
 * during a normal sync.
 */
export function runRestoreCommand(
  context: CliContext,
  options: RestoreCommandOptions = {},
): number {
  const backups = listBackups(context.config.backupDir);
  if (backups.length === 0) {
    context.io.err(`No backups found in ${context.config.backupDir}.`);
    return 1;
  }

  const summary = findBackup(backups, options.id);
  if (!summary) {
    context.io.err(
      `Backup "${options.id}" not found. Run "crosssync backup --list" to see available backups.`,
    );
    return 1;
  }

  const manifestFile = path.join(summary.dir, BACKUP_MANIFEST_FILE);
  const manifest = readJsonFile<BackupManifest>(manifestFile);
  if (!manifest || !Array.isArray(manifest.items)) {
    context.io.err(`Backup manifest is missing or invalid: ${manifestFile}`);
    return 1;
  }

  const plan = buildRestorePlan(manifest, summary.dir, options.history === true);
  if (plan.length === 0) {
    context.io.err(
      options.history
        ? `Backup ${summary.id} contains no restorable files.`
        : `Backup ${summary.id} contains no bookmark files. Pass --history to restore History databases too.`,
    );
    return 1;
  }

  const created = summary.createdAt ?? 'unknown';
  if (options.dryRun) {
    context.io.out(`Restore plan for backup ${summary.id} (${created}):`);
    for (const entry of plan) {
      const missing = entry.exists ? '' : '  [missing backup file]';
      context.io.out(
        `  ${entry.item.kind}/${entry.item.browser}/${entry.item.profile}: ` +
          `${entry.backupFile} -> ${entry.item.source}${missing}`,
      );
    }
    context.io.out('Dry run: nothing was written.');
    return plan.every((entry) => entry.exists) ? 0 : 1;
  }

  const safety = createSafetyBackup(context, plan, options);
  if (safety) {
    context.io.out(`Safety backup created: ${safety.dir}`);
  }

  const running = options.browserRunning
    ? BROWSERS.filter((browser) => options.browserRunning?.(browser) === true)
    : getRunningBrowserNames({ platform: options.platform });

  let failures = 0;
  let restored = 0;
  for (const entry of plan) {
    const { item, backupFile } = entry;
    const label = `${item.kind}/${item.browser}/${item.profile}`;
    if (!entry.exists) {
      context.io.err(`Could not restore ${label}: missing backup file ${backupFile}.`);
      failures += 1;
      continue;
    }
    if (running.includes(item.browser) && !options.force) {
      context.io.err(
        `Skipped ${label}: ${item.browser} is running (close it or use --force to override).`,
      );
      failures += 1;
      continue;
    }
    try {
      copyFileSafe(backupFile, item.source);
      restored += 1;
      context.io.out(`Restored ${label} -> ${item.source}`);
    } catch (error) {
      context.io.err(`Could not restore ${label}: ${describeError(error)}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    context.io.err(`Restore finished with ${failures} issue(s); ${restored} file(s) restored.`);
    return 1;
  }
  context.io.out(`Restored ${restored} file(s) from backup ${summary.id}.`);
  return 0;
}

function findBackup(backups: BackupSummary[], id: string | undefined): BackupSummary | undefined {
  if (!id) {
    return backups[0];
  }
  return backups.find((backup) => backup.id === id);
}

/** Backs up every target file that still exists, so the restore itself is reversible. */
function createSafetyBackup(
  context: CliContext,
  plan: RestorePlanItem[],
  options: RestoreCommandOptions,
): BackupResult | null {
  const sources: BackupSource[] = plan
    .filter((entry) => pathExists(entry.item.source))
    .map((entry) => ({
      kind: entry.item.kind,
      browser: entry.item.browser,
      profile: entry.item.profile,
      filePath: entry.item.source,
    }));
  if (sources.length === 0) {
    return null;
  }
  return createBackup({
    backupDir: context.config.backupDir,
    sources,
    now: options.now,
    platform: options.platform,
  });
}

function isRestorableItem(item: unknown): item is BackupItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const candidate = item as Record<string, unknown>;
  return (
    (candidate.kind === 'bookmarks' || candidate.kind === 'history') &&
    typeof candidate.browser === 'string' &&
    BROWSERS.includes(candidate.browser as BrowserName) &&
    typeof candidate.profile === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.file === 'string' &&
    candidate.file.length > 0
  );
}
