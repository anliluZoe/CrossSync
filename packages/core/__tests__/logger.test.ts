import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { clearLogFile, Logger, readLogEntries } from '../src/logger';
import { cleanupTempDirs, makeTempDir } from './helpers';

afterEach(() => {
  cleanupTempDirs();
});

describe('Logger', () => {
  it('filters entries below the configured level', () => {
    const logger = new Logger('warn', { console: false });
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(logger.getEntries().map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  it('changes level at runtime', () => {
    const logger = new Logger('error', { console: false });
    logger.info('hidden');
    logger.setLevel('debug');
    logger.info('visible');

    expect(logger.getEntries().map((entry) => entry.message)).toEqual(['visible']);
    expect(logger.getLevel()).toBe('debug');
  });

  it('falls back to info for an unknown level', () => {
    const logger = new Logger('nonsense' as never, { console: false });
    expect(logger.getLevel()).toBe('info');
    expect(logger.isEnabled('debug')).toBe(false);
  });

  it('keeps meta on the entry', () => {
    const logger = new Logger('info', { console: false });
    logger.info('with meta', { browser: 'chrome' });
    expect(logger.getEntries()[0].meta).toEqual({ browser: 'chrome' });
  });

  it('clears the buffer', () => {
    const logger = new Logger('info', { console: false });
    logger.info('a');
    logger.clearBuffer();
    expect(logger.getEntries()).toEqual([]);
  });

  it('captures console output on info/warn/error', () => {
    // The default logger mirrors to the console; just ensure it does not throw.
    const logger = new Logger('debug');
    expect(() => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e', { code: 1 });
    }).not.toThrow();
  });
});

describe('log file transport', () => {
  it('appends JSON lines to the configured file', () => {
    const dir = makeTempDir('crosssync-logs');
    const file = path.join(dir, 'nested', 'crosssync.log');
    const logger = new Logger('info', { console: false, filePath: file });

    logger.info('first');
    logger.error('second');

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).message).toBe('first');
    expect(JSON.parse(lines[1]).level).toBe('error');
  });

  it('readLogEntries parses and filters entries', () => {
    const dir = makeTempDir('crosssync-logs');
    const file = path.join(dir, 'crosssync.log');
    const logger = new Logger('debug', { console: false, filePath: file });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');

    expect(readLogEntries(file).map((entry) => entry.level)).toEqual(['debug', 'info', 'warn']);
    expect(readLogEntries(file, { level: 'info' }).map((entry) => entry.level)).toEqual([
      'info',
      'warn',
    ]);
    expect(readLogEntries(file, { limit: 1 }).map((entry) => entry.message)).toEqual(['w']);
  });

  it('readLogEntries returns an empty list for a missing file', () => {
    expect(readLogEntries(path.join(makeTempDir('crosssync-logs'), 'nope.log'))).toEqual([]);
  });

  it('readLogEntries skips malformed lines', () => {
    const dir = makeTempDir('crosssync-logs');
    const file = path.join(dir, 'crosssync.log');
    fs.writeFileSync(
      file,
      ['not json', JSON.stringify({ level: 'info', message: 'ok', timestamp: 1 }), '{}', ''].join(
        '\n',
      ),
    );

    const entries = readLogEntries(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('ok');
  });

  it('clearLogFile removes the file', () => {
    const dir = makeTempDir('crosssync-logs');
    const file = path.join(dir, 'crosssync.log');
    fs.writeFileSync(file, 'x');
    clearLogFile(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('setFile switches the target', () => {
    const dir = makeTempDir('crosssync-logs');
    const logger = new Logger('info', { console: false });
    const file = path.join(dir, 'later.log');
    logger.setFile(file);
    logger.info('routed');
    expect(logger.getFile()).toBe(file);
    expect(readLogEntries(file)).toHaveLength(1);
  });
});
