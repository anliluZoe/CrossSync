import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { HISTORY_QUERY, type HistoryEntry } from '../src/history';
import {
  copyDatabaseToTemp,
  copyFileSafe,
  isBookmarkFile,
  isBookmarkNode,
  isBrowserName,
  isCliConfig,
  isHistoryEntry,
  isLogLevel,
  isPlainObject,
  listProfiles,
  loadSqliteDriver,
  parseChromiumTime,
  readJsonFile,
  readSqliteCopy,
  resolveBrowserDataDir,
  resolveCrossSyncDirs,
  resolveHomeDir,
  safeJsonParse,
  toChromiumTime,
  writeJsonFileSafe,
} from '../src/utils';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('nope')).toBeNull();
    expect(safeJsonParse('')).toBeNull();
    expect(safeJsonParse('{')).toBeNull();
  });
});

describe('JSON file helpers', () => {
  it('writes and reads JSON atomically', () => {
    const dir = makeTempDir('crosssync-json');
    const file = path.join(dir, 'nested', 'config.json');

    writeJsonFileSafe(file, { hello: 'world' });

    expect(fs.existsSync(file)).toBe(true);
    expect(readJsonFile<{ hello: string }>(file)).toEqual({ hello: 'world' });
  });

  it('leaves no temporary files behind', () => {
    const dir = makeTempDir('crosssync-json');
    const file = path.join(dir, 'config.json');
    writeJsonFileSafe(file, { a: 1 });
    expect(fs.readdirSync(dir)).toEqual(['config.json']);
  });

  it('readJsonFile returns null for a missing file', () => {
    expect(readJsonFile(path.join(makeTempDir('crosssync-json'), 'missing.json'))).toBeNull();
  });

  it('readJsonFile returns null for malformed JSON', () => {
    const dir = makeTempDir('crosssync-json');
    const file = path.join(dir, 'broken.json');
    fs.writeFileSync(file, '{ not json');
    expect(readJsonFile(file)).toBeNull();
  });
});

describe('copyFileSafe', () => {
  it('copies a file and creates parent directories', () => {
    const dir = makeTempDir('crosssync-copy');
    const source = path.join(dir, 'source.txt');
    const destination = path.join(dir, 'deep', 'nested', 'dest.txt');
    fs.writeFileSync(source, 'payload');

    copyFileSafe(source, destination);

    expect(fs.readFileSync(destination, 'utf8')).toBe('payload');
  });
});

describe('Chromium time conversion', () => {
  it('converts Chromium microseconds to Unix milliseconds', () => {
    const unixMs = 1700000000000;
    expect(parseChromiumTime(toChromiumTime(unixMs))).toBe(unixMs);
  });

  it('returns 0 for missing or invalid values', () => {
    expect(parseChromiumTime(undefined)).toBe(0);
    expect(parseChromiumTime(null)).toBe(0);
    expect(parseChromiumTime('')).toBe(0);
    expect(parseChromiumTime('not-a-number')).toBe(0);
  });

  it('accepts numeric input', () => {
    expect(parseChromiumTime(11644473600000000)).toBe(0);
  });
});

describe('resolveHomeDir', () => {
  it('prefers USERPROFILE on Windows', () => {
    expect(resolveHomeDir({ USERPROFILE: 'C:\\Users\\me', HOME: '/home/me' }, 'win32')).toBe(
      'C:\\Users\\me',
    );
  });

  it('prefers HOME on POSIX', () => {
    expect(resolveHomeDir({ HOME: '/home/me' }, 'linux')).toBe('/home/me');
    expect(resolveHomeDir({ HOME: '/Users/me' }, 'darwin')).toBe('/Users/me');
  });

  it('falls back to the OS home directory', () => {
    expect(resolveHomeDir({}, 'linux')).toBe(os.homedir());
  });
});

