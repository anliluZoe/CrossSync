import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

import type { BookmarkFile, BookmarkNode } from './bookmark';
import { SYNC_STRATEGIES, type CliConfig } from './config';
import type { BrowserName, LogLevel } from './constants';
import {
  BACKUP_DIR_NAME,
  BROWSERS,
  CHROMIUM_EPOCH_OFFSET_MS,
  CONFIG_FILE_NAME,
  CROSSSYNC_DIR_NAME,
  EXPORT_DIR_NAME,
  LOG_DIR_NAME,
  LOG_FILE_NAME,
  LOG_LEVELS,
  PROFILE_NAME_PATTERN,
} from './constants';
import type { HistoryEntry } from './history';

/* -------------------------------------------------------------------------- */
/* JSON helpers                                                               */
/* -------------------------------------------------------------------------- */

export function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return safeJsonParse<T>(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Writes JSON via a temporary file in the same directory followed by a rename,
 * so a partial write can never corrupt an existing file.
 */
export function writeJsonFileSafe(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tempFile = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    safeUnlink(tempFile);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Filesystem helpers                                                         */
/* -------------------------------------------------------------------------- */

export function pathExists(target: string): boolean {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function safeUnlink(target: string): void {
  try {
    fs.unlinkSync(target);
  } catch {
    /* ignore: the file may already be gone */
  }
}

export function removeDirSafe(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore: best effort cleanup */
  }
}

/** Copies a (possibly locked) file to a new location, then renames it into place. */
export function copyFileSafe(source: string, destination: string): void {
  ensureDir(path.dirname(destination));
  const tempFile = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.copyFileSync(source, tempFile);
    fs.renameSync(tempFile, destination);
  } catch (error) {
    safeUnlink(tempFile);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Chromium time conversion                                                   */
/* -------------------------------------------------------------------------- */

/** Converts a Chromium microsecond timestamp into Unix epoch milliseconds. */
export function parseChromiumTime(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const micros = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(micros)) {
    return 0;
  }
  return Math.round(micros / 1000) - CHROMIUM_EPOCH_OFFSET_MS;
}

/** Converts Unix epoch milliseconds into a Chromium microsecond timestamp string. */
export function toChromiumTime(unixMs: number): string {
  return String((unixMs + CHROMIUM_EPOCH_OFFSET_MS) * 1000);
}

/* -------------------------------------------------------------------------- */
/* Cross-platform path resolution                                             */
/* -------------------------------------------------------------------------- */

export function resolveHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32' && env.USERPROFILE) {
    return env.USERPROFILE;
  }
  if (env.HOME) {
    return env.HOME;
  }
  try {
    return os.homedir();
  } catch {
    return process.cwd();
  }
}

type BrowserPathSegments = Record<'win32' | 'darwin' | 'linux', string[]>;

const BROWSER_PATH_SEGMENTS: Record<BrowserName, BrowserPathSegments> = {
  chrome: {
    win32: ['Google', 'Chrome', 'User Data'],
    darwin: ['Library', 'Application Support', 'Google', 'Chrome'],
    linux: ['.config', 'google-chrome'],
  },
  edge: {
    win32: ['Microsoft', 'Edge', 'User Data'],
    darwin: ['Library', 'Application Support', 'Microsoft Edge'],
    linux: ['.config', 'microsoft-edge'],
  },
};

export interface ResolveBrowserDataDirOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

/** Resolves the "User Data" directory of a Chromium browser for the current OS. */
export function resolveBrowserDataDir(
  browser: BrowserName,
  options: ResolveBrowserDataDirOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.homeDir ?? resolveHomeDir(env, platform);
  const segments = BROWSER_PATH_SEGMENTS[browser];

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return path.join(localAppData, ...segments.win32);
  }
  const key = platform === 'darwin' ? 'darwin' : 'linux';
  return path.join(home, ...segments[key]);
}

/** Lists the Chromium profile directory names found inside a "User Data" directory. */
export function listProfiles(dataDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && PROFILE_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function resolveProfileDir(dataDir: string, profile: string): string {
  return path.join(dataDir, profile);
}

export interface CrossSyncDirs {
  root: string;
  backups: string;
  exports: string;
  logs: string;
  configFile: string;
  logFile: string;
}

/** Resolves every CrossSync runtime path (all under `~/.crosssync`). */
export function resolveCrossSyncDirs(homeDir?: string): CrossSyncDirs {
  const root = path.join(homeDir ?? resolveHomeDir(), CROSSSYNC_DIR_NAME);
  return {
    root,
    backups: path.join(root, BACKUP_DIR_NAME),
    exports: path.join(root, EXPORT_DIR_NAME),
    logs: path.join(root, LOG_DIR_NAME),
    configFile: path.join(root, CONFIG_FILE_NAME),
    logFile: path.join(root, LOG_DIR_NAME, LOG_FILE_NAME),
  };
}

/* -------------------------------------------------------------------------- */
/* SQLite "copy then read"                                                    */
/* -------------------------------------------------------------------------- */

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

export interface SqliteDriver {
  new (
    filename: string,
    options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number },
  ): SqliteDatabase;
}

