import fs from 'fs';
import path from 'path';

import type { BrowserName } from '@crosssync/shared';
import {
  copyFileSafe,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFileSafe,
} from '@crosssync/shared';

export type BackupKind = 'bookmarks' | 'history';

export interface BackupSource {
  kind: BackupKind;
  browser: BrowserName;
  profile: string;
  /** Absolute path of the file to copy. */
  filePath: string;
}

export interface BackupItem {
  kind: BackupKind;
  browser: BrowserName;
  profile: string;
  /** Original location the copy was taken from. */
  source: string;
  /** File name inside the backup directory. */
  file: string;
  bytes: number;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  platform: string;
  items: BackupItem[];
}

export interface BackupResult {
  id: string;
  dir: string;
  manifestFile: string;
  manifest: BackupManifest;
  /** False when none of the requested sources existed yet. */
  copied: boolean;
}

export interface BackupOptions {
  backupDir: string;
  sources: BackupSource[];
  /** Injectable clock, used by tests. */
  now?: Date;
  platform?: NodeJS.Platform;
}

export interface BackupSummary {
  id: string;
  dir: string;
  createdAt: string | null;
  itemCount: number;
  bytes: number;
}

export const BACKUP_MANIFEST_FILE = 'manifest.json';

/** `20260116-093000` style id, derived from local time. */
export function formatBackupId(date: Date): string {
  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join('-');
}

/** File name a source is stored under inside a backup directory. */
export function backupFileName(source: BackupSource): string {
  const extension = path.extname(source.filePath);
  return `${source.kind}-${source.browser}-${source.profile}${extension}`;
}

/**
 * Copies every existing source file into a timestamped backup directory.
 *
 * Throws when a copy fails: `sync` treats a failed backup as a hard stop before
 * anything is written back to a browser.
 */
export function createBackup(options: BackupOptions): BackupResult {
  const now = options.now ?? new Date();
  const dir = uniqueDirectory(path.join(options.backupDir, formatBackupId(now)));
  ensureDir(dir);

  const items: BackupItem[] = [];
  for (const source of options.sources) {
    if (!pathExists(source.filePath)) {
      continue;
    }
    const fileName = backupFileName(source);
    const target = path.join(dir, fileName);
    copyFileSafe(source.filePath, target);
    items.push({
      kind: source.kind,
      browser: source.browser,
      profile: source.profile,
      source: source.filePath,
      file: fileName,
      bytes: fs.statSync(target).size,
    });
  }

  const manifest: BackupManifest = {
    id: path.basename(dir),
    createdAt: now.toISOString(),
    platform: options.platform ?? process.platform,
    items,
  };
  const manifestFile = path.join(dir, BACKUP_MANIFEST_FILE);
  writeJsonFileSafe(manifestFile, manifest);

  return { id: manifest.id, dir, manifestFile, manifest, copied: items.length > 0 };
}

/** Lists backups newest first. */
export function listBackups(backupDir: string): BackupSummary[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(backupDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => summarizeBackup(backupDir, entry.name))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Removes all but the `keep` most recent backups and returns the removed dirs. */
export function pruneBackups(backupDir: string, keep: number): string[] {
  if (keep < 0) {
    return [];
  }
  const removals = listBackups(backupDir)
    .slice(keep)
    .map((summary) => summary.dir);
  for (const dir of removals) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return removals;
}

function summarizeBackup(backupDir: string, id: string): BackupSummary {
  const dir = path.join(backupDir, id);
  const manifest = readJsonFile<BackupManifest>(path.join(dir, BACKUP_MANIFEST_FILE));
  const items = manifest?.items ?? [];
  return {
    id,
    dir,
    createdAt: manifest?.createdAt ?? null,
    itemCount: items.length,
    bytes: items.reduce((total, item) => total + (item.bytes ?? 0), 0),
  };
}

function uniqueDirectory(preferred: string): string {
  if (!pathExists(preferred)) {
    return preferred;
  }
  let suffix = 1;
  let candidate = `${preferred}-${suffix}`;
  while (pathExists(candidate)) {
    suffix += 1;
    candidate = `${preferred}-${suffix}`;
  }
  return candidate;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
