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
  /** Nodes taken from a later browser because the accumulated tree lacked the id. */
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

/** Node wrapped with the browser it came from and an id-indexed child map. */
interface TrackedNode {
  node: BookmarkNode;
  origin: BrowserName;
  children: Map<string, TrackedNode>;
}

/**
 * Merges bookmark files coming from several Chromium browsers.
 *
 * Nodes are matched by `id`; when both browsers know the same id, the node with
 * the newer `date_added` wins (ties keep the earlier input's node).
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
  const children = new Map<string, TrackedNode>();
  for (const child of node.children ?? []) {
    children.set(child.id, toTrackedNode(child, origin));
  }
  return { node, origin, children };
}

function toBookmarkNode(tracked: TrackedNode): BookmarkNode {
  const node: BookmarkNode = { ...tracked.node };
  if (node.type === 'folder') {
    node.children = [...tracked.children.values()].map(toBookmarkNode);
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
    const children = new Map(winner.children);
    for (const [id, incomingChild] of incoming.children) {
      const existing = children.get(id);
      if (existing) {
        children.set(id, mergeTrackedNode(existing, incomingChild, stats, conflicts));
      } else {
        children.set(id, incomingChild);
        stats.added += 1;
      }
    }
    return { node: winner.node, origin: winner.origin, children };
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
