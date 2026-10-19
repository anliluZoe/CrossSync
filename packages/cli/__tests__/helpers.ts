import fs from 'fs';
import os from 'os';
import path from 'path';

import type { BookmarkFile, CliConfig } from '@crosssync/shared';
import {
  createDefaultConfig,
  loadSqliteDriver,
  resolveCrossSyncDirs,
  writeJsonFileSafe,
} from '@crosssync/shared';

const tempDirs: string[] = [];

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

export function bookmarkFile(
  children: BookmarkFile['roots']['bookmark_bar']['children'],
): BookmarkFile {
  return {
    version: 1,
    roots: {
      bookmark_bar: { id: '1', name: 'Bookmarks bar', type: 'folder', children },
      other: { id: '4', name: 'Other bookmarks', type: 'folder', children: [] },
    },
  };
}

export function chromeBookmarks(): BookmarkFile {
  return {
    checksum: 'chrome-checksum',
    ...bookmarkFile([
      {
        id: '2',
        name: 'Chrome Only',
        type: 'url',
        url: 'https://chrome.example.com',
        date_added: '13390000000000000',
      },
      {
        id: '3',
        name: 'Shared',
        type: 'url',
        url: 'https://shared.example.com',
        date_added: '13390000000000000',
      },
    ]),
  };
}

export function edgeBookmarks(): BookmarkFile {
  return bookmarkFile([
    {
      id: '3',
      name: 'Shared (edge)',
      type: 'url',
      url: 'https://shared.example.com',
      date_added: '13395000000000000',
    },
    {
      id: '5',
      name: 'Edge Only',
      type: 'url',
      url: 'https://edge.example.com',
      date_added: '13392000000000000',
    },
  ]);
}

const CHROMIUM_EPOCH_OFFSET_MS = 11644473600000;

export function createHistoryDatabase(filePath: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const Database = loadSqliteDriver();
  const db = new Database(filePath);
  db.exec(
    'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, ' +
      'visit_count INTEGER NOT NULL DEFAULT 0, typed_count INTEGER NOT NULL DEFAULT 0, ' +
      'last_visit_time INTEGER NOT NULL)',
  );
  const insert = db.prepare(
    'INSERT INTO urls (url,title,visit_count,typed_count,last_visit_time) VALUES (?,?,?,?,?)',
  );
  insert.run(
    'https://edge.example.com',
    'Edge history',
    7,
    3,
    (1700000500000 + CHROMIUM_EPOCH_OFFSET_MS) * 1000,
  );
  insert.run(
    'https://chrome.example.com',
    'Chrome history',
    4,
    2,
    (1700000000000 + CHROMIUM_EPOCH_OFFSET_MS) * 1000,
  );
  db.close();
  return filePath;
}

export interface CliFixture {
  root: string;
  homeDir: string;
  chromeDataDir: string;
  edgeDataDir: string;
  profile: string;
  config: CliConfig;
  configFile: string;
}

/** Builds a temp home plus fake Chrome/Edge profile directories. */
export function createCliFixture(options: { withHistory?: boolean } = {}): CliFixture {
  const root = makeTempDir('crosssync-cli');
  const homeDir = path.join(root, 'home');
  const profile = 'Default';
  const chromeDataDir = path.join(root, 'chrome');
  const edgeDataDir = path.join(root, 'edge');

  writeJsonFileSafe(path.join(chromeDataDir, profile, 'Bookmarks'), chromeBookmarks());
  writeJsonFileSafe(path.join(edgeDataDir, profile, 'Bookmarks'), edgeBookmarks());
  if (options.withHistory !== false) {
    createHistoryDatabase(path.join(edgeDataDir, profile, 'History'));
  }

  const dirs = resolveCrossSyncDirs(homeDir);
  const config: CliConfig = {
    ...createDefaultConfig({
      dataDir: dirs.root,
      backupDir: dirs.backups,
      exportDir: dirs.exports,
      logDir: dirs.logs,
      profile,
    }),
    browsers: {
      chrome: { enabled: true, dataDir: chromeDataDir },
      edge: { enabled: true, dataDir: edgeDataDir },
    },
  };
  writeJsonFileSafe(dirs.configFile, config);

  return {
    root,
    homeDir,
    chromeDataDir,
    edgeDataDir,
    profile,
    config,
    configFile: dirs.configFile,
  };
}
