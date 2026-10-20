import type {
  BookmarkFile,
  BookmarkNode,
  BookmarkRootKey,
  BookmarkRoots,
  BrowserName,
  HistoryEntry,
} from '@crosssync/shared';
import { BOOKMARK_ROOT_KEYS, countBookmarks, parseChromiumTime } from '@crosssync/shared';

export interface BookmarkMergeInput {
  browser: BrowserName;
  file: BookmarkFile;
}

export interface BookmarkMergeStats {
  /** Total nodes in the merged tree, including root folders. */
  total: number;
  /** Nodes taken from a later browser because the accumulated tree lacked them. */
  added: number;
  /** Nodes replaced by a later browser whose `date_added` was newer. */
  updated: number;
  /** Nodes seen in several browsers with an identical `date_added`. */
  identical: number;
}

export interface BookmarkMergeConflict {
  id: string;
  name: string;
  type: BookmarkNode['type'];
  winnerOrigin: BrowserName;
  loserOrigin: BrowserName;
  winnerDateAdded: number;
  loserDateAdded: number;
}

export interface BookmarkMergeResult {
  roots: BookmarkRoots;
  stats: BookmarkMergeStats;
  conflicts: BookmarkMergeConflict[];
}

export interface HistoryMergeInput {
  browser: BrowserName;
  entries: HistoryEntry[];
}

export interface HistoryMergeStats {
  total: number;
  /** Entries seen in more than one browser and collapsed into one. */
  duplicates: number;
}

export interface HistoryMergeResult {
  entries: HistoryEntry[];
  stats: HistoryMergeStats;
}

/** Node wrapped with the browser it came from. */
interface TrackedNode {
  node: BookmarkNode;
  origin: BrowserName;
  children: TrackedNode[];
}

/**
 * Merges bookmark files coming from several Chromium browsers.
 *
 * Chromium bookmark ids are only unique inside one profile, so they must never
 * be used to match bookmarks across browsers. Nodes are matched by, in order:
 *
 * 1. `guid` (stable identity; shared between files CrossSync has written)
 * 2. type + name (url nodes additionally compare their URL)
 * 3. the URL of url nodes
 *
 * When both browsers know the same node, the version with the newer
 * `date_added` wins. Local ids that still collide after merging are renumbered,
 * and duplicate guids are dropped, so the merged tree is safe to write back to
 * every browser.
 */
export function mergeBookmarkFiles(inputs: BookmarkMergeInput[]): BookmarkMergeResult {
  if (inputs.length === 0) {
    throw new Error('mergeBookmarkFiles requires at least one input');
  }

  const stats: BookmarkMergeStats = { total: 0, added: 0, updated: 0, identical: 0 };
  const conflicts: BookmarkMergeConflict[] = [];

  const [first, ...rest] = inputs;
  const roots: Partial<Record<BookmarkRootKey, TrackedNode>> = {};
  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = first.file.roots[key];
    if (root) {
      roots[key] = toTrackedNode(root, first.browser);
    }
  }

  for (const input of rest) {
    for (const key of BOOKMARK_ROOT_KEYS) {
      const incoming = input.file.roots[key];
      if (!incoming) {
        continue;
      }
      const existing = roots[key];
      roots[key] = existing
        ? mergeTrackedNode(existing, toTrackedNode(incoming, input.browser), stats, conflicts)
        : toTrackedNode(incoming, input.browser);
    }
  }

  const mergedRoots: BookmarkRoots = {
    bookmark_bar: toBookmarkNode(roots.bookmark_bar as TrackedNode),
    other: toBookmarkNode(roots.other as TrackedNode),
  };
  if (roots.synced) {
    mergedRoots.synced = toBookmarkNode(roots.synced);
  }

  // The same merged tree is written back to every browser, so ids must be
  // unique within it even when the source profiles used overlapping id ranges.
  renumberDuplicateIds(mergedRoots, highestNumericId(inputs));
  dedupeGuids(mergedRoots);

  stats.total =
    countBookmarks(mergedRoots.bookmark_bar) +
    countBookmarks(mergedRoots.other) +
    (mergedRoots.synced ? countBookmarks(mergedRoots.synced) : 0);

  return { roots: mergedRoots, stats, conflicts };
}

/**
 * Merges history entries from several browsers, de-duplicating by URL.
 *
 * `visitCount` / `typedCount` take the maximum seen, the title comes from the
 * most recent visit, and `lastVisitTime` keeps the newest timestamp.
 */
export function mergeHistory(inputs: HistoryMergeInput[]): HistoryMergeResult {
  const byUrl = new Map<string, HistoryEntry>();
  let duplicates = 0;

  for (const input of inputs) {
    for (const entry of input.entries) {
      const existing = byUrl.get(entry.url);
      if (!existing) {
        byUrl.set(entry.url, { ...entry });
        continue;
      }
      duplicates += 1;
      const newest = entry.lastVisitTime > existing.lastVisitTime ? entry : existing;
      byUrl.set(entry.url, {
        ...existing,
        title: newest.title || existing.title,
        lastVisitTime: Math.max(existing.lastVisitTime, entry.lastVisitTime),
        visitCount: Math.max(existing.visitCount, entry.visitCount),
        typedCount: Math.max(existing.typedCount, entry.typedCount),
      });
    }
  }

  const entries = [...byUrl.values()].sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  return { entries, stats: { total: entries.length, duplicates } };
}

function toTrackedNode(node: BookmarkNode, origin: BrowserName): TrackedNode {
  return {
    node,
    origin,
    children: (node.children ?? []).map((child) => toTrackedNode(child, origin)),
  };
}

