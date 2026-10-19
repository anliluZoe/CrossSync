import { describe, it, expect } from 'vitest';

import * as core from '../src/index';

describe('@crosssync/core', () => {
  it('exports package name and version', () => {
    expect(core.PACKAGE).toBe('@crosssync/core');
    expect(core.VERSION).toBe('0.1.0');
  });

  it('exposes the sync engine surface', () => {
    for (const key of [
      'runSync',
      'writeBackBookmarks',
      'mergeBookmarkFiles',
      'mergeHistory',
      'createBackup',
      'listBackups',
      'pruneBackups',
      'createBrowserReader',
      'createConfiguredBrowserReaders',
      'getRunningBrowserNames',
      'isBrowserRunning',
      'Logger',
      'readLogEntries',
      'clearLogFile',
    ]) {
      expect(core).toHaveProperty(key);
    }
  });

  it('no longer exports the websocket bridge', () => {
    for (const key of [
      'WebSocketServerWrapper',
      'ConnectionManager',
      'MessageRouter',
      'AuthManager',
      'ConflictResolver',
      'generateToken',
    ]) {
      expect(core).not.toHaveProperty(key);
    }
  });
});
