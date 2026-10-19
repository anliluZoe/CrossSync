import { describe, it, expect } from 'vitest';
import { PACKAGE, VERSION } from '../src/index';

describe('@crosssync/shared', () => {
  it('exports package name and version', () => {
    expect(PACKAGE).toBe('@crosssync/shared');
    expect(VERSION).toBe('0.1.0');
  });

  it('re-exports the public API surface', async () => {
    const shared = await import('../src/index');
    for (const key of [
      'resolveBrowserDataDir',
      'resolveCrossSyncDirs',
      'readSqliteCopy',
      'createDefaultConfig',
      'walkBookmarkTree',
      'isCliConfig',
      'BROWSERS',
      'BOOKMARKS_FILE_NAME',
    ]) {
      expect(shared).toHaveProperty(key);
    }
  });
});
