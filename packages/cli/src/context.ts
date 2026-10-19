import path from 'path';

import type { CliConfig, CrossSyncDirs, LogLevel } from '@crosssync/shared';
import {
  createDefaultConfig,
  DEFAULT_EXPORT_RETENTION,
  isCliConfig,
  LOG_FILE_NAME,
  pathExists,
  readJsonFile,
  resolveCrossSyncDirs,
  writeJsonFileSafe,
} from '@crosssync/shared';
import { Logger } from '@crosssync/core';

export interface CommandIo {
  out(text?: string): void;
  err(text?: string): void;
}

export const consoleIo: CommandIo = {
  out: (text = '') => console.log(text),
  err: (text = '') => console.error(text),
};

/** Captures output for tests. */
export function createMemoryIo(): CommandIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text = '') => stdout.push(text),
    err: (text = '') => stderr.push(text),
  };
}

/** Loads `config.json`, creating it with defaults when missing. */
export function loadConfigFile(
  configFile: string,
  dirs: CrossSyncDirs,
): { config: CliConfig; created: boolean } {
  if (!pathExists(configFile)) {
    const config = createDefaultConfig({
      dataDir: dirs.root,
      backupDir: dirs.backups,
      exportDir: dirs.exports,
      logDir: dirs.logs,
    });
    writeJsonFileSafe(configFile, config);
    return { config, created: true };
  }

  const raw = readJsonFile<unknown>(configFile);
  if (!isCliConfig(raw)) {
    throw new Error(
      `Invalid CrossSync config at ${configFile}. Fix or delete the file, then retry.`,
    );
  }
  // Configs written before `exports.keep` existed load with the default.
  const config: CliConfig = raw.exports
    ? raw
    : { ...raw, exports: { keep: DEFAULT_EXPORT_RETENTION } };
  return { config, created: false };
}

export function saveConfigFile(configFile: string, config: CliConfig): void {
  writeJsonFileSafe(configFile, config);
}

export interface CreateContextOptions {
  /** Overrides the user home directory; used by tests. */
  homeDir?: string;
  logLevel?: LogLevel;
  io?: CommandIo;
  /** Mirror log entries to the console. Defaults to false. */
  console?: boolean;
}

export interface CliContext {
  config: CliConfig;
  dirs: CrossSyncDirs;
  logger: Logger;
  io: CommandIo;
  /** True when `config.json` was created during this run. */
  configCreated: boolean;
}

/** Builds the shared runtime context every command works against. */
export function createContext(options: CreateContextOptions = {}): CliContext {
  const dirs = resolveCrossSyncDirs(options.homeDir);
  const { config, created } = loadConfigFile(dirs.configFile, dirs);
  const logger = new Logger(options.logLevel ?? config.logLevel, {
    console: options.console ?? false,
    filePath: path.join(config.logDir, LOG_FILE_NAME),
  });
  return { config, dirs, logger, io: options.io ?? consoleIo, configCreated: created };
}

/** Re-reads the config so a command can persist changes it just made. */
export function reloadConfig(context: CliContext): void {
  const { config } = loadConfigFile(context.dirs.configFile, context.dirs);
  context.config = config;
}