function toBookmarkNode(tracked: TrackedNode): BookmarkNode {
  const node: BookmarkNode = { ...tracked.node };
  if (node.type === 'folder') {
    node.children = tracked.children.map(toBookmarkNode);
  }
  return node;
}

function mergeTrackedNode(
  base: TrackedNode,
  incoming: TrackedNode,
  stats: BookmarkMergeStats,
  conflicts: BookmarkMergeConflict[],
): TrackedNode {
  const baseDateAdded = parseChromiumTime(base.node.date_added);
  const incomingDateAdded = parseChromiumTime(incoming.node.date_added);
  const winner = incomingDateAdded > baseDateAdded ? incoming : base;

  if (base.node.type === 'folder' && incoming.node.type === 'folder') {
    if (incomingDateAdded === baseDateAdded) {
      stats.identical += 1;
    }
    return {
      node: winner.node,
      origin: winner.origin,
      children: mergeChildren(base.children, incoming.children, stats, conflicts),
    };
  }

  if (incomingDateAdded === baseDateAdded) {
    stats.identical += 1;
    return base;
  }

  const loser = winner === incoming ? base : incoming;
  conflicts.push({
    id: base.node.id,
    name: winner.node.name,
    type: winner.node.type,
    winnerOrigin: winner.origin,
    loserOrigin: loser.origin,
    winnerDateAdded: winner === incoming ? incomingDateAdded : baseDateAdded,
    loserDateAdded: winner === incoming ? baseDateAdded : incomingDateAdded,
  });

  if (winner === incoming) {
    stats.updated += 1;
    return incoming;
  }
  return base;
}

/** Matches the children of two versions of the same folder. */
function mergeChildren(
  baseChildren: TrackedNode[],
  incomingChildren: TrackedNode[],
  stats: BookmarkMergeStats,
  conflicts: BookmarkMergeConflict[],
): TrackedNode[] {
  const merged = [...baseChildren];
  const matched = new Array<boolean>(merged.length).fill(false);

  const takeMatch = (
    incoming: TrackedNode,
    same: (base: TrackedNode, candidate: TrackedNode) => boolean,
  ): boolean => {
    for (let index = 0; index < merged.length; index += 1) {
      if (matched[index] || !same(merged[index], incoming)) {
        continue;
      }
      matched[index] = true;
      merged[index] = mergeTrackedNode(merged[index], incoming, stats, conflicts);
      return true;
    }
    return false;
  };

  // Compare by guid first across all pending nodes, then by content, and only
  // then fall back to the URL, so a renamed bookmark still matches its peer.
  const byContent: TrackedNode[] = [];
  for (const incoming of incomingChildren) {
    if (!takeMatch(incoming, sameGuid)) {
      byContent.push(incoming);
    }
  }

  const byUrl: TrackedNode[] = [];
  for (const incoming of byContent) {
    if (!takeMatch(incoming, sameContent)) {
      byUrl.push(incoming);
    }
  }

  const added: TrackedNode[] = [];
  for (const incoming of byUrl) {
    if (!takeMatch(incoming, sameUrl)) {
      added.push(incoming);
    }
  }

  stats.added += added.length;
  merged.push(...added);
  return merged;
}

function sameGuid(base: TrackedNode, incoming: TrackedNode): boolean {
  return (
    base.node.type === incoming.node.type &&
    typeof base.node.guid === 'string' &&
    base.node.guid.length > 0 &&
    base.node.guid === incoming.node.guid
  );
}

function sameContent(base: TrackedNode, incoming: TrackedNode): boolean {
  if (base.node.type !== incoming.node.type) {
    return false;
  }
  if (base.node.type === 'folder') {
    return base.node.name === incoming.node.name;
  }
  const baseUrl = normalizedUrl(base.node);
  return (
    baseUrl.length > 0 &&
    baseUrl === normalizedUrl(incoming.node) &&
    base.node.name === incoming.node.name
  );
}

function sameUrl(base: TrackedNode, incoming: TrackedNode): boolean {
  if (base.node.type !== 'url' || incoming.node.type !== 'url') {
    return false;
  }
  const baseUrl = normalizedUrl(base.node);
  return baseUrl.length > 0 && baseUrl === normalizedUrl(incoming.node);
}

function normalizedUrl(node: BookmarkNode): string {
  return (node.url ?? '').trim();
}

/** Highest numeric id across every input, used as the renumbering starting point. */
function highestNumericId(inputs: BookmarkMergeInput[]): number {
  let highest = 0;
  const visit = (node: BookmarkNode): void => {
    const id = Number(node.id);
    if (Number.isInteger(id) && id > highest) {
      highest = id;
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const input of inputs) {
    for (const key of BOOKMARK_ROOT_KEYS) {
      const root = input.file.roots[key];
      if (root) {
        visit(root);
      }
    }
  }
  return highest;
}

/** Renumbers nodes whose id is already used, starting above every input id. */
function renumberDuplicateIds(roots: BookmarkRoots, highest: number): void {
  const seen = new Set<string>();
  let next = highest + 1;

  const visit = (node: BookmarkNode): void => {
    if (seen.has(node.id)) {
      while (seen.has(String(next))) {
        next += 1;
      }
      node.id = String(next);
      next += 1;
    }
    seen.add(node.id);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    if (root) {
      visit(root);
    }
  }
}

/**
 * Drops duplicate guids: Chromium regenerates a missing guid, while keeping a
 * duplicate could make the browser discard the bookmark.
 */
function dedupeGuids(roots: BookmarkRoots): void {
  const seen = new Set<string>();

  const visit = (node: BookmarkNode): void => {
    if (node.guid) {
      if (seen.has(node.guid)) {
        delete node.guid;
      } else {
        seen.add(node.guid);
      }
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    if (root) {
      visit(root);
    }
  }
}
