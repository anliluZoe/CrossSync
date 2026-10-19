import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { collectExportFiles, pruneExports } from '../src/export-files';
import { cleanupTempDirs, makeTempDir } from './helpers';

afterEach(() => {
  cleanupTempDirs();
});

function writeExport(dir: string, name: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, '{}');
  return file;
}

describe('export file cleanup', () => {
  it('lists only CrossSync exports, newest first', () => {
    const dir = makeTempDir('crosssync-exports');
    writeExport(dir, 'bookmarks-merged-20260116-090000.json');
    writeExport(dir, 'history-merged-20260117-090000.json');
    writeExport(dir, 'crosssync-export-20260115-090000.json');
    writeExport(dir, 'unrelated.json');
    writeExport(dir, 'bookmarks-merged-not-a-timestamp.json');

    expect(collectExportFiles(dir).map((entry) => path.basename(entry.file))).toEqual([
      'history-merged-20260117-090000.json',
      'bookmarks-merged-20260116-090000.json',
      'crosssync-export-20260115-090000.json',
    ]);
  });

  it('keeps the newest N exports and removes the rest', () => {
    const dir = makeTempDir('crosssync-exports');
    writeExport(dir, 'bookmarks-merged-20260114-090000.json');
    writeExport(dir, 'crosssync-export-20260115-090000.json');
    writeExport(dir, 'history-merged-20260116-090000.json');
    const unrelated = writeExport(dir, 'unrelated.json');

    const removed = pruneExports(dir, 2);

    expect(removed.map((file) => path.basename(file))).toEqual([
      'bookmarks-merged-20260114-090000.json',
    ]);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'crosssync-export-20260115-090000.json',
      'history-merged-20260116-090000.json',
      'unrelated.json',
    ]);
  });

  it('does nothing when keep is zero or negative', () => {
    const dir = makeTempDir('crosssync-exports');
    writeExport(dir, 'bookmarks-merged-20260114-090000.json');

    expect(pruneExports(dir, 0)).toEqual([]);
    expect(pruneExports(dir, -1)).toEqual([]);
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it('handles a missing directory', () => {
    expect(collectExportFiles(path.join(process.cwd(), 'definitely-missing-exports'))).toEqual([]);
    expect(pruneExports(path.join(process.cwd(), 'definitely-missing-exports'), 1)).toEqual([]);
  });
});
