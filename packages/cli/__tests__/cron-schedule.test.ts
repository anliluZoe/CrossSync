import { describe, it, expect } from 'vitest';

import {
  formatTime,
  isDaily,
  isWeekly,
  parseCronExpression,
  toFixedTime,
  toSystemdCalendar,
  toWeekday,
  windowsWeekdayName,
} from '../src/cron/schedule';

describe('parseCronExpression', () => {
  it('parses a five field expression', () => {
    expect(parseCronExpression('0 9 * * *')).toEqual({
      minute: '0',
      hour: '9',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
    });
  });

  it('tolerates extra whitespace', () => {
    expect(parseCronExpression('  0   9  *  *  *  ').hour).toBe('9');
  });

  it('accepts ranges, lists and steps', () => {
    expect(() => parseCronExpression('*/15 0-23 * * 1,3,5')).not.toThrow();
    expect(() => parseCronExpression('0 9 1-15 1,6 *')).not.toThrow();
  });

  it('rejects a wrong field count', () => {
    expect(() => parseCronExpression('0 9 * *')).toThrow(/expected 5 fields/);
    expect(() => parseCronExpression('0 9 * * * *')).toThrow(/expected 5 fields/);
  });

  it('rejects out of range values', () => {
    expect(() => parseCronExpression('60 9 * * *')).toThrow(/minute/);
    expect(() => parseCronExpression('0 24 * * *')).toThrow(/hour/);
    expect(() => parseCronExpression('0 9 32 * *')).toThrow(/day of month/);
    expect(() => parseCronExpression('0 9 * 13 *')).toThrow(/month/);
    expect(() => parseCronExpression('0 9 * * 8')).toThrow(/day of week/);
  });

  it('rejects malformed fields', () => {
    expect(() => parseCronExpression('x 9 * * *')).toThrow(/bad minute/);
    expect(() => parseCronExpression('0 9 * * 5-1')).toThrow(/reversed/);
  });
});

describe('cron helpers', () => {
  it('toFixedTime requires numeric hour and minute', () => {
    expect(toFixedTime(parseCronExpression('30 7 * * *'))).toEqual({ hour: 7, minute: 30 });
    expect(() => toFixedTime(parseCronExpression('* 9 * * *'))).toThrow(/fixed times/);
  });

  it('formatTime zero-pads', () => {
    expect(formatTime(9, 0)).toBe('09:00');
    expect(formatTime(23, 59)).toBe('23:59');
  });

  it('classifies daily and weekly schedules', () => {
    expect(isDaily(parseCronExpression('0 9 * * *'))).toBe(true);
    expect(isWeekly(parseCronExpression('0 9 * * *'))).toBe(false);
    expect(isWeekly(parseCronExpression('0 9 * * 1'))).toBe(true);
    expect(isDaily(parseCronExpression('0 9 * * 1'))).toBe(false);
    expect(isDaily(parseCronExpression('0 9 1 * *'))).toBe(false);
  });

  it('toWeekday normalises Sunday', () => {
    expect(toWeekday(parseCronExpression('0 9 * * 1'))).toBe(1);
    expect(toWeekday(parseCronExpression('0 9 * * 0'))).toBe(0);
    expect(toWeekday(parseCronExpression('0 9 * * 7'))).toBe(0);
    expect(toWeekday(parseCronExpression('0 9 * * *'))).toBeNull();
    expect(() => toWeekday(parseCronExpression('0 9 * * 1-5'))).toThrow(/single numeric day/);
  });

  it('windowsWeekdayName maps to task scheduler names', () => {
    expect(windowsWeekdayName(0)).toBe('SUN');
    expect(windowsWeekdayName(1)).toBe('MON');
    expect(windowsWeekdayName(6)).toBe('SAT');
  });

  it('toSystemdCalendar renders a daily timer', () => {
    expect(toSystemdCalendar(parseCronExpression('0 9 * * *'))).toBe('*-*-* 09:00:00');
  });

  it('toSystemdCalendar renders a weekly timer', () => {
    expect(toSystemdCalendar(parseCronExpression('30 7 * * 1'))).toBe('Mon *-*-* 07:30:00');
  });

  it('toSystemdCalendar renders a monthly timer', () => {
    expect(toSystemdCalendar(parseCronExpression('0 9 15 * *'))).toBe('*-*-15 09:00:00');
    expect(toSystemdCalendar(parseCronExpression('0 9 15 6 *'))).toBe('*-06-15 09:00:00');
  });
});
