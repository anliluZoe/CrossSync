import type { BrowserName } from '@crosssync/shared';

export const CORE_PACKAGE = '@crosssync/core';
export const CORE_VERSION = '0.1.0';

/** How many of the most recent backups `pruneBackups` keeps by default. */
export const DEFAULT_BACKUP_RETENTION = 10;

/** Maximum number of log entries kept in memory by `Logger`. */
export const MAX_BUFFERED_LOG_ENTRIES = 500;

/** Default number of entries returned by `readLogEntries`. */
export const DEFAULT_LOG_LIMIT = 100;

export interface BrowserProcessNames {
  win32: string;
  darwin: string;
  linux: string;
}

/** Executable / application names used to detect a running browser. */
export const BROWSER_PROCESS_NAMES: Record<BrowserName, BrowserProcessNames> = {
  chrome: {
    win32: 'chrome.exe',
    darwin: 'Google Chrome',
    linux: 'chrome',
  },
  edge: {
    win32: 'msedge.exe',
    darwin: 'Microsoft Edge',
    linux: 'msedge',
  },
};
