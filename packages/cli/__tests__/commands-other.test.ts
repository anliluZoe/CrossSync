import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { LOG_FILE_NAME } from '@crosssync/shared';

import { createContext, createMemoryIo, loadConfigFile, type CliContext } from '../src/context';
import { runBackupCommand, collectBackupSources, formatBytes } from '../src/commands/backup';
import {
  coerceConfigValue,
  getConfigValue,
  runConfigCommand,
  setConfigValue,
} from '../src/commands/config';
import { listExports, readExportFile, runExportCommand } from '../src/commands/export';
import { formatLogEntry, runLogsCommand } from '../src/commands/logs';
import { runStatusCommand } from '../src/commands/status';
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

afterEach(() => {
  cleanupTempDirs();
});

describe('export command', () => {
  it('writes a JSON export and reports the counts', () => {
    const { fixture, context, io } = setupHarness();

    const code = runExportCommand(context, {
      format: 'json',
      now: new Date(2026, 0, 16, 9, 30, 5),
    });

    expect(code).toBe(0);
    const target = path.join(fixture.config.exportDir, 'crosssync-export-20260116-093005.json');
    expect(fs.existsSync(target)).toBe(true);
    expect(io.stdout.join('\n')).toContain('bookmarks: 5 nodes');
    expect(io.stdout.join('\n')).toContain('history: 2 entries');

    const payload = readExportFile(target);
    expect(payload?.bookmarks?.roots.bookmark_bar.children).toHaveLength(3);
    expect(payload?.history?.entries).toHaveLength(2);
  });

  it('prints to stdout when asked', () => {
    const { context, io } = setupHarness();

    const code = runExportCommand(context, { stdout: true });

    expect(code).toBe(0);
    const payload = JSON.parse(io.stdout.join('\n')) as { source: string };
    expect(payload.source).toBe('crosssync');
  });

  it('writes into an explicit --out directory', () => {
    const { fixture, context } = setupHarness();
    const out = path.join(fixture.root, 'custom-export');

    runExportCommand(context, { out, now: new Date(2026, 0, 16, 9, 30, 5) });

    expect(fs.existsSync(path.join(out, 'crosssync-export-20260116-093005.json'))).toBe(true);
  });

  it('rejects unsupported formats', () => {
    const { context, io } = setupHarness();

    expect(runExportCommand(context, { format: 'csv' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Unsupported export format');
  });

  it('fails when there is nothing to export', () => {
    const fixture = createCliFixture({ withHistory: false });
    fs.rmSync(path.join(fixture.chromeDataDir, 'Default'), { recursive: true, force: true });
    fs.rmSync(path.join(fixture.edgeDataDir, 'Default'), { recursive: true, force: true });
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });

    expect(runExportCommand(context, {})).toBe(1);
    expect(io.stderr.join('\n')).toContain('Nothing to export');
  });

  it('listExports reports the newest file first', () => {
    const { fixture, context } = setupHarness();

    runExportCommand(context, { now: new Date(2026, 0, 16, 9, 0, 0) });
    runExportCommand(context, { now: new Date(2026, 0, 17, 9, 0, 0) });

    const summary = listExports(fixture.config.exportDir);
    expect(summary.count).toBe(2);
    expect(summary.latest).toContain('20260117-090000');
    expect(summary.files[0]).toContain('20260117-090000');
  });

  it('listExports handles a missing directory', () => {
    expect(listExports(path.join(process.cwd(), 'definitely-missing-dir'))).toEqual({
      count: 0,
      latest: null,
      files: [],
    });
  });

  it('prunes older exports after writing a new one', () => {
    const { fixture, context } = setupHarness();
    context.config.exports = { keep: 2 };
    const dir = fixture.config.exportDir;
    fs.mkdirSync(dir, { recursive: true });
    for (const stamp of ['20260114-093005', '20260115-093005']) {
      fs.writeFileSync(path.join(dir, `crosssync-export-${stamp}.json`), '{}');
    }

    runExportCommand(context, { now: new Date(2026, 0, 16, 9, 30, 5) });

    expect(fs.readdirSync(dir).sort()).toEqual([
      'crosssync-export-20260115-093005.json',
      'crosssync-export-20260116-093005.json',
    ]);
  });

  it('does not prune exports in a custom --out directory', () => {
    const { fixture, context } = setupHarness();
    context.config.exports = { keep: 1 };
    const out = path.join(fixture.root, 'custom-export');
    fs.mkdirSync(out, { recursive: true });
    const old = path.join(out, 'crosssync-export-20250101-000000.json');
    fs.writeFileSync(old, '{}');

    runExportCommand(context, { out, now: new Date(2026, 0, 16, 9, 30, 5) });

    expect(fs.existsSync(old)).toBe(true);
  });
});

describe('status command', () => {
  it('describes browsers, profiles and runtime paths', () => {
    const { fixture, context, io } = setupHarness();

    const code = runStatusCommand(context);

    expect(code).toBe(0);
    const output = io.stdout.join('\n');
    expect(output).toContain('CrossSync 0.1.0');
    expect(output).toContain(`config:    ${fixture.configFile}`);
    expect(output).toContain('schedule:  not installed');
    expect(output).toContain('Default: Bookmarks');
    expect(output).toContain('Default: Bookmarks, History');
    expect(output).toContain('backups:   0');
  });

  it('emits JSON when asked', () => {
    const { context, io } = setupHarness();

    runStatusCommand(context, { json: true });

    const report = JSON.parse(io.stdout.join('\n')) as {
      version: string;
      browsers: { browser: string }[];
    };
    expect(report.version).toBe('0.1.0');
    expect(report.browsers.map((entry) => entry.browser)).toEqual(['chrome', 'edge']);
  });
});

describe('logs command', () => {
  function writeLog(homeDir: string, entries: object[]): string {
    const dir = path.join(homeDir, '.crosssync', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, LOG_FILE_NAME);
    fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
    return file;
  }

  it('prints the newest entries last', () => {
    const { fixture, context, io } = setupHarness();
    writeLog(fixture.homeDir, [
      { level: 'info', message: 'first', timestamp: 1 },
      { level: 'warn', message: 'second', timestamp: 2 },
    ]);

    const code = runLogsCommand(context, { limit: 10 });

    expect(code).toBe(0);
    expect(io.stdout).toHaveLength(2);
    expect(io.stdout[0]).toContain('first');
  });

  it('filters by level and limit', () => {
    const { fixture, context, io } = setupHarness();
    writeLog(fixture.homeDir, [
      { level: 'debug', message: 'd', timestamp: 1 },
      { level: 'info', message: 'i', timestamp: 2 },
      { level: 'error', message: 'e', timestamp: 3 },
    ]);

    runLogsCommand(context, { level: 'info', limit: 1 });

    expect(io.stdout).toHaveLength(1);
    expect(io.stdout[0]).toContain('[ERROR] e');
  });

  it('reports an unknown level', () => {
    const { context, io } = setupHarness();

    expect(runLogsCommand(context, { level: 'verbose' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Unknown log level');
  });

  it('clears the log file', () => {
    const { fixture, context, io } = setupHarness();
    const file = writeLog(fixture.homeDir, [{ level: 'info', message: 'x', timestamp: 1 }]);

    expect(runLogsCommand(context, { clear: true })).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
    expect(io.stdout.join('\n')).toContain('Cleared');
  });

  it('handles a missing log file', () => {
    const { context, io } = setupHarness();

    expect(runLogsCommand(context, {})).toBe(0);
    expect(io.stdout.join('\n')).toContain('No log entries');
  });

  it('formatLogEntry renders level, message and meta', () => {
    const rendered = formatLogEntry({
      level: 'warn',
      message: 'careful',
      timestamp: Date.UTC(2026, 0, 16, 9, 30, 5),
      meta: { browser: 'chrome' },
    });
    expect(rendered).toBe('2026-01-16T09:30:05.000Z [WARN] careful {"browser":"chrome"}');
  });

  it('formatLogEntry omits empty meta', () => {
    expect(formatLogEntry({ level: 'info', message: 'plain', timestamp: 0 })).toContain('plain');
    expect(formatLogEntry({ level: 'info', message: 'plain', timestamp: 0 })).not.toContain('{');
  });
});

describe('config command', () => {
  it('prints the config path', () => {
    const { fixture, context, io } = setupHarness();

    expect(runConfigCommand(context, { path: true })).toBe(0);
    expect(io.stdout[0]).toBe(fixture.configFile);
  });

  it('prints the whole config by default', () => {
    const { context, io } = setupHarness();

    runConfigCommand(context);

    const text = io.stdout.join('\n');
    expect(text).toContain('# ');
    expect(text).toContain('"sync"');
  });

  it('reads a dotted key', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { get: 'sync.strategy' })).toBe(0);
    expect(io.stdout[0]).toBe('merge');
  });

  it('prints objects as JSON when reading a parent key', () => {
    const { context, io } = setupHarness();

    runConfigCommand(context, { get: 'schedule' });
    expect(JSON.parse(io.stdout[0])).toEqual({ installed: false, expression: '0 9 * * *' });
  });

  it('rejects an unknown key', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { get: 'nope.nope' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Unknown config key');
  });

  it('writes a dotted key and persists it', () => {
    const { fixture, context, io } = setupHarness();

    expect(runConfigCommand(context, { set: 'sync.strategy=export' })).toBe(0);
    expect(io.stdout[0]).toBe('sync.strategy = "export"');

    const persisted = loadConfigFile(fixture.configFile, {
      root: '',
      backups: '',
      exports: '',
      logs: '',
      configFile: fixture.configFile,
      logFile: '',
    });
    expect(persisted.config.sync.strategy).toBe('export');
  });

  it('coerces booleans and numbers', () => {
    const { context } = setupHarness();

    runConfigCommand(context, { set: 'browsers.chrome.enabled=false' });
    runConfigCommand(context, { set: 'version=2' });

    expect(context.config.browsers.chrome.enabled).toBe(false);
    expect(context.config.version).toBe(2);
  });

  it('rejects an invalid value that would corrupt the config', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { set: 'logLevel=verbose' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Refusing to write an invalid config');
  });

  it('exposes and updates the export retention setting', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { get: 'exports.keep' })).toBe(0);
    expect(io.stdout[0]).toBe('10');

    expect(runConfigCommand(context, { set: 'exports.keep=3' })).toBe(0);
    expect(context.config.exports?.keep).toBe(3);
  });

  it('rejects a negative export retention', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { set: 'exports.keep=-1' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Refusing to write an invalid config');
  });

  it('rejects a malformed --set argument', () => {
    const { context, io } = setupHarness();

    expect(runConfigCommand(context, { set: 'no-equals' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Use --set key=value');
  });

  it('resets to defaults', () => {
    const { context, io } = setupHarness();

    runConfigCommand(context, { set: 'sync.strategy=export' });
    expect(runConfigCommand(context, { reset: true })).toBe(0);

    expect(context.config.sync.strategy).toBe('merge');
    expect(io.stdout.join('\n')).toContain('Config reset');
  });

  it('coerceConfigValue converts literals', () => {
    expect(coerceConfigValue('true')).toBe(true);
    expect(coerceConfigValue('false')).toBe(false);
    expect(coerceConfigValue('null')).toBeNull();
    expect(coerceConfigValue('42')).toBe(42);
    expect(coerceConfigValue('-1.5')).toBe(-1.5);
    expect(coerceConfigValue('Profile 1')).toBe('Profile 1');
  });

  it('getConfigValue walks nested objects', () => {
    const { context } = setupHarness();
    expect(getConfigValue(context.config, 'browsers.chrome.dataDir')).toBeDefined();
    expect(getConfigValue(context.config, 'browsers.chrome')).toEqual(
      expect.objectContaining({ enabled: true }),
    );
    expect(getConfigValue(context.config, 'sync.strategy.deep')).toBeUndefined();
  });

  it('setConfigValue refuses empty path segments', () => {
    const { context } = setupHarness();
    expect(() => setConfigValue(context.config, 'sync..strategy', 'x')).toThrow(
      /Invalid config key/,
    );
  });
});

describe('backup command', () => {
  it('creates a backup of every browser data file', () => {
    const { fixture, context, io } = setupHarness();

    const code = runBackupCommand(context, { now: new Date(2026, 0, 16, 9, 30, 5) });

    expect(code).toBe(0);
    expect(io.stdout.join('\n')).toContain('Backup created');
    expect(
      fs.existsSync(path.join(fixture.config.backupDir, '20260116-093005', 'manifest.json')),
    ).toBe(true);
  });

  it('lists backups', () => {
    const { context, io } = setupHarness();
    runBackupCommand(context, { now: new Date(2026, 0, 16, 9, 30, 5) });

    const code = runBackupCommand(context, { list: true });

    expect(code).toBe(0);
    expect(io.stdout.join('\n')).toContain('20260116-093005');
  });

  it('reports an empty backup directory', () => {
    const { context, io } = setupHarness();

    expect(runBackupCommand(context, { list: true })).toBe(0);
    expect(io.stdout.join('\n')).toContain('No backups found');
  });

  it('prunes old backups', () => {
    const { context, io } = setupHarness();
    for (const day of [14, 15, 16]) {
      runBackupCommand(context, { now: new Date(2026, 0, day, 9, 0, 0) });
    }

    const code = runBackupCommand(context, { prune: true, keep: 1 });

    expect(code).toBe(0);
    expect(fs.readdirSync(context.config.backupDir)).toEqual(['20260116-090000']);
    expect(io.stdout.join('\n')).toContain('Removed 2 backup(s)');
  });

  it('reports when there is nothing to prune', () => {
    const { context, io } = setupHarness();
    runBackupCommand(context, { now: new Date(2026, 0, 16, 9, 0, 0) });

    expect(runBackupCommand(context, { prune: true, keep: 5 })).toBe(0);
    expect(io.stdout.join('\n')).toContain('Nothing to prune');
  });

  it('collects only files that exist', () => {
    const { fixture, context } = setupHarness();
    fs.rmSync(path.join(fixture.edgeDataDir, 'Default', 'History'));

    const sources = collectBackupSources(context.config);

    expect(sources.map((source) => source.kind)).toEqual(['bookmarks', 'bookmarks']);
    expect(sources.map((source) => source.browser)).toEqual(['chrome', 'edge']);
  });

  it('fails when no browser data exists', () => {
    const fixture = createCliFixture({ withHistory: false });
    fs.rmSync(path.join(fixture.chromeDataDir, 'Default'), { recursive: true, force: true });
    fs.rmSync(path.join(fixture.edgeDataDir, 'Default'), { recursive: true, force: true });
    const io = createMemoryIo();
    const context = createContext({ homeDir: fixture.homeDir, io, console: false });

    expect(runBackupCommand(context, {})).toBe(1);
    expect(io.stderr.join('\n')).toContain('No browser bookmark or history files');
  });

  it('formatBytes scales the unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
  });
});
