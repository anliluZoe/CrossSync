import { describe, it, expect } from 'vitest';
import { HISTORY_QUERY, type HistoryEntry } from '../src/history';

describe('history types', () => {
  const entry: HistoryEntry = {
    id: 7,
    url: 'https://example.com',
    title: 'Example',
    visitCount: 3,
    typedCount: 1,
    lastVisitTime: 1700000000000,
  };

  it('HistoryEntry exposes normalised fields', () => {
    expect(entry.url).toBe('https://example.com');
    expect(entry.visitCount).toBe(3);
    expect(entry.typedCount).toBe(1);
    expect(entry.lastVisitTime).toBe(1700000000000);
  });

  it('HistoryEntry id is optional', () => {
    const withoutId: HistoryEntry = {
      url: 'https://example.com',
      title: '',
      visitCount: 0,
      typedCount: 0,
      lastVisitTime: 0,
    };
    expect(withoutId.id).toBeUndefined();
  });

  it('HISTORY_QUERY selects the columns CrossSync needs', () => {
    expect(HISTORY_QUERY).toContain('FROM urls');
    expect(HISTORY_QUERY).toContain('visit_count');
    expect(HISTORY_QUERY).toContain('last_visit_time');
    expect(HISTORY_QUERY).toContain('ORDER BY last_visit_time DESC');
  });
});
