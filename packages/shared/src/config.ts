import type { BrowserName, LogLevel } from './constants';
import {
  CONFIG_VERSION,
  DEFAULT_CRON_SCHEDULE,
  DEFAULT_EXPORT_RETENTION,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PROFILE,
} from './constants';

/** Whether a run may write merged bookmarks back into the browser files. */
export const SYNC_STRATEGIES = ['merge', 'export'] as const;
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number];

export interface BrowserConfig {
  enabled: boolean;
  /** Override for the auto-detected browser "User Data" directory. */
  dataDir?: string;
}

export interface SyncConfig {
  bookmarks: boolean;
  history: boolean;
  /** `merge` = merge then write back; `export` = read-only, write merged output only. */
  strategy: SyncStrategy;
}

export interface ScheduleConfig {
  /** True when a scheduled task/timer has been installed. */
  installed: boolean;
  /** Cron expression used by the installed schedule. */
  expression: string;
}

export interface ExportsConfig {
  /** How many of the most recent export files to keep; `0` disables cleanup. */
  keep: number;
}

export interface CliConfig {
  version: number;
  /** Absolute path of the CrossSync data directory (`~/.crosssync`). */
  dataDir: string;
  backupDir: string;
  exportDir: string;
  logDir: string;
  logLevel: LogLevel;
  /** Chromium profile to sync: `Default`, `Profile 1`, ... or `all`. */
  profile: string;
  browsers: Record<BrowserName, BrowserConfig>;
  sync: SyncConfig;
  schedule: ScheduleConfig;
  /** Optional so configs written by older versions keep loading. */
  exports?: ExportsConfig;
}

/** Reads `exports.keep`, falling back to the default for older config files. */
export function resolveExportRetention(config: Pick<CliConfig, 'exports'>): number {
  return config.exports?.keep ?? DEFAULT_EXPORT_RETENTION;
}

export interface CreateDefaultConfigOptions {
  dataDir: string;
  backupDir: string;
  exportDir: string;
  logDir: string;
  profile?: string;
  logLevel?: LogLevel;
}

export function createDefaultConfig(options: CreateDefaultConfigOptions): CliConfig {
  return {
    version: CONFIG_VERSION,
    dataDir: options.dataDir,
    backupDir: options.backupDir,
    exportDir: options.exportDir,
    logDir: options.logDir,
    logLevel: options.logLevel ?? DEFAULT_LOG_LEVEL,
    profile: options.profile ?? DEFAULT_PROFILE,
    browsers: {
      chrome: { enabled: true },
      edge: { enabled: true },
    },
    sync: {
      bookmarks: true,
      history: true,
      strategy: 'merge',
    },
    schedule: {
      installed: false,
      expression: DEFAULT_CRON_SCHEDULE,
    },
    exports: {
      keep: DEFAULT_EXPORT_RETENTION,
    },
  };
}
