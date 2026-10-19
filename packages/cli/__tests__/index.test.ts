import { describe, it, expect } from 'vitest';

import {
  buildProgram,
  CLI_NAME,
  CLI_VERSION,
  PACKAGE,
  VERSION,
  type GlobalOptions,
} from '../src/index';
import { createMemoryIo } from '../src/context';
import { cleanupTempDirs, createCliFixture } from './helpers';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanupTempDirs();
});

describe('crosssync', () => {
  it('exports the package metadata', () => {
    expect(PACKAGE).toBe('crosssync');
    expect(VERSION).toBe('0.1.1');
    expect(CLI_NAME).toBe('crosssync');
    expect(CLI_VERSION).toBe(VERSION);
  });
});

describe('buildProgram', () => {
  it('registers every documented command', () => {
    const program = buildProgram(() => {
      throw new Error('not used');
    });

    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      'backup',
      'config',
      'export',
      'install-cron',
      'logs',
      'profiles',
      'status',
      'sync',
      'uninstall-cron',
    ]);
  });

  it('declares the expected options for each command', () => {
    const program = buildProgram(() => {
      throw new Error('not used');
    });

    const optionsFor = (name: string) =>
      (program.commands.find((command) => command.name() === name)?.options ?? []).map(
        (option) => option.long,
      );

    expect(optionsFor('sync')).toEqual([
      '--bookmarks',
      '--history',
      '--all',
      '--browser',
      '--profile',
      '--strategy',
      '--dry-run',
      '--force',
      '--json',
    ]);
    expect(optionsFor('backup')).toEqual(['--list', '--prune', '--keep']);
    expect(optionsFor('export')).toEqual([
      '--format',
      '--out',
      '--browser',
      '--profile',
      '--stdout',
    ]);
    expect(optionsFor('status')).toEqual(['--json']);
    expect(optionsFor('logs')).toEqual(['--limit', '--level', '--clear', '--json']);
    expect(optionsFor('profiles')).toEqual([
      '--list',
      '--set',
      '--add',
      '--remove',
      '--all',
      '--reset',
      '--browser',
    ]);
    expect(optionsFor('install-cron')).toEqual(['--expression', '--label', '--dry-run']);
    expect(optionsFor('uninstall-cron')).toEqual(['--label', '--dry-run']);
    expect(optionsFor('config')).toEqual(['--path', '--get', '--set', '--reset']);
  });

  it('runs a command through the injected context factory', () => {
    const fixture = createCliFixture();
    const io = createMemoryIo();
    let seen: GlobalOptions | null = null;

    const program = buildProgram((options) => {
      seen = options;
      return {
        config: fixture.config,
        dirs: {
          root: '',
          backups: '',
          exports: '',
          logs: '',
          configFile: fixture.configFile,
          logFile: '',
        },
        logger: { info() {}, debug() {}, warn() {}, error() {} } as never,
        io,
        configCreated: false,
      };
    });

    program.parse(['node', 'crosssync', '--home-dir', '/tmp/x', 'status']);

    expect(seen).toEqual({ homeDir: '/tmp/x' });
    expect(io.stdout.join('\n')).toContain('CrossSync 0.1.1');
  });

  it('exposes --version', () => {
    const program = buildProgram(() => {
      throw new Error('not used');
    });
    program.exitOverride();
    program.configureOutput({ writeOut: () => undefined });

    expect(() => program.parse(['node', 'crosssync', '--version'])).toThrow();
    expect(program.version()).toBe('0.1.1');
  });
});
