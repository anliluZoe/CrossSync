/**
 * Types mirroring the Chromium `Bookmarks` JSON file, shared by Chrome and Edge.
 *
 * Chromium writes snake_case keys (`date_added`, `date_modified`, ...) and encodes
 * timestamps as microsecond strings since the Windows epoch (1601-01-01).
 */

export const BOOKMARK_NODE_TYPES = ['folder', 'url'] as const;
export type BookmarkNodeType = (typeof BOOKMARK_NODE_TYPES)[number];

export interface BookmarkNode {
  /** Chromium-managed numeric id, string encoded. */
  id: string;
  /** Display name. Root folders use localized names. */
  name: string;
  type: BookmarkNodeType;
  /** Present on `folder` nodes only. */
  children?: BookmarkNode[];
  /** Present on `url` nodes only. */
  url?: string;
  /** Chromium GUID; regenerated when absent. */
  guid?: string;
  /** Microseconds since the Windows epoch, string encoded. */
  date_added?: string;
  date_modified?: string;
  date_last_used?: string;
  meta_info?: Record<string, unknown>;
}

/** Fixed top-level folders of a Chromium bookmark file. */
export const BOOKMARK_ROOT_KEYS = ['bookmark_bar', 'other', 'synced'] as const;
export type BookmarkRootKey = (typeof BOOKMARK_ROOT_KEYS)[number];

export interface BookmarkRoots {
  bookmark_bar: BookmarkNode;
  other: BookmarkNode;
  synced?: BookmarkNode;
}

export interface BookmarkFile {
  /** Chrome validates this MD5 field; CrossSync drops it on write-back. */
  checksum?: string;
  roots: BookmarkRoots;
  version?: number;
}

/** A bookmark node together with the folder path leading to it. */
export interface FlatBookmark {
  node: BookmarkNode;
  /** Folder names from the root down to (excluding) the node itself. */
  folderPath: string[];
}

export function isBookmarkFolder(node: BookmarkNode): boolean {
  return node.type === 'folder';
}

export function isBookmarkUrl(node: BookmarkNode): boolean {
  return node.type === 'url';
}

/** Depth-first traversal of a bookmark tree. */
export function walkBookmarkTree(node: BookmarkNode, visit: (node: BookmarkNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walkBookmarkTree(child, visit);
  }
}

/** Flattens a bookmark tree into a list of nodes while keeping their folder path. */
export function flattenBookmarks(root: BookmarkNode, folderPath: string[] = []): FlatBookmark[] {
  const result: FlatBookmark[] = [{ node: root, folderPath }];
  const nextPath = root.type === 'folder' ? [...folderPath, root.name] : folderPath;
  for (const child of root.children ?? []) {
    result.push(...flattenBookmarks(child, nextPath));
  }
  return result;
}

/** Counts nodes in a bookmark tree, optionally filtered by node type. */
export function countBookmarks(root: BookmarkNode, type?: BookmarkNodeType): number {
  let total = 0;
  walkBookmarkTree(root, (node) => {
    if (!type || node.type === type) {
      total += 1;
    }
  });
  return total;
}
