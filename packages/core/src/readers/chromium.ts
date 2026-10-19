import path from 'path';

import type { BookmarkFile, BrowserName, HistoryEntry } from '@crosssync/shared';
import {
  BOOKMARKS_FILE_NAME,
  BOOKMARK_ROOT_KEYS,
  countBookmarks,
  HISTORY_FILE_NAME,
  HISTORY_QUERY,
  isBookmarkFile,
  listProfiles,
  LOCAL_STATE_FILE_NAME,
  parseChromiumTime,
  parseProfileList,
  readJsonFile,
  readSqliteCopy,
  resolveBrowserDataDir,
  resolveProfileDir,
} from '@crosssync/shared';

/** Raw `urls` row as returned by SQLite (types vary by driver settings). */
export interface ChromiumHistoryRow {
  id?: number;
  url: string;
  title?: string | null;
  visit_count?: number;
  typed_count?: number;
  last_visit_time?: number | string | bigint | null;
}

export interface BrowserReaderOptions {
  /** Override for the auto-detected "User Data" directory. */
  dataDir?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface BookmarkSource {
  browser: BrowserName;
  profile: string;
  filePath: string;
  file: BookmarkFile;
}

export interface HistorySource {
  browser: BrowserName;
  profile: string;
  filePath: string;
  entries: HistoryEntry[];
}

export interface ChromiumProfileInfo {
  /** Profile directory name, e.g. `Profile 11`. */
  profile: string;
  /** Local profile label shown in the browser's profile switcher. */
  name?: string;
  /** Email of the signed-in Google account. */
  userName?: string;
  /** Display name of the signed-in Google account. */
  gaiaName?: string;
  /** Whether Chromium still uses its placeholder profile name. */
  isUsingDefaultName?: boolean;
}

export interface BrowserReader {
  browser: BrowserName;
  /** The "User Data" directory this reader reads from. */
  dataDir: string;
  /** All Chromium profile directories that exist on disk. */
  profiles(): string[];
  /** Display metadata for every profile directory that exists on disk. */
  profileInfos(): ChromiumProfileInfo[];
  /** Display metadata for one profile, or null when it is not on disk. */
  profileInfo(profile: string): ChromiumProfileInfo | null;
  /** Profiles selected by `profile`, which may be `all`. */
  resolveProfiles(profile: string): string[];
  bookmarksPath(profile: string): string;
  historyPath(profile: string): string;
  readBookmarks(profile: string): BookmarkSource;
  readHistory(profile: string): HistorySource;
}

interface LocalStateFile {
  profile?: {
    info_cache?: Record<string, Record<string, unknown>>;
  };
}

/**
 * Reads display names and signed-in account details from `<User Data>/Local State`.
 * Missing or malformed metadata yields an empty list rather than an error.
 */
export function readProfileInfos(dataDir: string): ChromiumProfileInfo[] {
  const localState = readJsonFile<LocalStateFile>(path.join(dataDir, LOCAL_STATE_FILE_NAME));
  const cache = localState?.profile?.info_cache ?? {};
  return listProfiles(dataDir).map((profile) => toProfileInfo(profile, cache[profile]));
}

function toProfileInfo(
  profile: string,
  raw: Record<string, unknown> | undefined,
): ChromiumProfileInfo {
  const info: ChromiumProfileInfo = { profile };
  const name = readString(raw, 'name');
  const userName = readString(raw, 'user_name');
  const gaiaName = readString(raw, 'gaia_name');
  if (name !== undefined) {
    info.name = name;
  }
  if (userName !== undefined) {
    info.userName = userName;
  }
  if (gaiaName !== undefined) {
    info.gaiaName = gaiaName;
  }
  if (typeof raw?.is_using_default_name === 'boolean') {
    info.isUsingDefaultName = raw.is_using_default_name;
  }
  return info;
}

function readString(raw: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = raw?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Maps a raw SQLite row into a normalised `HistoryEntry`. */
export function toHistoryEntry(row: ChromiumHistoryRow): HistoryEntry {
  return {
    id: typeof row.id === 'number' ? row.id : undefined,
    url: row.url,
    title: row.title ?? '',
    visitCount: toCount(row.visit_count),
    typedCount: toCount(row.typed_count),
    lastVisitTime: toUnixMs(row.last_visit_time),
  };
}

/** Total node count of a Chromium bookmark file, including root folders. */
export function countBookmarkFileNodes(file: BookmarkFile): number {
  let total = 0;
  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = file.roots[key];
    if (root) {
      total += countBookmarks(root);
    }
  }
  return total;
}

/**
 * Reads bookmarks and history from a Chromium-based browser (Chrome or Edge).
 *
 * The reader only ever reads: history is queried through a temporary copy and
 * bookmark files are parsed from disk. Write-back is handled by `sync`.
 */
export function createBrowserReader(
  browser: BrowserName,
  options: BrowserReaderOptions = {},
): BrowserReader {
  const dataDir =
    options.dataDir ??
    resolveBrowserDataDir(browser, { platform: options.platform, env: options.env });

  const bookmarksPath = (profile: string): string =>
    path.join(resolveProfileDir(dataDir, profile), BOOKMARKS_FILE_NAME);

  const historyPath = (profile: string): string =>
    path.join(resolveProfileDir(dataDir, profile), HISTORY_FILE_NAME);

  const profiles = (): string[] => listProfiles(dataDir);

  const profileInfos = (): ChromiumProfileInfo[] => readProfileInfos(dataDir);

  const profileInfo = (profile: string): ChromiumProfileInfo | null =>
    profileInfos().find((info) => info.profile === profile) ?? null;

  const resolveSelectedProfiles = (profile: string): string[] => {
    const found = profiles();
    if (profile.trim() === 'all') {
      return found;
    }
    const requested = parseProfileList(profile);
    return requested.filter((name) => found.includes(name));
  };

  const readBookmarks = (profile: string): BookmarkSource => {
    const filePath = bookmarksPath(profile);
    const file = readJsonFile<BookmarkFile>(filePath);
    if (!isBookmarkFile(file)) {
      throw new Error(`Not a valid Chromium bookmark file: ${filePath}`);
    }
    return { browser, profile, filePath, file };
  };

  const readHistory = (profile: string): HistorySource => {
    const filePath = historyPath(profile);
    const rows = readSqliteCopy<ChromiumHistoryRow>(filePath, {
      sql: HISTORY_QUERY,
      tempPrefix: `crosssync-history-${browser}`,
    });
    const entries = rows
      .filter((row) => typeof row.url === 'string' && row.url.length > 0)
      .map(toHistoryEntry);
    return { browser, profile, filePath, entries };
  };

  return {
    browser,
    dataDir,
    profiles,
    profileInfos,
    profileInfo,
    resolveProfiles: resolveSelectedProfiles,
    bookmarksPath,
    historyPath,
    readBookmarks,
    readHistory,
  };
}

function toCount(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toUnixMs(value: number | string | bigint | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'bigint') {
    return parseChromiumTime(value.toString());
  }
  return parseChromiumTime(value);
}
