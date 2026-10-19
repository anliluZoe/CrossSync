import { describe, it, expect } from 'vitest';
import {
  countBookmarks,
  flattenBookmarks,
  isBookmarkFolder,
  isBookmarkUrl,
  walkBookmarkTree,
  type BookmarkFile,
  type BookmarkNode,
} from '../src/bookmark';

const sampleFile: BookmarkFile = {
  checksum: 'a1b2c3',
  version: 1,
  roots: {
    bookmark_bar: {
      id: '1',
      name: 'Bookmarks bar',
      type: 'folder',
      children: [
        {
          id: '2',
          name: 'Example',
          type: 'url',
          url: 'https://example.com',
          date_added: '13390000000000000',
        },
        {
          id: '3',
          name: 'Dev',
          type: 'folder',
          children: [{ id: '4', name: 'Docs', type: 'url', url: 'https://docs.example.com' }],
        },
      ],
    },
    other: { id: '5', name: 'Other bookmarks', type: 'folder', children: [] },
    synced: { id: '6', name: 'Mobile bookmarks', type: 'folder', children: [] },
  },
};

describe('bookmark types', () => {
  it('models a Chromium bookmark tree', () => {
    expect(sampleFile.roots.bookmark_bar.children).toHaveLength(2);
    expect(sampleFile.roots.bookmark_bar.children?.[0].url).toBe('https://example.com');
  });

  it('isBookmarkFolder / isBookmarkUrl discriminate by type', () => {
    const folder = sampleFile.roots.bookmark_bar;
    const url = sampleFile.roots.bookmark_bar.children![0];
    expect(isBookmarkFolder(folder)).toBe(true);
    expect(isBookmarkUrl(folder)).toBe(false);
    expect(isBookmarkUrl(url)).toBe(true);
    expect(isBookmarkFolder(url)).toBe(false);
  });
});

describe('walkBookmarkTree', () => {
  it('visits every node depth-first', () => {
    const ids: string[] = [];
    walkBookmarkTree(sampleFile.roots.bookmark_bar, (node) => ids.push(node.id));
    expect(ids).toEqual(['1', '2', '3', '4']);
  });

  it('handles folders without children', () => {
    const ids: string[] = [];
    walkBookmarkTree(sampleFile.roots.other, (node) => ids.push(node.id));
    expect(ids).toEqual(['5']);
  });
});

describe('flattenBookmarks', () => {
  it('keeps the folder path of every node', () => {
    const flat = flattenBookmarks(sampleFile.roots.bookmark_bar);
    expect(flat.map((entry) => entry.node.id)).toEqual(['1', '2', '3', '4']);
    expect(flat[0].folderPath).toEqual([]);
    expect(flat[1].folderPath).toEqual(['Bookmarks bar']);
    expect(flat[3].folderPath).toEqual(['Bookmarks bar', 'Dev']);
  });

  it('does not extend the path for url nodes', () => {
    const url = sampleFile.roots.bookmark_bar.children![0] as BookmarkNode;
    const flat = flattenBookmarks(url, ['Bookmarks bar']);
    expect(flat).toHaveLength(1);
    expect(flat[0].folderPath).toEqual(['Bookmarks bar']);
  });
});

describe('countBookmarks', () => {
  it('counts all nodes across the tree', () => {
    expect(countBookmarks(sampleFile.roots.bookmark_bar)).toBe(4);
  });

  it('counts only folders when a type is given', () => {
    expect(countBookmarks(sampleFile.roots.bookmark_bar, 'folder')).toBe(2);
  });

  it('counts only urls when a type is given', () => {
    expect(countBookmarks(sampleFile.roots.bookmark_bar, 'url')).toBe(2);
  });
});
