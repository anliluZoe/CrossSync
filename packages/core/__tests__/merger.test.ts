import { describe, it, expect } from 'vitest';

import type { BookmarkFile, BookmarkNode, BookmarkRoots, HistoryEntry } from '@crosssync/shared';
import { flattenBookmarks } from '@crosssync/shared';

import { mergeBookmarkFiles, mergeHistory } from '../src/merger';
import { bookmarkFile, folder, url } from './helpers';

function chromeFile(): BookmarkFile {
  return bookmarkFile(
    folder('1', 'Bookmarks bar', [
      url('2', 'Chrome only', 'https://chrome.example.com', '2000000'),
      url('3', 'Shared', 'https://shared.example.com', '3000000'),
      folder(
        '4',
        'Folder',
        [url('5', 'In folder', 'https://nested.example.com', '1600000')],
        '1500000',
      ),
    ]),
    folder('6', 'Other bookmarks'),
    'checksum-chrome',
  );
}

function edgeFile(): BookmarkFile {
  return bookmarkFile(
    folder('1', 'Bookmarks bar', [
      url('3', 'Shared (renamed)', 'https://shared.example.com', '5000000'),
      url('7', 'Edge only', 'https://edge.example.com', '2500000'),
    ]),
    folder('6', 'Other bookmarks'),
  );
}

function childIds(node: BookmarkNode): string[] {
  return (node.children ?? []).map((child) => child.id);
}

function findNode(roots: BookmarkRoots, id: string) {
  return flattenBookmarks(roots.bookmark_bar).find((entry) => entry.node.id === id);
}

