import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { listBackups } from '@crosssync/core';

import { createContext, createMemoryIo } from '../src/context';
import { runBackupCommand } from '../src/commands/backup';
import { runRestoreCommand } from '../src/commands/restore';
import { cleanupTempDirs, createCliFixture, type CliFixture } from './helpers';

interface Harness {
  fixture: CliFixture;
  context: ReturnType<typeof createContext>;
  io: ReturnType<typeof createMemoryIo>;
}

function setupHarness(withHistory = true): Harness {
  const fixture = createCliFixture({ withHistory });
  const io = createMemoryIo();
  const context = createContext({ homeDir: fixture.homeDir, io, console: false });
  return { fixture, context, io };
}

function chromeBookmarksPath(fixture: CliFixture): string {
  return path.join(fixture.chromeDataDir, 'Default', 'Bookmarks');
}

function corruptBookmarks(fixture: CliFixture): void {
  fs.writeFileSync(
    chromeBookmarksPath(fixture),
    JSON.stringify({
      version: 1,
      roots: {
        bookmark_bar: { id: '1', name: 'Bookmarks bar', type: 'folder', children: [] },
        other: { id: '6', name: 'Other bookmarks', type: 'folder', children: [] },
      },
    }),
  );
}

function latestBackupId(context: ReturnType<typeof createContext>): string {
  return listBackups(context.config.backupDir)[0].id;
}

afterEach(() => {
  cleanupTempDirs();
});

describe('restore command', () => {
  it('restores bookmark files from the newest backup', () => {
    const { fixture, context, io } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    const original = fs.readFileSync(chromeBookmarksPath(fixture), 'utf8');
    corruptBookmarks(fixture);

    expect(runRestoreCommand(context, { browserRunning: () => false })).toBe(0);

    expect(fs.readFileSync(chromeBookmarksPath(fixture), 'utf8')).toBe(original);
    const output = io.stdout.join('\n');
    expect(output).toContain('Safety backup created');
    expect(output).toContain('Restored bookmarks/chrome/Default');
  });

  it('does not write anything during a dry run', () => {
    const { fixture, context, io } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    corruptBookmarks(fixture);
    const corrupted = fs.readFileSync(chromeBookmarksPath(fixture), 'utf8');

    expect(runRestoreCommand(context, { dryRun: true, browserRunning: () => false })).toBe(0);

    expect(fs.readFileSync(chromeBookmarksPath(fixture), 'utf8')).toBe(corrupted);
    const output = io.stdout.join('\n');
    expect(output).toContain('Restore plan for backup');
    expect(output).toContain('Dry run: nothing was written.');
  });

  it('restores only bookmarks unless --history is passed', () => {
    const { context, io } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    io.stdout.length = 0;

    runRestoreCommand(context, { dryRun: true, browserRunning: () => false });
    expect(io.stdout.join('\n')).not.toContain('history/edge/Default');

    io.stdout.length = 0;
    runRestoreCommand(context, { dryRun: true, history: true, browserRunning: () => false });
    expect(io.stdout.join('\n')).toContain('history/edge/Default');
  });

  it('skips a running browser unless --force is used', () => {
    const { fixture, context, io } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    const backupId = latestBackupId(context);
    const original = fs.readFileSync(chromeBookmarksPath(fixture), 'utf8');
    corruptBookmarks(fixture);
    const corrupted = fs.readFileSync(chromeBookmarksPath(fixture), 'utf8');

    const skipped = runRestoreCommand(context, {
      id: backupId,
      browserRunning: (browser) => browser === 'chrome',
    });
    expect(skipped).toBe(1);
    expect(fs.readFileSync(chromeBookmarksPath(fixture), 'utf8')).toBe(corrupted);
    expect(io.stderr.join('\n')).toContain('chrome is running');

    io.stdout.length = 0;
    io.stderr.length = 0;
    const forced = runRestoreCommand(context, {
      id: backupId,
      force: true,
      browserRunning: (browser) => browser === 'chrome',
    });
    expect(forced).toBe(0);
    expect(fs.readFileSync(chromeBookmarksPath(fixture), 'utf8')).toBe(original);
  });

  it('creates a safety backup before restoring', () => {
    const { fixture, context } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    const before = listBackups(context.config.backupDir).length;
    corruptBookmarks(fixture);

    expect(runRestoreCommand(context, { browserRunning: () => false })).toBe(0);

    expect(listBackups(context.config.backupDir).length).toBe(before + 1);
  });

  it('rejects an unknown backup id', () => {
    const { context, io } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);

    expect(runRestoreCommand(context, { id: 'nope', browserRunning: () => false })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Backup "nope" not found');
  });

  it('reports when there are no backups at all', () => {
    const { context, io } = setupHarness();

    expect(runRestoreCommand(context, { browserRunning: () => false })).toBe(1);
    expect(io.stderr.join('\n')).toContain('No backups found');
  });

  it('restores a specific backup id', () => {
    const { fixture, context } = setupHarness();
    expect(runBackupCommand(context)).toBe(0);
    const firstId = latestBackupId(context);
    const original = fs.readFileSync(chromeBookmarksPath(fixture), 'utf8');

    expect(runRestoreCommand(context, { id: firstId, browserRunning: () => false })).toBe(0);
    expect(fs.readFileSync(chromeBookmarksPath(fixture), 'utf8')).toBe(original);
  });
});