export interface ReadSqliteCopyOptions {
  sql: string;
  params?: unknown[];
  /** Prefix used for the temporary directory holding the copy. */
  tempPrefix?: string;
}

const requireFromHere = createRequire(__filename);

let sqliteDriver: SqliteDriver | null = null;

/**
 * Lazily resolves the optional `better-sqlite3` native driver so that the many
 * code paths that never touch browser history keep working without it installed.
 */
export function loadSqliteDriver(): SqliteDriver {
  if (sqliteDriver) {
    return sqliteDriver;
  }
  try {
    const loaded = requireFromHere('better-sqlite3') as SqliteDriver | { default: SqliteDriver };
    sqliteDriver = typeof loaded === 'function' ? loaded : loaded.default;
    return sqliteDriver;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to load the "better-sqlite3" driver (${reason}). ` +
        'Run `pnpm install` to build/download the native SQLite driver, then retry.',
    );
  }
}

/** Injects a driver implementation (used by tests) or resets the cache. */
export function setSqliteDriver(driver: SqliteDriver | null): void {
  sqliteDriver = driver;
}

/**
 * Chromium keeps an exclusive lock on `History` while the browser runs, so we
 * copy it to a temp directory first and read the copy.
 */
export function copyDatabaseToTemp(dbPath: string, tempPrefix = 'crosssync-sqlite'): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${tempPrefix}-`));
  const target = path.join(tempDir, path.basename(dbPath));
  fs.copyFileSync(dbPath, target);
  return target;
}

/** Runs a query against a temporary copy of a SQLite database. */
export function readSqliteCopy<T = Record<string, unknown>>(
  dbPath: string,
  options: ReadSqliteCopyOptions,
): T[] {
  if (!pathExists(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }
  const tempCopy = copyDatabaseToTemp(dbPath, options.tempPrefix);
  const Database = loadSqliteDriver();
  let db: SqliteDatabase | null = null;
  try {
    db = new Database(tempCopy, { readonly: true, fileMustExist: true });
    const statement = db.prepare(options.sql);
    return statement.all(...(options.params ?? [])) as T[];
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    removeDirSafe(path.dirname(tempCopy));
  }
}

/* -------------------------------------------------------------------------- */
/* Type guards                                                                */
/* -------------------------------------------------------------------------- */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBookmarkNode(value: unknown): value is BookmarkNode {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    return false;
  }
  if (value.type !== 'folder' && value.type !== 'url') {
    return false;
  }
  if (value.url !== undefined && typeof value.url !== 'string') {
    return false;
  }
  if (value.children !== undefined) {
    if (!Array.isArray(value.children) || !value.children.every(isBookmarkNode)) {
      return false;
    }
  }
  return true;
}

export function isBookmarkFile(value: unknown): value is BookmarkFile {
  if (!isPlainObject(value) || !isPlainObject(value.roots)) {
    return false;
  }
  const roots = value.roots;
  return isBookmarkNode(roots.bookmark_bar) && isBookmarkNode(roots.other);
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.visitCount === 'number' &&
    typeof value.typedCount === 'number' &&
    typeof value.lastVisitTime === 'number'
  );
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

export function isBrowserName(value: unknown): value is BrowserName {
  return typeof value === 'string' && (BROWSERS as readonly string[]).includes(value);
}

export function isCliConfig(value: unknown): value is CliConfig {
  if (!isPlainObject(value)) {
    return false;
  }
  const stringKeys = ['dataDir', 'backupDir', 'exportDir', 'logDir', 'profile'];
  if (typeof value.version !== 'number') {
    return false;
  }
  if (!stringKeys.every((key) => typeof value[key] === 'string')) {
    return false;
  }
  if (!isLogLevel(value.logLevel)) {
    return false;
  }

  if (!isPlainObject(value.browsers)) {
    return false;
  }
  for (const browser of BROWSERS) {
    const entry = (value.browsers as Record<string, unknown>)[browser];
    if (!isPlainObject(entry) || typeof entry.enabled !== 'boolean') {
      return false;
    }
  }

  if (!isPlainObject(value.sync)) {
    return false;
  }
  const sync = value.sync;
  if (typeof sync.bookmarks !== 'boolean' || typeof sync.history !== 'boolean') {
    return false;
  }
  if (!(SYNC_STRATEGIES as readonly string[]).includes(sync.strategy as string)) {
    return false;
  }

  if (!isPlainObject(value.schedule)) {
    return false;
  }
  if (
    typeof value.schedule.installed !== 'boolean' ||
    typeof value.schedule.expression !== 'string'
  ) {
    return false;
  }

  // `exports` was added after the first config version; missing is valid.
  const exportsValue = value.exports;
  if (exportsValue !== undefined) {
    if (!isPlainObject(exportsValue)) {
      return false;
    }
    const keep = exportsValue.keep;
    if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 0) {
      return false;
    }
  }
  return true;
}
