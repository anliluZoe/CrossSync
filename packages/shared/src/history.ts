/**
 * Types mirroring the Chromium `History` SQLite database (`urls` table).
 *
 * Chromium stores `last_visit_time` as microseconds since the Windows epoch and
 * `visit_count` / `typed_count` as integers. CrossSync normalises the timestamp
 * to Unix milliseconds so downstream code never deals with the Chromium epoch.
 */

export interface HistoryEntry {
  /** Chromium `urls.id`; absent for entries built in memory. */
  id?: number;
  url: string;
  title: string;
  visitCount: number;
  typedCount: number;
  /** Unix epoch milliseconds. */
  lastVisitTime: number;
}

/** A `History` file together with the profile it was read from. */
export interface HistoryFile {
  browser: string;
  profile: string;
  entries: HistoryEntry[];
}

export const HISTORY_QUERY = [
  'SELECT id, url, title, visit_count, typed_count, last_visit_time',
  'FROM urls',
  "WHERE url IS NOT NULL AND url != ''",
  'ORDER BY last_visit_time DESC',
].join(' ');