describe('mergeBookmarkFiles', () => {
  it('keeps every bookmark from both browsers', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    const ids = flattenBookmarks(result.roots.bookmark_bar).map((entry) => entry.node.id);
    expect(ids).toEqual(expect.arrayContaining(['2', '3', '4', '5', '7']));
  });

  it('resolves an id conflict in favour of the newer date_added', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    const shared = findNode(result.roots, '3');
    expect(shared?.node.name).toBe('Shared (renamed)');
    expect(shared?.node.date_added).toBe('5000000');
    expect(result.stats.updated).toBe(1);
  });

  it('appends nodes that only the second browser knows about', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    expect(childIds(result.roots.bookmark_bar)).toEqual(['2', '3', '4', '7']);
    expect(result.stats.added).toBe(1);
  });

  it('counts nodes whose date_added matched on both sides', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    // Both roots ("Bookmarks bar" id 1, "Other bookmarks" id 6) carry no date_added.
    expect(result.stats.identical).toBe(2);
  });

  it('records the losing side of each conflict', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      id: '3',
      name: 'Shared (renamed)',
      winnerOrigin: 'edge',
      loserOrigin: 'chrome',
    });
    expect(result.conflicts[0].winnerDateAdded).toBeGreaterThan(result.conflicts[0].loserDateAdded);
  });

  it('keeps the first browser version when it is newer', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      {
        browser: 'edge',
        file: bookmarkFile(
          folder('1', 'Bookmarks bar', [url('3', 'Older', 'https://shared.example.com', '1000')]),
        ),
      },
    ]);

    const shared = findNode(result.roots, '3');
    expect(shared?.node.name).toBe('Shared');
    expect(result.conflicts[0].winnerOrigin).toBe('chrome');
    expect(result.stats.updated).toBe(0);
  });

  it('counts every merged node', () => {
    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chromeFile() },
      { browser: 'edge', file: edgeFile() },
    ]);

    // bookmark_bar, 2, 3, 4, 5, 7, other
    expect(result.stats.total).toBe(7);
  });

  it('handles a single browser without changes', () => {
    const result = mergeBookmarkFiles([{ browser: 'chrome', file: chromeFile() }]);
    expect(result.stats.added).toBe(0);
    expect(result.stats.updated).toBe(0);
    expect(childIds(result.roots.bookmark_bar)).toEqual(['2', '3', '4']);
  });

  it('merges the synced root when present', () => {
    const chrome = chromeFile();
    chrome.roots.synced = folder('9', 'Mobile bookmarks', [
      url('10', 'Mobile', 'https://m.example.com', '9000000'),
    ]);
    const edge = edgeFile();
    edge.roots.synced = folder('9', 'Mobile bookmarks', [
      url('11', 'Mobile edge', 'https://m2.example.com', '9100000'),
    ]);

    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chrome },
      { browser: 'edge', file: edge },
    ]);

    expect(result.roots.synced).toBeDefined();
    expect(childIds(result.roots.synced as BookmarkNode)).toEqual(['10', '11']);
  });

  it('matches by guid before url so a renamed bookmark keeps one identity', () => {
    const older = url('2', 'Old name', 'https://old.example.com', '1000');
    older.guid = 'guid-shared';
    const newer = url('9', 'New name', 'https://new.example.com', '2000');
    newer.guid = 'guid-shared';

    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: bookmarkFile(folder('1', 'Bookmarks bar', [older])) },
      { browser: 'edge', file: bookmarkFile(folder('1', 'Bookmarks bar', [newer])) },
    ]);

    const bookmarks = flattenBookmarks(result.roots.bookmark_bar).filter(
      (entry) => entry.node.type === 'url',
    );
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].node.url).toBe('https://new.example.com');
    expect(bookmarks[0].node.id).toBe('9');
  });

  it('never matches bookmarks by their profile-local ids', () => {
    // Chrome and Edge both allocate ids from 1, so the same id usually refers
    // to different bookmarks in each profile.
    const chrome = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        url('2', 'Chrome bookmark', 'https://chrome.example.com', '2000000'),
        folder('3', 'Chrome folder', [url('4', 'Nested', 'https://nested.example.com', '1500000')]),
      ]),
    );
    const edge = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        url('2', 'Edge bookmark', 'https://edge.example.com', '2500000'),
        url('3', 'Edge url', 'https://edge2.example.com', '2600000'),
      ]),
    );

    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chrome },
      { browser: 'edge', file: edge },
    ]);

    const entries = flattenBookmarks(result.roots.bookmark_bar);
    const urls = entries
      .filter((entry) => entry.node.type === 'url')
      .map((entry) => entry.node.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://chrome.example.com',
        'https://edge.example.com',
        'https://edge2.example.com',
        'https://nested.example.com',
      ]),
    );
    expect(
      entries.filter(
        (entry) => entry.node.type === 'folder' && entry.node.name === 'Chrome folder',
      ),
    ).toHaveLength(1);

    const ids = entries.map((entry) => entry.node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.stats.added).toBe(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it('renumbers a folder whose id collides with an added url', () => {
    const chrome = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        folder('5', 'Chrome folder', [url('6', 'Nested', 'https://n.example.com')]),
      ]),
    );
    const edge = bookmarkFile(
      folder('1', 'Bookmarks bar', [url('5', 'Edge url', 'https://e.example.com')]),
    );

    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chrome },
      { browser: 'edge', file: edge },
    ]);

    const entries = flattenBookmarks(result.roots.bookmark_bar);
    const folderEntry = entries.find((entry) => entry.node.name === 'Chrome folder');
    expect(folderEntry?.node.type).toBe('folder');
    expect(entries.some((entry) => entry.node.url === 'https://e.example.com')).toBe(true);
    const ids = entries.map((entry) => entry.node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not cross-merge sibling folders that share a name', () => {
    // Chrome and Edge both have two folders called "e6", but their contents
    // are different and listed in opposite order. Matching by position would
    // merge a/b into c/d (and vice versa), duplicating every bookmark.
    const chrome = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        folder('10', 'e6', [
          url('11', 'a', 'https://a.example.com'),
          url('12', 'b', 'https://b.example.com'),
        ]),
        folder('20', 'e6', [
          url('21', 'c', 'https://c.example.com'),
          url('22', 'd', 'https://d.example.com'),
        ]),
      ]),
    );
    const edge = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        folder('30', 'e6', [
          url('31', 'c', 'https://c.example.com'),
          url('32', 'd', 'https://d.example.com'),
        ]),
        folder('40', 'e6', [
          url('41', 'a', 'https://a.example.com'),
          url('42', 'b', 'https://b.example.com'),
        ]),
      ]),
    );

    const result = mergeBookmarkFiles([
      { browser: 'chrome', file: chrome },
      { browser: 'edge', file: edge },
    ]);

    const urlsIn = (node: BookmarkNode): string[] =>
      flattenBookmarks(node)
        .filter((entry) => entry.node.type === 'url')
        .map((entry) => entry.node.url ?? '');
    const folders = result.roots.bookmark_bar.children ?? [];
    expect(folders).toHaveLength(2);
    expect(urlsIn(folders[0]).sort()).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
    expect(urlsIn(folders[1]).sort()).toEqual([
      'https://c.example.com',
      'https://d.example.com',
    ]);
  });

  it('stays stable when sibling folder order changes between syncs', () => {
    const foldersFor = (ids: [string, string][]) =>
      ids.map(([id, urls]) =>
        folder(id, 'e6', urls.split(',').map((href) => url(`u-${href}`, href, `https://${href}`))),
      );
    const first = mergeBookmarkFiles([
      {
        browser: 'chrome',
        file: bookmarkFile(
          folder('1', 'Bookmarks bar', foldersFor([
            ['10', 'a,b'],
            ['20', 'c,d'],
          ])),
        ),
      },
      {
        browser: 'edge',
        file: bookmarkFile(
          folder('1', 'Bookmarks bar', foldersFor([
            ['30', 'c,d'],
            ['40', 'a,b'],
          ])),
        ),
      },
    ]);

    // A browser may reorder the folders after write-back; a second merge must
    // not add anything.
    const reordered = [...(first.roots.bookmark_bar.children ?? [])].reverse();
    const second = mergeBookmarkFiles([
      { browser: 'chrome', file: bookmarkFile(folder('1', 'Bookmarks bar', reordered)) },
      { browser: 'edge', file: bookmarkFile(folder('1', 'Bookmarks bar', first.roots.bookmark_bar.children ?? [])) },
    ]);

    const totalUrls = flattenBookmarks(second.roots.bookmark_bar).filter(
      (entry) => entry.node.type === 'url',
    );
    expect(totalUrls).toHaveLength(4);
    expect(second.stats.added).toBe(0);
  });

  it('throws without any input', () => {
    expect(() => mergeBookmarkFiles([])).toThrow(/at least one input/);
  });

  it('keeps one copy when a bookmark is both on the bar and inside a folder', () => {
    // The user bookmarked a page directly on the bar in Chrome while the same
    // page (same guid) already sat in a folder in Edge. Copying the folder used
    // to duplicate the node and leave a guid-less copy behind, which every later
    // sync treated as a brand-new bookmark.
    const onBar = url('2', 'Page', 'https://page.example.com', '1000');
    onBar.guid = 'guid-page';
    const inFolder = url('7', 'Page', 'https://page.example.com', '1000');
    inFolder.guid = 'guid-page';

    const merged = mergeBookmarkFiles([
      { browser: 'chrome', file: bookmarkFile(folder('1', 'Bookmarks bar', [onBar])) },
      {
        browser: 'edge',
        file: bookmarkFile(
          folder('1', 'Bookmarks bar', [folder('5', 'Reading', [inFolder], '900')]),
        ),
      },
    ]);

    const bookmarks = flattenBookmarks(merged.roots.bookmark_bar).filter(
      (entry) => entry.node.type === 'url',
    );
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].node.id).toBe('2');
    expect(bookmarks[0].node.guid).toBe('guid-page');

    // Writing the tree back to both browsers and syncing again must not add
    // another copy.
    const second = mergeBookmarkFiles([
      { browser: 'chrome', file: { roots: merged.roots, version: 1 } },
      { browser: 'edge', file: { roots: merged.roots, version: 1 } },
    ]);
    expect(
      flattenBookmarks(second.roots.bookmark_bar).filter((entry) => entry.node.type === 'url'),
    ).toHaveLength(1);
    expect(second.stats.added).toBe(0);
  });

  it('collapses identical bookmarks sitting in the same folder', () => {
    const file = bookmarkFile(
      folder('1', 'Bookmarks bar', [
        url('2', 'Page', 'https://page.example.com', '1000'),
        url('3', 'Page', 'https://page.example.com', '1000'),
        url('4', 'Page', 'https://page.example.com', '2000'),
      ]),
    );

    const result = mergeBookmarkFiles([{ browser: 'chrome', file }]);
    const bookmarks = flattenBookmarks(result.roots.bookmark_bar).filter(
      (entry) => entry.node.type === 'url',
    );
    // The two indistinguishable copies collapse; the one with a different
    // date_added may be an intentional second bookmark and is kept.
    expect(bookmarks.map((entry) => entry.node.id)).toEqual(['2', '4']);
  });
});

