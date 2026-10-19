import fs from 'fs';
import path from 'path';

/**
 * Files written by CrossSync:
 *   bookmarks-merged-<yyyyMMdd-HHmmss>.json
 *   history-merged-<yyyyMMdd-HHmmss>.json
 *   crosssync-export-<yyyyMMdd-HHmmss>.json
 */
const EXPORT_FILE_PATTERN =
  /^(?:bookmarks-merged|history-merged|crosssync-export)-(\d{8}-\d{6})\.json$/;

export interface ExportFileInfo {
  /** Absolute path of the export file. */
  file: string;
  /** Sortable `yyyyMMdd-HHmmss` stamp taken from the file name. */
  timestamp: string;
}

/** Lists CrossSync export files, newest first. Unrelated JSON files are ignored. */
export function collectExportFiles(exportDir: string): ExportFileInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(exportDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: ExportFileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = EXPORT_FILE_PATTERN.exec(entry.name);
    if (!match) {
      continue;
    }
    files.push({ file: path.join(exportDir, entry.name), timestamp: match[1] });
  }

  return files.sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp) || b.file.localeCompare(a.file),
  );
}

/**
 * Keeps the `keep` most recent CrossSync export files and deletes the rest.
 * A `keep` of `0` disables cleanup; failures are ignored so they never abort a sync.
 */
export function pruneExports(exportDir: string, keep: number): string[] {
  if (!Number.isFinite(keep) || keep <= 0) {
    return [];
  }

  const removed: string[] = [];
  for (const entry of collectExportFiles(exportDir).slice(Math.floor(keep))) {
    try {
      fs.rmSync(entry.file, { force: true });
      removed.push(entry.file);
    } catch {
      // Best effort: a locked/unreadable file must not fail the whole sync.
    }
  }
  return removed;
}
