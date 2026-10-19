import fs from 'fs';
import os from 'os';
import path from 'path';

import type { BookmarkFile, BookmarkNode, CliConfig } from '@crosssync/shared';
import { createDefaultConfig, loadSqliteDriver, writeJsonFileSafe } from '@crosssync/shared';

const tempDirs: string[] = [];

/** Creates a temp directory that is removed by `cleanupTempDirs`. */
export function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export function folder(
  id: string,
  name: string,
  children: BookmarkNode[] = [],
  dateAdded?: string,
): BookmarkNode {
  return { id, name, type: 'folder', children, ...(dateAdded ? { date_added: dateAdded } : {}) };
}

export function url(id: string, name: string, href: string, dateAdded?: string): BookmarkNode {
  return { id, name, type: 'url', url: href, ...(dateAdded ? { date_added: dateAdded } : {}) };
}

export function bookmarkFile(
  bookmarkBar: BookmarkNode,
  other: BookmarkNode = folder('6', 'Other bookmarks'),
  checksum?: string,
): BookmarkFile {
  const file: BookmarkFile = { roots: { bookmark_bar: bookmarkBar, other }, version: 1 };
  if (checksum) {
    file.checksum = checksum;
  }
  return file;
}

export interface HistoryRow {
  url: string;
  title: string;
  visitCount: number;
  typedCount: number;
  /** Unix epoch milliseconds; converted to the Chromium epoch for storage. */
  lastVisitTime: number;
}

const CHROMIUM_EPOCH_OFFSET_MS = 11644473600000;

/** Creates a minimal `History` SQLite database shaped like Chromium's. */
export function createHistoryDatabase(filePath: string, rows: HistoryRow[]): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const Database = loadSqliteDriver();
  const db = new Database(filePath);
  db.exec(
    'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, ' +
      'visit_count INTEGER NOT NULL DEFAULT 0, typed_count INTEGER NOT NULL DEFAULT 0, ' +
      'last_visit_time INTEGER NOT NULL)',
  );
  const insert = db.prepare(
    'INSERT INTO urls (url, title, visit_count, typed_count, last_visit_time) VALUES (?, ?, ?, ?, ?)',
  );
  for (const row of rows) {
    insert.run(
      row.url,
      row.title,
      row.visitCount,
      row.typedCount,
      (row.lastVisitTime + CHROMIUM_EPOCH_OFFSET_MS) * 1000,
    );
  }
  db.close();
  return filePath;
}

export interface FakeBrowserLayout {
  chromeDataDir: string;
  edgeDataDir: string;
  profile: string;
}

/** Creates "User Data" directories for Chrome and Edge under `root`. */
export function createBrowserLayout(
  root: string,
  chromeFile: BookmarkFile,
  edgeFile: BookmarkFile,
  options: { profile?: string; historyRows?: HistoryRow[] } = {},
): FakeBrowserLayout {
  const profile = options.profile ?? 'Default';
  const chromeDataDir = path.join(root, 'chrome');
  const edgeDataDir = path.join(root, 'edge');

  writeJsonFileSafe(path.join(chromeDataDir, profile, 'Bookmarks'), chromeFile);
  writeJsonFileSafe(path.join(edgeDataDir, profile, 'Bookmarks'), edgeFile);

  if (options.historyRows && options.historyRows.length > 0) {
    createHistoryDatabase(path.join(edgeDataDir, profile, 'History'), options.historyRows);
  }

  return { chromeDataDir, edgeDataDir, profile };
}

/** Config pointing all runtime directories inside `root`. */
export function createTestConfig(
  root: string,
  layout: FakeBrowserLayout,
  overrides: Partial<CliConfig> = {},
): CliConfig {
  const base = createDefaultConfig({
    dataDir: path.join(root, '.crosssync'),
    backupDir: path.join(root, '.crosssync', 'backups'),
    exportDir: path.join(root, '.crosssync', 'export'),
    logDir: path.join(root, '.crosssync', 'logs'),
    profile: layout.profile,
  });

  return {
    ...base,
    browsers: {
      chrome: { enabled: true, dataDir: layout.chromeDataDir },
      edge: { enabled: true, dataDir: layout.edgeDataDir },
    },
    ...overrides,
  };
}
