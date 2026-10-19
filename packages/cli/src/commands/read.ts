import type { BrowserName, CliConfig } from '@crosssync/shared';
import { pathExists } from '@crosssync/shared';
import {
  createConfiguredBrowserReaders,
  mergeBookmarkFiles,
  mergeHistory,
  type BookmarkMergeResult,
  type HistoryMergeResult,
} from '@crosssync/core';

export interface ReadOptions {
  browser?: string[];
  profile?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface MergedData {
  bookmarkMerge: BookmarkMergeResult | null;
  historyMerge: HistoryMergeResult | null;
  warnings: string[];
  /** Files that were read, for reporting. */
  sources: {
    browser: BrowserName;
    profile: string;
    filePath: string;
    kind: 'bookmarks' | 'history';
  }[];
}

/**
 * Reads and merges browser data without backing up or writing anything.
 *
 * Shared by `status` and `export`, which must never touch browser files.
 */
export function readMergedData(config: CliConfig, options: ReadOptions = {}): MergedData {
  const warnings: string[] = [];
  const sources: MergedData['sources'] = [];
  const bookmarkInputs: {
    browser: BrowserName;
    file: Parameters<typeof mergeBookmarkFiles>[0][number]['file'];
  }[] = [];
  const historyInputs: {
    browser: BrowserName;
    entries: Parameters<typeof mergeHistory>[0][number]['entries'];
  }[] = [];

  const readers = createConfiguredBrowserReaders(config, {
    platform: options.platform,
    env: options.env,
  });

  for (const reader of readers) {
    if (options.browser && !options.browser.includes(reader.browser)) {
      continue;
    }
    const profiles = reader.resolveProfiles(options.profile ?? config.profile);
    if (profiles.length === 0) {
      warnings.push(`No ${reader.browser} profile found under ${reader.dataDir}.`);
      continue;
    }

    for (const profile of profiles) {
      const bookmarksPath = reader.bookmarksPath(profile);
      if (pathExists(bookmarksPath)) {
        try {
          const source = reader.readBookmarks(profile);
          bookmarkInputs.push({ browser: source.browser, file: source.file });
          sources.push({
            browser: source.browser,
            profile,
            filePath: bookmarksPath,
            kind: 'bookmarks',
          });
        } catch (error) {
          warnings.push(`Could not read ${reader.browser} bookmarks: ${describeError(error)}`);
        }
      }

      const historyPath = reader.historyPath(profile);
      if (pathExists(historyPath)) {
        try {
          const source = reader.readHistory(profile);
          historyInputs.push({ browser: source.browser, entries: source.entries });
          sources.push({
            browser: source.browser,
            profile,
            filePath: historyPath,
            kind: 'history',
          });
        } catch (error) {
          warnings.push(`Could not read ${reader.browser} history: ${describeError(error)}`);
        }
      }
    }
  }

  return {
    bookmarkMerge: bookmarkInputs.length > 0 ? mergeBookmarkFiles(bookmarkInputs) : null,
    historyMerge: historyInputs.length > 0 ? mergeHistory(historyInputs) : null,
    warnings,
    sources,
  };
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
