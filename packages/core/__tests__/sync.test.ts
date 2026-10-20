import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import type { BookmarkFile } from '@crosssync/shared';
import { readJsonFile } from '@crosssync/shared';

import { runSync, writeBackBookmarks } from '../src/sync';
import { Logger } from '../src/logger';
import {
  bookmarkFile,
  cleanupTempDirs,
  createBrowserLayout,
  createTestConfig,
  folder,
  makeTempDir,
  url,
} from './helpers';

const NOW = new Date(2026, 0, 16, 9, 30, 5);

function chromeBookmarks(): BookmarkFile {
  return bookmarkFile(
    folder('1', 'Bookmarks bar', [
      url('2', 'Chrome only', 'https://chrome.example.com', '2000000'),
    ]),
    folder('6', 'Other bookmarks'),
    'stale-checksum',
  );
}

function edgeBookmarks(): BookmarkFile {
  return bookmarkFile(
    folder('1', 'Bookmarks bar', [url('7', 'Edge only', 'https://edge.example.com', '2500000')]),
    folder('6', 'Other bookmarks'),
  );
}

const HISTORY_ROWS = [
  {
    url: 'https://chrome.example.com',
    title: 'Chrome',
    visitCount: 3,
    typedCount: 1,
    lastVisitTime: 1700000000000,
  },
  {
    url: 'https://edge.example.com',
    title: 'Edge',
    visitCount: 5,
    typedCount: 2,
    lastVisitTime: 1700000500000,
  },
];

function setup(options: { history?: boolean } = {}) {
  const root = makeTempDir('crosssync-sync');
  const layout = createBrowserLayout(root, chromeBookmarks(), edgeBookmarks(), {
    historyRows: options.history ? HISTORY_ROWS : undefined,
  });
  const config = createTestConfig(root, layout);
  return { root, layout, config };
}

function readBookmarkFile(filePath: string): BookmarkFile {
  const file = readJsonFile<BookmarkFile>(filePath);
  if (!file) {
    throw new Error(`missing ${filePath}`);
  }
  return file;
}

function barChildIds(file: BookmarkFile): string[] {
  return (file.roots.bookmark_bar.children ?? []).map((child) => child.id);
}

afterEach(() => {
  cleanupTempDirs();
});

describe('writeBackBookmarks', () => {
  it('drops the stale checksum but keeps the trees and version', () => {
    const root = makeTempDir('crosssync-write');
    const file = path.join(root, 'Bookmarks');
    fs.writeFileSync(file, '{}');

    writeBackBookmarks(file, { roots: chromeBookmarks().roots, version: 1, checksum: 'stale' });

    const written = readBookmarkFile(file);
    expect(written.checksum).toBeUndefined();
    expect(written.version).toBe(1);
    expect(barChildIds(written)).toEqual(['2']);
  });
});

describe('runSync - bookmarks', () => {
  function runBookmarkSync(overrides: Partial<Parameters<typeof runSync>[0]> = {}) {
    const { root, layout, config } = setup();
    const report = runSync({
      config,
      targets: { bookmarks: true, history: false },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
      ...overrides,
    });
    return { root, layout, config, report };
  }

  it('merges bookmarks and writes them back to both browsers', () => {
    const { layout, report } = runBookmarkSync();

    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    const edge = readBookmarkFile(path.join(layout.edgeDataDir, 'Default', 'Bookmarks'));

    expect(barChildIds(chrome)).toEqual(['2', '7']);
    expect(barChildIds(edge)).toEqual(['2', '7']);
    expect(report.bookmarkMerge?.stats.added).toBe(1);
    expect(report.browsers.every((outcome) => outcome.writtenBack)).toBe(true);
  });

  it('reports a failed write-back and keeps syncing the other browser', () => {
    const { layout, report } = runBookmarkSync({
      writeBookmarks: (filePath, file) => {
        if (filePath.includes(`${path.sep}chrome${path.sep}`)) {
          throw new Error('file is locked');
        }
        writeBackBookmarks(filePath, file);
      },
    });

    const chrome = report.browsers.find((outcome) => outcome.browser === 'chrome');
    const edge = report.browsers.find((outcome) => outcome.browser === 'edge');
    expect(chrome?.writtenBack).toBe(false);
    expect(chrome?.skippedWriteBackReason).toBe('write-failed');
    expect(edge?.writtenBack).toBe(true);
    expect(report.warnings.join('\n')).toContain('Could not write back chrome/Default');
    expect(report.warnings.join('\n')).toContain('file is locked');
    expect(
      barChildIds(readBookmarkFile(path.join(layout.edgeDataDir, 'Default', 'Bookmarks'))),
    ).toEqual(['2', '7']);
  });

  it('removes the stale checksum from the written files', () => {
    const { layout } = runBookmarkSync();
    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    expect(chrome.checksum).toBeUndefined();
  });

  it('backs everything up before touching the browser files', () => {
    const { report } = runBookmarkSync();

    expect(report.backup).not.toBeNull();
    expect(report.backup?.copied).toBe(true);
    expect(report.backup?.manifest.items).toHaveLength(2);

    const backupDir = report.backup?.dir ?? '';
    const backedUp = JSON.parse(
      fs.readFileSync(path.join(backupDir, 'bookmarks-chrome-Default'), 'utf8'),
    ) as BookmarkFile;
    expect(backedUp.checksum).toBe('stale-checksum');
  });

  it('exports the merged bookmarks as JSON', () => {
    const { config, report } = runBookmarkSync();

    expect(report.exportFiles).toHaveLength(1);
    expect(report.exportFiles[0]).toContain(path.join(config.exportDir, 'bookmarks-merged-'));
    expect(barChildIds(readBookmarkFile(report.exportFiles[0]))).toEqual(['2', '7']);
  });

  it('reports how many nodes were read per profile', () => {
    const { report } = runBookmarkSync();
    expect(report.browsers.map((outcome) => outcome.browser)).toEqual(['chrome', 'edge']);
    expect(report.browsers.map((outcome) => outcome.bookmarksRead)).toEqual([3, 3]);
  });

  it('leaves everything untouched on a dry run', () => {
    const { layout, config, report } = runBookmarkSync({ dryRun: true });

    expect(report.backup).toBeNull();
    expect(report.exportFiles).toEqual([]);
    expect(report.warnings).toContain('Dry run: bookmark write-back skipped.');
    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    expect(chrome.checksum).toBe('stale-checksum');
    expect(fs.existsSync(config.backupDir)).toBe(false);
  });

  it('skips write-back for a browser that is running', () => {
    const { layout, report } = runBookmarkSync({
      browserRunning: (browser) => browser === 'chrome',
    });

    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    const edge = readBookmarkFile(path.join(layout.edgeDataDir, 'Default', 'Bookmarks'));

    expect(chrome.checksum).toBe('stale-checksum');
    expect(barChildIds(edge)).toEqual(['2', '7']);
    expect(report.warnings.some((warning) => warning.includes('chrome is running'))).toBe(true);
    expect(report.browsers.find((outcome) => outcome.browser === 'chrome')?.writtenBack).toBe(
      false,
    );
  });

  it('writes back anyway when force is used', () => {
    const { layout, report } = runBookmarkSync({ browserRunning: () => true, force: true });

    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    expect(barChildIds(chrome)).toEqual(['2', '7']);
    expect(report.browsers.every((outcome) => outcome.writtenBack)).toBe(true);
  });

  it('leaves the browser files alone for the export strategy', () => {
    const { layout, report } = runBookmarkSync({ strategy: 'export' });

    const chrome = readBookmarkFile(path.join(layout.chromeDataDir, 'Default', 'Bookmarks'));
    expect(chrome.checksum).toBe('stale-checksum');
    expect(report.browsers.every((outcome) => !outcome.writtenBack)).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('left untouched'))).toBe(true);
  });
});

