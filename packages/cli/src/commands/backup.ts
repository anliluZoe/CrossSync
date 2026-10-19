import { pathExists } from '@crosssync/shared';
import {
  createBackup,
  createConfiguredBrowserReaders,
  DEFAULT_BACKUP_RETENTION,
  listBackups,
  pruneBackups,
  type BackupSource,
} from '@crosssync/core';

import type { CliContext } from '../context';
import { describeError } from './read';

export interface BackupCommandOptions {
  /** List existing backups instead of creating one. */
  list?: boolean;
  /** Delete all but the N most recent backups. */
  prune?: boolean;
  keep?: number;
  /** Keep at most N backups after creating a new one. */
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export function runBackupCommand(context: CliContext, options: BackupCommandOptions = {}): number {
  if (options.list) {
    return listBackupCommand(context);
  }
  if (options.prune) {
    return pruneBackupCommand(context, options.keep ?? DEFAULT_BACKUP_RETENTION);
  }
  return createBackupCommand(context, options);
}

/** Every bookmark/history file that currently exists, ready to be backed up. */
export function collectBackupSources(
  config: CliContext['config'],
  options: BackupCommandOptions = {},
): BackupSource[] {
  const sources: BackupSource[] = [];
  const readers = createConfiguredBrowserReaders(config, {
    platform: options.platform,
    env: options.env,
  });

  for (const reader of readers) {
    for (const profile of reader.resolveProfiles(config.profile)) {
      const bookmarks = reader.bookmarksPath(profile);
      if (pathExists(bookmarks)) {
        sources.push({ kind: 'bookmarks', browser: reader.browser, profile, filePath: bookmarks });
      }
      const history = reader.historyPath(profile);
      if (pathExists(history)) {
        sources.push({ kind: 'history', browser: reader.browser, profile, filePath: history });
      }
    }
  }

  return sources;
}

function createBackupCommand(context: CliContext, options: BackupCommandOptions): number {
  const sources = collectBackupSources(context.config, options);
  if (sources.length === 0) {
    context.io.err('No browser bookmark or history files were found to back up.');
    return 1;
  }

  try {
    const result = createBackup({
      backupDir: context.config.backupDir,
      sources,
      now: options.now,
      platform: options.platform,
    });
    context.logger.info('Backup created', { dir: result.dir });
    context.io.out(`Backup created: ${result.dir}`);
    context.io.out(`  ${result.manifest.items.length} file(s) copied`);
    for (const item of result.manifest.items) {
      context.io.out(`    ${item.kind}/${item.browser}/${item.profile} (${item.bytes} bytes)`);
    }
    return 0;
  } catch (error) {
    context.io.err(`Backup failed: ${describeError(error)}`);
    return 1;
  }
}

function listBackupCommand(context: CliContext): number {
  const summaries = listBackups(context.config.backupDir);
  if (summaries.length === 0) {
    context.io.out(`No backups found in ${context.config.backupDir}.`);
    return 0;
  }

  context.io.out(`Backups in ${context.config.backupDir}:`);
  for (const summary of summaries) {
    const created = summary.createdAt ?? 'unknown';
    context.io.out(
      `  ${summary.id}  ${created}  ${summary.itemCount} file(s)  ${formatBytes(summary.bytes)}`,
    );
  }
  return 0;
}

function pruneBackupCommand(context: CliContext, keep: number): number {
  const removed = pruneBackups(context.config.backupDir, keep);
  if (removed.length === 0) {
    context.io.out(`Nothing to prune; keeping ${keep} most recent backup(s).`);
    return 0;
  }
  context.io.out(`Removed ${removed.length} backup(s), keeping the ${keep} most recent:`);
  for (const dir of removed) {
    context.io.out(`  ${dir}`);
  }
  return 0;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
