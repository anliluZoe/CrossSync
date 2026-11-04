import { randomUUID } from 'crypto';

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
 * `date_added` wins. Local ids that still collide after merging are renumbered
 * and repeated bookmarks are collapsed, so the merged tree is safe to write back
 * to every browser and a second sync does not add another copy.
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
  collapseDuplicateSiblings(mergedRoots);
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
    score?: (base: TrackedNode, candidate: TrackedNode) => number,
  ): boolean => {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < merged.length; index += 1) {
      if (matched[index] || !same(merged[index], incoming)) {
        continue;
      }
      if (!score) {
        bestIndex = index;
        break;
      }
      const value = score(merged[index], incoming);
      if (value > bestScore) {
        bestScore = value;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) {
      return false;
    }
    matched[bestIndex] = true;
    merged[bestIndex] = mergeTrackedNode(merged[bestIndex], incoming, stats, conflicts);
    return true;
  };

  // Compare by guid first across all pending nodes, then by content, and only
  // then fall back to the URL, so a renamed bookmark still matches its peer.
  const byContent: TrackedNode[] = [];
  for (const incoming of incomingChildren) {
    if (!takeMatch(incoming, sameGuid)) {
      byContent.push(incoming);
    }
  }

  // Sibling folders may share a name (users create several "Inbox" folders, and
  // a lost guid makes them indistinguishable by identity). Match the folder with
  // the most overlapping descendants instead of the first one, otherwise two
  // different folders cross-merge and every bookmark gets duplicated on each run.
  const byUrl: TrackedNode[] = [];
  for (const incoming of byContent) {
    if (!takeMatch(incoming, sameContent, folderOverlap)) {
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

/** Stable identities of every descendant, used to score sibling folder matches. */
function descendantIdentityKeys(folder: TrackedNode): Set<string> {
  const keys = new Set<string>();
  const visit = (node: TrackedNode): void => {
    for (const child of node.children) {
      const guid = child.node.guid;
      if (typeof guid === 'string' && guid.length > 0) {
        keys.add(`g:${guid}`);
      } else if (child.node.type === 'url') {
        keys.add(`u:${normalizedUrl(child.node)}`);
      } else {
        keys.add(`f:${child.node.name}`);
      }
      visit(child);
    }
  };
  visit(folder);
  return keys;
}

/**
 * Number of descendants two folders have in common. Sibling folders can share a
 * name, so picking the candidate with the highest overlap keeps distinct folders
 * separate instead of cross-merging their contents (which duplicates every
 * bookmark on each sync).
 */
function folderOverlap(base: TrackedNode, incoming: TrackedNode): number {
  if (base.node.type !== 'folder' || incoming.node.type !== 'folder') {
    return 0;
  }
  const baseKeys = descendantIdentityKeys(base);
  if (baseKeys.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const key of descendantIdentityKeys(incoming)) {
    if (baseKeys.has(key)) {
      overlap += 1;
    }
  }
  return overlap;
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
 * Collapses bookmarks that ended up several times in the same folder.
 *
 * Repeated syncs used to leave a copy of one bookmark next to an identical one.
 * Two url nodes with the same URL, name and `date_added` are indistinguishable,
 * so keeping only the first one is safe and stops the duplicates from being
 * carried over on every run. Folders are skipped: several folders may
 * legitimately share a name.
 */
function collapseDuplicateSiblings(roots: BookmarkRoots): void {
  const visit = (node: BookmarkNode): void => {
    if (!node.children) {
      return;
    }
    const seen = new Map<string, BookmarkNode>();
    const kept: BookmarkNode[] = [];
    for (const child of node.children) {
      const key = duplicateSiblingKey(child);
      if (key !== null) {
        const existing = seen.get(key);
        if (existing) {
          // Keep the identity one of the copies already carries.
          if (!existing.guid && child.guid) {
            existing.guid = child.guid;
          }
          continue;
        }
        seen.set(key, child);
      }
      kept.push(child);
      visit(child);
    }
    node.children = kept;
  };

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    if (root) {
      visit(root);
    }
  }
}

function duplicateSiblingKey(node: BookmarkNode): string | null {
  if (node.type !== 'url') {
    return null;
  }
  return [node.url ?? '', node.name, node.date_added ?? ''].join('\u0000');
}

/**
 * Drops a bookmark whose guid is already used elsewhere in the merged tree.
 *
 * A duplicate guid means the same bookmark was copied twice: an earlier sync
 * copied a whole folder whose child already existed somewhere else. Chromium
 * keeps one node per guid, so the later occurrence is dropped. This matters for
 * more than tidiness: a node whose guid was simply deleted gets a brand-new guid
 * from the browser on the next load, so the following merge treats it as a new
 * bookmark and appends yet another copy on every sync.
 *
 * Folders are never dropped, because their children would be lost with them; a
 * duplicate folder guid only re-identifies the copy. Every node leaves this
 * function with a unique guid, including nodes that had none, so both browsers
 * write back the same identity instead of inventing their own.
 */
function dedupeGuids(roots: BookmarkRoots): void {
  const seen = new Set<string>();

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    if (root?.guid) {
      seen.add(root.guid);
    }
  }

  const visit = (node: BookmarkNode): void => {
    if (!node.children) {
      return;
    }
    const kept: BookmarkNode[] = [];
    for (const child of node.children) {
      let guid = child.guid;
      if (!guid) {
        guid = randomUUID();
      } else if (seen.has(guid)) {
        if (child.type === 'url') {
          continue;
        }
        guid = randomUUID();
      }
      child.guid = guid;
      seen.add(guid);
      kept.push(child);
      visit(child);
    }
    node.children = kept;
  };

  for (const key of BOOKMARK_ROOT_KEYS) {
    const root = roots[key];
    if (root) {
      visit(root);
    }
  }
}
