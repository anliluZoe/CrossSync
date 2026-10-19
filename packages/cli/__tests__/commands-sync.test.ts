import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { createContext, createMemoryIo, type CliContext } from '../src/context';
import {
  parseProfileAnswer,
  resolveTargets,
  resolveBrowsers,
  resolveStrategy,
  runSyncCommand,
  type ProfileSelectionRequest,
} from '../src/commands/sync';
import { cleanupTempDirs, createCliFixture, type CliFixture } from './helpers';

interface Harness {
  fixture: CliFixture;
  context: CliContext;
  io: ReturnType<typeof createMemoryIo>;
}

function setupHarness(): Harness {
  const fixture = createCliFixture();
  const io = createMemoryIo();
  const context = createContext({ homeDir: fixture.homeDir, io, console: false });
  return { fixture, context, io };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function chromeBookmarkPath(fixture: CliFixture): string {
  return path.join(fixture.chromeDataDir, 'Default', 'Bookmarks');
}

afterEach(() => {
  cleanupTempDirs();
});

describe('sync option helpers', () => {
  it('resolveTargets defaults to everything', () => {
    expect(resolveTargets({})).toEqual({ bookmarks: true, history: true });
    expect(resolveTargets({ all: true })).toEqual({ bookmarks: true, history: true });
    expect(resolveTargets({ bookmarks: true })).toEqual({ bookmarks: true, history: false });
    expect(resolveTargets({ history: true })).toEqual({ bookmarks: false, history: true });
  });

  it('resolveBrowsers handles all/chrome/edge', () => {
    expect(resolveBrowsers(undefined)).toEqual(['chrome', 'edge']);
    expect(resolveBrowsers('all')).toEqual(['chrome', 'edge']);
    expect(resolveBrowsers('edge')).toEqual(['edge']);
    expect(() => resolveBrowsers('firefox')).toThrow(/Unknown browser/);
  });

  it('resolveStrategy validates the value', () => {
    expect(resolveStrategy(undefined)).toBeUndefined();
    expect(resolveStrategy('merge')).toBe('merge');
    expect(resolveStrategy('export')).toBe('export');
    expect(() => resolveStrategy('overwrite')).toThrow(/Unknown strategy/);
  });

  it('parseProfileAnswer accepts numbers, names and all', () => {
    const available = ['Profile 8', 'Profile 9', 'Profile 11'];
    expect(parseProfileAnswer('1,3', available)).toEqual(['Profile 8', 'Profile 11']);
    expect(parseProfileAnswer('Profile 9', available)).toEqual(['Profile 9']);
    expect(parseProfileAnswer('all', available)).toEqual(available);
    expect(parseProfileAnswer('', available)).toBeNull();
    expect(parseProfileAnswer('9', available)).toBeUndefined();
    expect(parseProfileAnswer('nope', available)).toBeUndefined();
  });
});

describe('sync command', () => {
  it('merges and writes back both browsers', async () => {
    const { fixture, context, io } = setupHarness();

    const code = await runSyncCommand(context, {
      bookmarks: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
    });

    expect(code).toBe(0);
    const output = io.stdout.join('\n');
    expect(output).toContain('CrossSync sync (merge, bookmarks)');
    expect(output).toContain('merged bookmarks: 5 nodes');

    const chrome = readJson<{ roots: { bookmark_bar: { children: { id: string }[] } } }>(
      chromeBookmarkPath(fixture),
    );
    expect(chrome.roots.bookmark_bar.children.map((child) => child.id)).toEqual(['2', '3', '5']);
  });

  it('skips write-back while a browser is running', async () => {
    const { fixture, context, io } = setupHarness();

    await runSyncCommand(context, { bookmarks: true, browserRunning: () => true });

    expect(readJson<{ checksum?: string }>(chromeBookmarkPath(fixture)).checksum).toBe(
      'chrome-checksum',
    );
    expect(io.stdout.join('\n')).toContain('write-back skipped (browser-running)');
  });

  it('honours --force', async () => {
    const { fixture, context } = setupHarness();

    await runSyncCommand(context, { bookmarks: true, force: true, browserRunning: () => true });

    expect(readJson<{ checksum?: string }>(chromeBookmarkPath(fixture)).checksum).toBeUndefined();
  });

  it('honours --strategy export', async () => {
    const { fixture, context, io } = setupHarness();

    await runSyncCommand(context, {
      bookmarks: true,
      strategy: 'export',
      browserRunning: () => false,
    });

    expect(readJson<{ checksum?: string }>(chromeBookmarkPath(fixture)).checksum).toBe(
      'chrome-checksum',
    );
    expect(io.stdout.join('\n')).toContain('left untouched');
  });

  it('emits JSON when asked', async () => {
    const { context, io } = setupHarness();

    await runSyncCommand(context, { bookmarks: true, json: true, browserRunning: () => false });

    const report = JSON.parse(io.stdout.join('\n')) as { bookmarkMerge: { stats: unknown } };
    expect(report.bookmarkMerge.stats).toBeDefined();
  });

  it('does not touch any file on a dry run', async () => {
    const { fixture, context, io } = setupHarness();

    const code = await runSyncCommand(context, {
      bookmarks: true,
      dryRun: true,
      browserRunning: () => false,
    });

    expect(code).toBe(0);
    expect(io.stdout.join('\n')).toContain('[dry run]');
    expect(fs.existsSync(path.join(fixture.homeDir, '.crosssync', 'backups'))).toBe(false);
    expect(readJson<{ checksum?: string }>(chromeBookmarkPath(fixture)).checksum).toBe(
      'chrome-checksum',
    );
  });

  it('creates a backup before writing back', async () => {
    const { fixture, context } = setupHarness();

    await runSyncCommand(context, {
      bookmarks: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
    });

    const backup = path.join(
      fixture.homeDir,
      '.crosssync',
      'backups',
      '20260116-093005',
      'manifest.json',
    );
    expect(fs.existsSync(backup)).toBe(true);
  });

  it('syncs history into an export file without writing back', async () => {
    const { context, io } = setupHarness();

    const code = await runSyncCommand(context, {
      history: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
    });

    expect(code).toBe(0);
    const output = io.stdout.join('\n');
    expect(output).toContain('merged history: 2 entries');
    expect(output).toContain('never writes back');
  });

  it('prunes older export files after a successful run', async () => {
    const { fixture, context } = setupHarness();
    context.config.exports = { keep: 1 };
    const dir = fixture.config.exportDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bookmarks-merged-20260115-090000.json'), '{}');

    await runSyncCommand(context, {
      bookmarks: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
    });

    expect(fs.readdirSync(dir).filter((name) => name.startsWith('bookmarks-merged-'))).toEqual([
      'bookmarks-merged-20260116-093005.json',
    ]);
  });

  it('does not prune exports on a dry run', async () => {
    const { fixture, context } = setupHarness();
    context.config.exports = { keep: 1 };
    const dir = fixture.config.exportDir;
    fs.mkdirSync(dir, { recursive: true });
    const old = path.join(dir, 'bookmarks-merged-20260115-090000.json');
    fs.writeFileSync(old, '{}');

    await runSyncCommand(context, {
      bookmarks: true,
      dryRun: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
    });

    expect(fs.existsSync(old)).toBe(true);
  });

  it('reports when no browser data exists', async () => {
    const fixture = createCliFixture({ withHistory: false });
    fs.rmSync(path.join(fixture.chromeDataDir, 'Default'), { recursive: true, force: true });
    fs.rmSync(path.join(fixture.edgeDataDir, 'Default'), { recursive: true, force: true });
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });

    const code = await runSyncCommand(context, { bookmarks: true, browserRunning: () => false });

    expect(code).toBe(0);
    expect(io.stdout.join('\n')).toContain('Nothing to sync');
  });

  it('prompts for a missing profile and persists the multi-profile selection', async () => {
    const fixture = createCliFixture();
    fs.renameSync(
      path.join(fixture.chromeDataDir, 'Default'),
      path.join(fixture.chromeDataDir, 'Profile 11'),
    );
    fs.mkdirSync(path.join(fixture.chromeDataDir, 'Profile 12'));
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });
    const requests: ProfileSelectionRequest[] = [];

    const code = await runSyncCommand(context, {
      bookmarks: true,
      now: new Date(2026, 0, 16, 9, 30, 5),
      browserRunning: () => false,
      selectProfiles: async (request) => {
        requests.push(request);
        return request.browser === 'chrome' ? ['Profile 11', 'Profile 12'] : null;
      },
    });

    expect(code).toBe(0);
    // Edge's Default still exists, so only Chrome is asked.
    expect(requests.map((request) => request.browser)).toEqual(['chrome']);
    expect(requests[0].available).toEqual(['Profile 11', 'Profile 12']);
    expect(context.config.profile).toBe('Default,Profile 11,Profile 12');
    expect(readJson<{ profile: string }>(fixture.configFile).profile).toBe(
      'Default,Profile 11,Profile 12',
    );
    expect(io.stdout.join('\n')).toContain('Profile selection saved');
    expect(io.stdout.join('\n')).toContain('chrome/Profile 11');
  });

  it('does not prompt when --profile is supplied', async () => {
    const fixture = createCliFixture();
    fs.renameSync(
      path.join(fixture.chromeDataDir, 'Default'),
      path.join(fixture.chromeDataDir, 'Profile 11'),
    );
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });
    let prompted = false;

    await runSyncCommand(context, {
      bookmarks: true,
      profile: 'Profile 11',
      browserRunning: () => false,
      selectProfiles: async () => {
        prompted = true;
        return ['Profile 11'];
      },
    });

    expect(prompted).toBe(false);
    expect(context.config.profile).toBe('Default');
  });

  it('lists available profiles in the warning when not interactive', async () => {
    const fixture = createCliFixture();
    fs.renameSync(
      path.join(fixture.chromeDataDir, 'Default'),
      path.join(fixture.chromeDataDir, 'Profile 11'),
    );
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });

    await runSyncCommand(context, { bookmarks: true, browserRunning: () => false });

    expect(io.stdout.join('\n')).toContain('Available: Profile 11');
  });
});