describe('mergeHistory', () => {
  const chrome: HistoryEntry[] = [
    {
      url: 'https://shared.example.com',
      title: 'Shared',
      visitCount: 1,
      typedCount: 0,
      lastVisitTime: 1000,
    },
    {
      url: 'https://chrome.example.com',
      title: 'Chrome',
      visitCount: 4,
      typedCount: 2,
      lastVisitTime: 2000,
    },
  ];
  const edge: HistoryEntry[] = [
    {
      url: 'https://shared.example.com',
      title: 'Shared newer',
      visitCount: 7,
      typedCount: 3,
      lastVisitTime: 5000,
    },
    {
      url: 'https://edge.example.com',
      title: 'Edge',
      visitCount: 2,
      typedCount: 0,
      lastVisitTime: 3000,
    },
  ];

  it('de-duplicates by url', () => {
    const result = mergeHistory([
      { browser: 'chrome', entries: chrome },
      { browser: 'edge', entries: edge },
    ]);
    expect(result.entries).toHaveLength(3);
    expect(result.stats.duplicates).toBe(1);
  });

  it('keeps the newest visit time and highest counters', () => {
    const result = mergeHistory([
      { browser: 'chrome', entries: chrome },
      { browser: 'edge', entries: edge },
    ]);
    const shared = result.entries.find((entry) => entry.url === 'https://shared.example.com');
    expect(shared?.lastVisitTime).toBe(5000);
    expect(shared?.visitCount).toBe(7);
    expect(shared?.typedCount).toBe(3);
    expect(shared?.title).toBe('Shared newer');
  });

  it('sorts entries by most recent visit first', () => {
    const result = mergeHistory([
      { browser: 'chrome', entries: chrome },
      { browser: 'edge', entries: edge },
    ]);
    expect(result.entries.map((entry) => entry.lastVisitTime)).toEqual([5000, 3000, 2000]);
  });

  it('keeps the existing title when the newer entry has none', () => {
    const result = mergeHistory([
      {
        browser: 'chrome',
        entries: [
          {
            url: 'https://a.example.com',
            title: 'Title',
            visitCount: 1,
            typedCount: 0,
            lastVisitTime: 10,
          },
        ],
      },
      {
        browser: 'edge',
        entries: [
          {
            url: 'https://a.example.com',
            title: '',
            visitCount: 1,
            typedCount: 0,
            lastVisitTime: 20,
          },
        ],
      },
    ]);
    expect(result.entries[0].title).toBe('Title');
  });

  it('returns an empty result for no inputs', () => {
    const result = mergeHistory([]);
    expect(result.entries).toEqual([]);
    expect(result.stats).toEqual({ total: 0, duplicates: 0 });
  });
});
