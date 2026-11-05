import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createMergeState,
  mergeStateFolders,
  readMergeState,
  writeMergeState,
} from '../src/merge-state';
import { bookmarkFile, cleanupTempDirs, folder, makeTempDir, url } from './helpers';

afterEach(() => {
  cleanupTempDirs();
});

function rootsWithFolder() {
  const work = folder('2', 'Work', [url('3', 'Page', 'https://page.example.com')]);
  work.guid = 'folder-work';
  return bookmarkFile(folder('1', 'Bookmarks bar', [work])).roots;
}

describe('merge state', () => {
  it('records folder titles by guid', () => {
    const state = createMergeState(rootsWithFolder());
    expect(state.folders).toEqual({ 'folder-work': 'Work' });
  });

  it('round-trips through disk', () => {
    const dir = makeTempDir('crosssync-state');
    const file = path.join(dir, 'merge-state.json');

    writeMergeState(file, rootsWithFolder());

    const state = readMergeState(file);
    expect(state?.folders['folder-work']).toBe('Work');
    expect(mergeStateFolders(state)?.get('folder-work')).toBe('Work');
  });

  it('ignores a missing, malformed or outdated state file', () => {
    const dir = makeTempDir('crosssync-state');
    const file = path.join(dir, 'merge-state.json');

    expect(readMergeState(file)).toBeNull();

    fs.writeFileSync(file, JSON.stringify({ version: 99, folders: {} }));
    expect(readMergeState(file)).toBeNull();

    fs.writeFileSync(file, JSON.stringify({ version: 1, folders: { a: 1 } }));
    expect(readMergeState(file)).toBeNull();

    fs.writeFileSync(file, 'not json');
    expect(readMergeState(file)).toBeNull();
  });

  it('returns no folder map without a state', () => {
    expect(mergeStateFolders(null)).toBeUndefined();
  });
});
