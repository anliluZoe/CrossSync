export const SHARED_PACKAGE = '@crosssync/shared';
export const SHARED_VERSION = '0.1.0';

/** Log levels, ordered from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Supported Chromium-based browsers. */
export const BROWSERS = ['chrome', 'edge'] as const;
export type BrowserName = (typeof BROWSERS)[number];

/**
 * Chromium timestamps are microseconds since 1601-01-01T00:00:00Z.
 * This is the offset between that epoch and the Unix epoch, in milliseconds.
 */
export const CHROMIUM_EPOCH_OFFSET_MS = 11644473600000;

/** Directory name (created under the user home) holding all CrossSync runtime data. */
export const CROSSSYNC_DIR_NAME = '.crosssync';
export const BACKUP_DIR_NAME = 'backups';
export const EXPORT_DIR_NAME = 'export';
export const LOG_DIR_NAME = 'logs';
export const CONFIG_FILE_NAME = 'config.json';
export const LOG_FILE_NAME = 'crosssync.log';

/** File names inside a Chromium profile directory. */
export const BOOKMARKS_FILE_NAME = 'Bookmarks';
export const HISTORY_FILE_NAME = 'History';

/** Chromium profile directory names that actually hold user data. */
export const PROFILE_NAME_PATTERN = /^(Default|Profile \d+)$/;

export const DEFAULT_PROFILE = 'Default';
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
export const CONFIG_VERSION = 1;

/** How many of the most recent export files are kept after a successful run. */
export const DEFAULT_EXPORT_RETENTION = 10;

/** Cron expression installed by default: every day at 09:00 local time. */
export const DEFAULT_CRON_SCHEDULE = '0 9 * * *';
