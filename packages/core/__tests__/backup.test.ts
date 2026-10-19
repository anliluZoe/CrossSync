import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  BACKUP_MANIFEST_FILE,
  backupFileName,
  createBackup,
  formatBackupId,
  listBackups,
  pruneBackups,
  type BackupSource,
} from '../src/backup';
import { cleanupTempDirs, makeTempDir } from './helpers';

afterEach(() => {
  cleanupTempDirs();
});

function writeSource(root: string, name: string, content: string): string {
  const filePath = path.join(root, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('formatBackupId', () => {
  it('formats a sortable local timestamp', () => {
    expect(formatBackupId(new Date(2026, 0, 16, 9, 30, 5))).toBe('20260116-093005');
  });

  it('pads single digit parts', () => {
    expect(formatBackupId(new Date(2026, 8, 1, 3, 4, 5))).toBe('20260901-030405');
  });
});

describe('backupFileName', () => {
  it('keeps the extension and encodes the source', () => {
    expect(
      backupFileName({
        kind: 'bookmarks',
        browser: 'chrome',
        profile: 'Default',
        filePath: path.join('x', 'Bookmarks'),
      }),
    ).toBe('bookmarks-chrome-Default');
  });

  it('preserves a file extension when present', () => {
    expect(
      backupFileName({
        kind: 'history',
        browser: 'edge',
        profile: 'Profile 1',
        filePath: path.join('x', 'History.db'),
      }),
    ).toBe('history-edge-Profile 1.db');
  });
});

describe('createBackup', () => {
  it('copies every existing source and writes a manifest', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    const bookmarks = writeSource(root, 'Bookmarks', '{"roots":{}}');
    const history = writeSource(root, 'History', 'sqlite');

    const result = createBackup({
      backupDir,
      now: new Date(2026, 0, 16, 9, 30, 5),
      platform: 'linux',
      sources: [
        { kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: bookmarks },
        { kind: 'history', browser: 'edge', profile: 'Default', filePath: history },
      ],
    });

    expect(result.id).toBe('20260116-093005');
    expect(result.copied).toBe(true);
    expect(result.manifest.platform).toBe('linux');
    expect(result.manifest.items).toHaveLength(2);
    expect(fs.existsSync(result.manifestFile)).toBe(true);
    expect(fs.readFileSync(path.join(result.dir, 'bookmarks-chrome-Default'), 'utf8')).toBe(
      '{"roots":{}}',
    );
  });

  it('skips sources that do not exist yet', () => {
    const root = makeTempDir('crosssync-backup');
    const result = createBackup({
      backupDir: path.join(root, 'backups'),
      sources: [
        {
          kind: 'bookmarks',
          browser: 'chrome',
          profile: 'Default',
          filePath: path.join(root, 'missing'),
        },
      ],
    });

    expect(result.copied).toBe(false);
    expect(result.manifest.items).toEqual([]);
  });

  it('does not overwrite a backup taken in the same second', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    const file = writeSource(root, 'Bookmarks', 'one');
    const now = new Date(2026, 0, 16, 9, 30, 5);
    const sources: BackupSource[] = [
      { kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: file },
    ];

    const first = createBackup({ backupDir, sources, now });
    fs.writeFileSync(file, 'two');
    const second = createBackup({ backupDir, sources, now });

    expect(second.id).not.toBe(first.id);
    expect(second.id).toBe('20260116-093005-1');
    expect(fs.readFileSync(path.join(first.dir, 'bookmarks-chrome-Default'), 'utf8')).toBe('one');
    expect(fs.readFileSync(path.join(second.dir, 'bookmarks-chrome-Default'), 'utf8')).toBe('two');
  });

  it('propagates failures so sync can abort before write-back', () => {
    const root = makeTempDir('crosssync-backup');
    const blocked = path.join(root, 'backups');
    fs.writeFileSync(blocked, 'not a directory');
    const source = writeSource(root, 'Bookmarks', 'x');

    expect(() =>
      createBackup({
        backupDir: blocked,
        sources: [{ kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: source }],
      }),
    ).toThrow();
  });
});

describe('listBackups', () => {
  it('returns summaries newest first', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    const file = writeSource(root, 'Bookmarks', 'x');
    const sources: BackupSource[] = [
      { kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: file },
    ];

    createBackup({ backupDir, sources, now: new Date(2026, 0, 16, 9, 0, 0) });
    createBackup({ backupDir, sources, now: new Date(2026, 0, 17, 9, 0, 0) });

    const summaries = listBackups(backupDir);

    expect(summaries.map((summary) => summary.id)).toEqual(['20260117-090000', '20260116-090000']);
    expect(summaries[0].itemCount).toBe(1);
    expect(summaries[0].createdAt).toBe(new Date(2026, 0, 17, 9, 0, 0).toISOString());
    expect(summaries[0].bytes).toBeGreaterThan(0);
  });

  it('returns an empty list when the backup dir is missing', () => {
    expect(listBackups(path.join(makeTempDir('crosssync-backup'), 'nope'))).toEqual([]);
  });

  it('tolerates a backup directory without a manifest', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    fs.mkdirSync(path.join(backupDir, '20260101-000000'), { recursive: true });

    const summaries = listBackups(backupDir);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ createdAt: null, itemCount: 0, bytes: 0 });
  });
});

describe('pruneBackups', () => {
  it('keeps the newest N backups', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    const file = writeSource(root, 'Bookmarks', 'x');
    const sources: BackupSource[] = [
      { kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: file },
    ];

    for (const day of [14, 15, 16, 17]) {
      createBackup({ backupDir, sources, now: new Date(2026, 0, day, 9, 0, 0) });
    }

    const removed = pruneBackups(backupDir, 2);

    expect(removed).toHaveLength(2);
    expect(listBackups(backupDir).map((summary) => summary.id)).toEqual([
      '20260117-090000',
      '20260116-090000',
    ]);
  });

  it('removes nothing when keep is negative or larger than the count', () => {
    const root = makeTempDir('crosssync-backup');
    const backupDir = path.join(root, 'backups');
    const file = writeSource(root, 'Bookmarks', 'x');

    createBackup({
      backupDir,
      sources: [{ kind: 'bookmarks', browser: 'chrome', profile: 'Default', filePath: file }],
      now: new Date(2026, 0, 16, 9, 0, 0),
    });

    expect(pruneBackups(backupDir, -1)).toEqual([]);
    expect(pruneBackups(backupDir, 5)).toEqual([]);
    expect(listBackups(backupDir)).toHaveLength(1);
  });
});
