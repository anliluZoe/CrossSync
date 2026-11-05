import type { BookmarkNode, BookmarkRoots } from '@crosssync/shared';
import { BOOKMARK_ROOT_KEYS, readJsonFile, writeJsonFileSafe } from '@crosssync/shared';

/** Bumped when the on-disk shape changes; older files are ignored. */
export const MERGE_STATE_VERSION = 1;

/**
 * Result of the previous successful merge, used as the common ancestor for the
 * next one.
 *
 * Only folder titles are recorded: Chromium does not update a folder's
 * `date_modified` when it is renamed, so this snapshot is the only way to tell
 * which browser renamed a folder since the last sync.
 */
export interface BookmarkMergeState {
  version: number;
  /** Folder guid → title as written by the last merge. */
  folders: Record<string, string>;
}

/** Reads the merge snapshot, returning `null` when it is missing or invalid. */
export function readMergeState(filePath: string): BookmarkMergeState | null {
  const raw = readJsonFile<unknown>(filePath);
  return isMergeState(raw) ? raw : null;
}

export function createMergeState(roots: BookmarkRoots): BookmarkMergeState {
  const folders: Record<string, string> = {};
  const visit = (node: BookmarkNode): void => {
    if (node.type === 'folder' && typeof node.guid === 'string' && node.guid.length > 0) {
      folders[node.guid] = node.name;
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    // Permanent roots get the browser's localized title on every load, so only
    // user folders below them are worth remembering.
    for (const child of root?.children ?? []) {
      visit(child);
    }
  }

  return { version: MERGE_STATE_VERSION, folders };
}

/** Persists the merged tree's folder titles for the next run. */
export function writeMergeState(filePath: string, roots: BookmarkRoots): BookmarkMergeState {
  const state = createMergeState(roots);
  writeJsonFileSafe(filePath, state);
  return state;
}

/** Folder guid → title map, or `undefined` when there is no usable snapshot. */
export function mergeStateFolders(
  state: BookmarkMergeState | null,
): Map<string, string> | undefined {
  if (!state) {
    return undefined;
  }
  return new Map(Object.entries(state.folders));
}

function isMergeState(value: unknown): value is BookmarkMergeState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<BookmarkMergeState>;
  if (candidate.version !== MERGE_STATE_VERSION) {
    return false;
  }
  if (typeof candidate.folders !== 'object' || candidate.folders === null) {
    return false;
  }
  return Object.values(candidate.folders).every((name) => typeof name === 'string');
}
