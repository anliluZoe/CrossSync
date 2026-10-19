import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { parseChromiumTime } from '@crosssync/shared';

import { countBookmarkFileNodes, createBrowserReader, toHistoryEntry } from '../src/readers';
import {
  bookmarkFile,
  cleanupTempDirs,
  createHistoryDatabase,
  folder,
  makeTempDir,
  url,
} from './helpers';

afterEach(() => {
  cleanupTempDirs();
});

describe('toHistoryEntry', () => {
  it('normalises SQLite rows into HistoryEntry', () => {
    const entry = toHistoryEntry({
      id: 3,
      url: 'https://example.com',
      title: 'Example',
      visit_count: 4,
      typed_count: 2,
      last_visit_time: '13390000000000000',
    });

    expect(entry).toEqual({
      id: 3,
      url: 'https://example.com',
      title: 'Example',
      visitCount: 4,
      typedCount: 2,
      lastVisitTime: parseChromiumTime('13390000000000000'),
    });
  });

  it('accepts numeric and bigint timestamps', () => {
    const numeric = toHistoryEntry({
      url: 'https://a.example.com',
      last_visit_time: 13390000000000000,
    });
    const bigint = toHistoryEntry({
      url: 'https://a.example.com',
      last_visit_time: BigInt('13390000000000000'),
    });

    expect(numeric.lastVisitTime).toBe(parseChromiumTime('13390000000000000'));
    expect(bigint.lastVisitTime).toBe(numeric.lastVisitTime);
  });

  it('defaults missing fields', () => {
    const entry = toHistoryEntry({ url: 'https://a.example.com' });
    expect(entry).toMatchObject({ title: '', visitCount: 0, typedCount: 0, lastVisitTime: 0 });
    expect(entry.id).toBeUndefined();
  });

  it('accepts a null title and null timestamp', () => {
    const entry = toHistoryEntry({
      url: 'https://a.example.com',
      title: null,
      last_visit_time: null,
    });
    expect(entry.title).toBe('');
    expect(entry.lastVisitTime).toBe(0);
  });
});

describe('countBookmarkFileNodes', () => {
  it('counts nodes across every root', () => {
    const file = bookmarkFile(
      folder('1', 'Bar', [url('2', 'A', 'https://a.example.com')]),
      folder('3', 'Other', [url('4', 'B', 'https://b.example.com')]),
    );
    expect(countBookmarkFileNodes(file)).toBe(4);
  });

  it('includes the synced root when present', () => {
    const file = bookmarkFile(folder('1', 'Bar'), folder('3', 'Other'));
    file.roots.synced = folder('5', 'Mobile', [url('6', 'C', 'https://c.example.com')]);
    expect(countBookmarkFileNodes(file)).toBe(4);
  });
});

describe('createBrowserReader', () => {
  function setup(): { dataDir: string } {
    const root = makeTempDir('crosssync-reader');
    const dataDir = path.join(root, 'chrome');
    fs.mkdirSync(path.join(dataDir, 'Default'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'Profile 1'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'Crashpad'), { recursive: true });

    fs.writeFileSync(
      path.join(dataDir, 'Default', 'Bookmarks'),
      JSON.stringify(
        bookmarkFile(folder('1', 'Bar', [url('2', 'A', 'https://a.example.com', '1000')])),
      ),
    );
    createHistoryDatabase(path.join(dataDir, 'Default', 'History'), [
      {
        url: 'https://a.example.com',
        title: 'A',
        visitCount: 2,
        typedCount: 1,
        lastVisitTime: 1700000000000,
      },
    ]);

    return { dataDir };
  }

  it('lists real profiles only', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(reader.profiles()).toEqual(['Default', 'Profile 1']);
  });

  it('reads profile names and accounts from Local State', () => {
    const { dataDir } = setup();
    fs.writeFileSync(
      path.join(dataDir, 'Local State'),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: 'Personal', user_name: 'me@example.com', gaia_name: 'Me' },
            'Profile 1': {
              name: '您的 Chrome 数据',
              user_name: 'work@example.com',
              gaia_name: 'Work',
              is_using_default_name: true,
            },
          },
        },
      }),
    );
    const reader = createBrowserReader('chrome', { dataDir });

    expect(reader.profileInfos()).toEqual([
      { profile: 'Default', name: 'Personal', userName: 'me@example.com', gaiaName: 'Me' },
      {
        profile: 'Profile 1',
        name: '您的 Chrome 数据',
        userName: 'work@example.com',
        gaiaName: 'Work',
        isUsingDefaultName: true,
      },
    ]);
    expect(reader.profileInfo('Profile 1')?.userName).toBe('work@example.com');
    expect(reader.profileInfo('Profile 9')).toBeNull();
  });

  it('tolerates a missing or malformed Local State', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(reader.profileInfos()).toEqual([{ profile: 'Default' }, { profile: 'Profile 1' }]);

    fs.writeFileSync(path.join(dataDir, 'Local State'), 'not json');
    expect(reader.profileInfo('Default')).toEqual({ profile: 'Default' });
  });

  it('resolves a single profile or all of them', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(reader.resolveProfiles('Default')).toEqual(['Default']);
    expect(reader.resolveProfiles('all')).toEqual(['Default', 'Profile 1']);
    expect(reader.resolveProfiles('Profile 9')).toEqual([]);
  });

  it('resolves comma-separated profile lists', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(reader.resolveProfiles('Default,Profile 1')).toEqual(['Default', 'Profile 1']);
    expect(reader.resolveProfiles('Profile 1, Default')).toEqual(['Profile 1', 'Default']);
    expect(reader.resolveProfiles('Default,Profile 9')).toEqual(['Default']);
    expect(reader.resolveProfiles('Default,Default')).toEqual(['Default']);
  });

  it('builds the expected file paths', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(reader.bookmarksPath('Default')).toBe(path.join(dataDir, 'Default', 'Bookmarks'));
    expect(reader.historyPath('Default')).toBe(path.join(dataDir, 'Default', 'History'));
  });

  it('reads a bookmark file', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });

    const source = reader.readBookmarks('Default');

    expect(source.browser).toBe('chrome');
    expect(source.profile).toBe('Default');
    expect(source.filePath).toBe(path.join(dataDir, 'Default', 'Bookmarks'));
    expect(source.file.roots.bookmark_bar.children?.[0].url).toBe('https://a.example.com');
  });

  it('reads history through a temporary copy of the SQLite file', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('edge', { dataDir });

    const source = reader.readHistory('Default');

    expect(source.entries).toHaveLength(1);
    expect(source.entries[0]).toMatchObject({
      url: 'https://a.example.com',
      title: 'A',
      visitCount: 2,
      typedCount: 1,
      lastVisitTime: 1700000000000,
    });
  });

  it('rejects a file that is not a Chromium bookmark file', () => {
    const { dataDir } = setup();
    fs.writeFileSync(path.join(dataDir, 'Profile 1', 'Bookmarks'), '{"nope": true}');
    const reader = createBrowserReader('chrome', { dataDir });
    expect(() => reader.readBookmarks('Profile 1')).toThrow(/Not a valid Chromium bookmark file/);
  });

  it('throws when a history database is missing', () => {
    const { dataDir } = setup();
    const reader = createBrowserReader('chrome', { dataDir });
    expect(() => reader.readHistory('Profile 1')).toThrow(/not found/);
  });
});