describe('resolveBrowserDataDir', () => {
  it('resolves the Windows Chrome path from LOCALAPPDATA', () => {
    const dir = resolveBrowserDataDir('chrome', {
      platform: 'win32',
      env: { USERPROFILE: 'C:\\Users\\me', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    });
    expect(dir).toBe(path.join('C:\\Users\\me\\AppData\\Local', 'Google', 'Chrome', 'User Data'));
  });

  it('falls back to USERPROFILE when LOCALAPPDATA is absent', () => {
    const dir = resolveBrowserDataDir('edge', {
      platform: 'win32',
      env: { USERPROFILE: 'C:\\Users\\me' },
    });
    expect(dir).toBe(
      path.join('C:\\Users\\me', 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
    );
  });

  it('resolves the macOS Chrome path', () => {
    const dir = resolveBrowserDataDir('chrome', {
      platform: 'darwin',
      env: { HOME: '/Users/me' },
    });
    expect(dir).toBe(path.join('/Users/me', 'Library', 'Application Support', 'Google', 'Chrome'));
  });

  it('resolves the macOS Edge path', () => {
    const dir = resolveBrowserDataDir('edge', { platform: 'darwin', env: { HOME: '/Users/me' } });
    expect(dir).toBe(path.join('/Users/me', 'Library', 'Application Support', 'Microsoft Edge'));
  });

  it('resolves the Linux Chrome path', () => {
    const dir = resolveBrowserDataDir('chrome', { platform: 'linux', env: { HOME: '/home/me' } });
    expect(dir).toBe(path.join('/home/me', '.config', 'google-chrome'));
  });

  it('resolves the Linux Edge path', () => {
    const dir = resolveBrowserDataDir('edge', { platform: 'linux', env: { HOME: '/home/me' } });
    expect(dir).toBe(path.join('/home/me', '.config', 'microsoft-edge'));
  });
});

describe('listProfiles', () => {
  it('returns only real profile directories, sorted', () => {
    const dataDir = makeTempDir('crosssync-profiles');
    for (const name of ['Profile 2', 'Default', 'Crashpad', 'Profile 1', 'ShaderCache']) {
      fs.mkdirSync(path.join(dataDir, name));
    }
    fs.writeFileSync(path.join(dataDir, 'Local State'), '{}');

    expect(listProfiles(dataDir)).toEqual(['Default', 'Profile 1', 'Profile 2']);
  });

  it('returns an empty array when the data dir is missing', () => {
    expect(listProfiles(path.join(os.tmpdir(), 'crosssync-missing-datadir'))).toEqual([]);
  });
});

describe('resolveCrossSyncDirs', () => {
  it('nests every runtime path under ~/.crosssync', () => {
    const dirs = resolveCrossSyncDirs(path.join('/home', 'me'));
    expect(dirs.root).toBe(path.join('/home', 'me', '.crosssync'));
    expect(dirs.backups).toBe(path.join(dirs.root, 'backups'));
    expect(dirs.exports).toBe(path.join(dirs.root, 'export'));
    expect(dirs.logs).toBe(path.join(dirs.root, 'logs'));
    expect(dirs.configFile).toBe(path.join(dirs.root, 'config.json'));
    expect(dirs.logFile).toBe(path.join(dirs.logs, 'crosssync.log'));
  });
});

describe('SQLite copy-then-read', () => {
  function createHistoryDatabase(dir: string): string {
    const dbPath = path.join(dir, 'History');
    const Database = loadSqliteDriver();
    const db = new Database(dbPath);
    db.exec(
      'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, ' +
        'visit_count INTEGER NOT NULL DEFAULT 0, typed_count INTEGER NOT NULL DEFAULT 0, ' +
        'last_visit_time INTEGER NOT NULL)',
    );
    const insert = db.prepare(
      'INSERT INTO urls (url, title, visit_count, typed_count, last_visit_time) ' +
        'VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('https://example.com', 'Example', 4, 2, '13390000000000000');
    insert.run('https://docs.example.com', 'Docs', 1, 0, '13391000000000000');
    insert.run('https://old.example.com', 'Old', 9, 5, '13380000000000000');
    db.close();
    return dbPath;
  }

  it('copies the database and reads rows through the driver', () => {
    const dir = makeTempDir('crosssync-sqlite');
    const dbPath = createHistoryDatabase(dir);

    const rows = readSqliteCopy<{
      url: string;
      title: string;
      visit_count: number;
      typed_count: number;
      last_visit_time: string;
    }>(dbPath, { sql: HISTORY_QUERY });

    expect(rows).toHaveLength(3);
    expect(rows[0].url).toBe('https://docs.example.com');

    const entries: HistoryEntry[] = rows.map((row) => ({
      url: row.url,
      title: row.title,
      visitCount: row.visit_count,
      typedCount: row.typed_count,
      lastVisitTime: parseChromiumTime(row.last_visit_time),
    }));
    expect(entries.every(isHistoryEntry)).toBe(true);
    expect(entries[0].lastVisitTime).toBe(parseChromiumTime('13391000000000000'));
  });

  it('does not modify the original database', () => {
    const dir = makeTempDir('crosssync-sqlite');
    const dbPath = createHistoryDatabase(dir);
    const before = fs.statSync(dbPath).mtimeMs;

    readSqliteCopy(dbPath, { sql: HISTORY_QUERY });

    expect(fs.statSync(dbPath).mtimeMs).toBe(before);
  });

  it('copies to a temp directory holding the same file name', () => {
    const dir = makeTempDir('crosssync-sqlite');
    const dbPath = createHistoryDatabase(dir);

    const tempCopy = copyDatabaseToTemp(dbPath);
    expect(fs.existsSync(tempCopy)).toBe(true);
    expect(path.basename(tempCopy)).toBe('History');
    expect(path.dirname(tempCopy)).not.toBe(dir);
    fs.rmSync(path.dirname(tempCopy), { recursive: true, force: true });
  });

  it('throws a helpful error when the database is missing', () => {
    const missing = path.join(makeTempDir('crosssync-sqlite'), 'History');
    expect(() => readSqliteCopy(missing, { sql: HISTORY_QUERY })).toThrow(/not found/);
  });

  it('loads the better-sqlite3 driver lazily and caches it', () => {
    const first = loadSqliteDriver();
    expect(typeof first).toBe('function');
    expect(loadSqliteDriver()).toBe(first);
  });
});

describe('type guards', () => {
  it('isPlainObject', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('isBookmarkNode accepts folders and urls', () => {
    expect(isBookmarkNode({ id: '1', name: 'Bar', type: 'folder', children: [] })).toBe(true);
    expect(isBookmarkNode({ id: '2', name: 'Ex', type: 'url', url: 'https://example.com' })).toBe(
      true,
    );
  });

  it('isBookmarkNode rejects malformed nodes', () => {
    expect(isBookmarkNode(null)).toBe(false);
    expect(isBookmarkNode({ id: 1 })).toBe(false);
    expect(isBookmarkNode({ id: '1', name: 'x', type: 'file' })).toBe(false);
    expect(isBookmarkNode({ id: '1', name: 'x', type: 'folder', children: 'nope' })).toBe(false);
    expect(isBookmarkNode({ id: '1', name: 'x', type: 'folder', children: [{ id: 1 }] })).toBe(
      false,
    );
  });

  it('isBookmarkFile requires bookmark_bar and other roots', () => {
    const roots = {
      bookmark_bar: { id: '1', name: 'Bar', type: 'folder' },
      other: { id: '2', name: 'Other', type: 'folder' },
    };
    expect(isBookmarkFile({ roots })).toBe(true);
    expect(isBookmarkFile({ roots: { bookmark_bar: roots.bookmark_bar } })).toBe(false);
    expect(isBookmarkFile({})).toBe(false);
  });

  it('isHistoryEntry', () => {
    expect(
      isHistoryEntry({
        url: 'https://example.com',
        title: 'Example',
        visitCount: 1,
        typedCount: 0,
        lastVisitTime: 1,
      }),
    ).toBe(true);
    expect(isHistoryEntry({ url: 'https://example.com' })).toBe(false);
    expect(isHistoryEntry(null)).toBe(false);
  });

  it('isLogLevel', () => {
    expect(isLogLevel('debug')).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
    expect(isLogLevel(1)).toBe(false);
  });

  it('isBrowserName', () => {
    expect(isBrowserName('chrome')).toBe(true);
    expect(isBrowserName('edge')).toBe(true);
    expect(isBrowserName('firefox')).toBe(false);
  });

  it('isCliConfig rejects non-configs', () => {
    expect(isCliConfig(null)).toBe(false);
    expect(isCliConfig({})).toBe(false);
  });
});
