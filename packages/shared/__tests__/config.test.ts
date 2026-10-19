import { describe, it, expect } from 'vitest';
import { createDefaultConfig, resolveExportRetention, type CliConfig } from '../src/config';
import { DEFAULT_EXPORT_RETENTION } from '../src/constants';
import { isCliConfig } from '../src/utils';

function makeConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  return {
    ...createDefaultConfig({
      dataDir: '/home/user/.crosssync',
      backupDir: '/home/user/.crosssync/backups',
      exportDir: '/home/user/.crosssync/export',
      logDir: '/home/user/.crosssync/logs',
    }),
    ...overrides,
  };
}

describe('createDefaultConfig', () => {
  it('uses CrossSync runtime paths', () => {
    const config = makeConfig();
    expect(config.dataDir).toBe('/home/user/.crosssync');
    expect(config.backupDir).toContain('backups');
    expect(config.exportDir).toContain('export');
    expect(config.logDir).toContain('logs');
  });

  it('enables both browsers and both data kinds', () => {
    const config = makeConfig();
    expect(config.browsers.chrome.enabled).toBe(true);
    expect(config.browsers.edge.enabled).toBe(true);
    expect(config.sync.bookmarks).toBe(true);
    expect(config.sync.history).toBe(true);
  });

  it('defaults to the merge strategy and the Default profile', () => {
    const config = makeConfig();
    expect(config.sync.strategy).toBe('merge');
    expect(config.profile).toBe('Default');
  });

  it('reports no schedule installed by default', () => {
    const config = makeConfig();
    expect(config.schedule.installed).toBe(false);
    expect(config.schedule.expression).toBe('0 9 * * *');
  });

  it('keeps a bounded number of exports by default', () => {
    const config = makeConfig();
    expect(config.exports?.keep).toBe(DEFAULT_EXPORT_RETENTION);
    expect(resolveExportRetention(config)).toBe(DEFAULT_EXPORT_RETENTION);
  });

  it('falls back when a legacy config has no exports block', () => {
    expect(resolveExportRetention({})).toBe(DEFAULT_EXPORT_RETENTION);
  });

  it('honours the logLevel and profile overrides', () => {
    const config = createDefaultConfig({
      dataDir: 'd',
      backupDir: 'b',
      exportDir: 'e',
      logDir: 'l',
      logLevel: 'debug',
      profile: 'Profile 1',
    });
    expect(config.logLevel).toBe('debug');
    expect(config.profile).toBe('Profile 1');
  });
});

describe('isCliConfig', () => {
  it('accepts a config produced by createDefaultConfig', () => {
    expect(isCliConfig(makeConfig())).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isCliConfig(null)).toBe(false);
    expect(isCliConfig(undefined)).toBe(false);
    expect(isCliConfig('config')).toBe(false);
    expect(isCliConfig([])).toBe(false);
  });

  it('rejects a missing browser entry', () => {
    const config = makeConfig();
    const broken = { ...config, browsers: { chrome: { enabled: true } } };
    expect(isCliConfig(broken)).toBe(false);
  });

  it('rejects an unknown sync strategy', () => {
    const config = makeConfig();
    const broken = { ...config, sync: { ...config.sync, strategy: 'overwrite' } };
    expect(isCliConfig(broken)).toBe(false);
  });

  it('rejects an invalid log level', () => {
    const config = makeConfig();
    expect(isCliConfig({ ...config, logLevel: 'verbose' })).toBe(false);
  });

  it('rejects a malformed schedule block', () => {
    const config = makeConfig();
    expect(
      isCliConfig({ ...config, schedule: { installed: 'yes', expression: '0 9 * * *' } }),
    ).toBe(false);
  });

  it('accepts legacy configs without an exports block', () => {
    const legacy: Record<string, unknown> = { ...makeConfig() };
    delete legacy.exports;
    expect(isCliConfig(legacy)).toBe(true);
  });

  it('rejects an invalid exports block', () => {
    const config = makeConfig();
    expect(isCliConfig({ ...config, exports: { keep: -1 } })).toBe(false);
    expect(isCliConfig({ ...config, exports: { keep: 1.5 } })).toBe(false);
    expect(isCliConfig({ ...config, exports: { keep: '10' } })).toBe(false);
  });
});