describe('runSync - history', () => {
  it('reads, merges and exports history without writing back', () => {
    const { config } = setup({ history: true });
    const result = runSync({
      config,
      targets: { bookmarks: false, history: true },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
    });

    expect(result.historyMerge?.entries).toHaveLength(2);
    expect(result.bookmarkMerge).toBeNull();
    expect(result.exportFiles).toHaveLength(1);
    expect(result.exportFiles[0]).toContain(path.join(config.exportDir, 'history-merged-'));

    const exported = JSON.parse(fs.readFileSync(result.exportFiles[0], 'utf8')) as {
      entries: { url: string }[];
    };
    expect(exported.entries.map((entry) => entry.url)).toContain('https://edge.example.com');
    expect(result.warnings.some((warning) => warning.includes('never writes back'))).toBe(true);
  });

  it('surfaces a history read failure as a warning without aborting', () => {
    const { layout, config } = setup();
    fs.writeFileSync(path.join(layout.edgeDataDir, 'Default', 'History'), 'not sqlite');

    const report = runSync({
      config,
      targets: { bookmarks: false, history: true },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
    });

    expect(report.warnings.some((warning) => warning.includes('Could not read edge history'))).toBe(
      true,
    );
  });
});

describe('runSync - edge cases', () => {
  it('reports when no browser data is found', () => {
    const root = makeTempDir('crosssync-empty');
    const config = createTestConfig(root, {
      chromeDataDir: path.join(root, 'chrome'),
      edgeDataDir: path.join(root, 'edge'),
      profile: 'Default',
    });

    const report = runSync({
      config,
      targets: { bookmarks: true, history: true },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
    });

    expect(report.browsers).toEqual([]);
    expect(report.warnings.some((warning) => warning.includes('No chrome profile found'))).toBe(
      true,
    );
    expect(report.warnings).toContain('Nothing to sync: no bookmark or history data was found.');
  });

  it('skips a disabled browser', () => {
    const { config } = setup();
    const report = runSync({
      config: {
        ...config,
        browsers: {
          chrome: { ...config.browsers.chrome, enabled: true },
          edge: { ...config.browsers.edge, enabled: false },
        },
      },
      targets: { bookmarks: true, history: false },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
    });

    expect(report.browsers.map((outcome) => outcome.browser)).toEqual(['chrome']);
  });

  it('syncs every profile when profile is "all"', () => {
    const root = makeTempDir('crosssync-all');
    const layout = createBrowserLayout(root, chromeBookmarks(), edgeBookmarks());
    fs.mkdirSync(path.join(layout.chromeDataDir, 'Profile 1'), { recursive: true });
    fs.writeFileSync(
      path.join(layout.chromeDataDir, 'Profile 1', 'Bookmarks'),
      JSON.stringify(chromeBookmarks()),
    );
    const config = { ...createTestConfig(root, layout), profile: 'all' };

    const report = runSync({
      config,
      targets: { bookmarks: true, history: false },
      now: NOW,
      browserRunning: () => false,
      logger: new Logger('error', { console: false }),
    });

    expect(report.browsers.filter((outcome) => outcome.browser === 'chrome')).toHaveLength(2);
  });
});
