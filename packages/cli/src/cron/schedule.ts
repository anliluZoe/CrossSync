export interface CronSpec {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const FIELD_PATTERN = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/;

const CRON_WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const WINDOWS_WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Parses a 5-field cron expression, rejecting anything out of range. */
export function parseCronExpression(expression: string): CronSpec {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}": expected 5 fields (minute hour day month weekday).`,
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  validateField(minute, 0, 59, 'minute', expression);
  validateField(hour, 0, 23, 'hour', expression);
  validateField(dayOfMonth, 1, 31, 'day of month', expression);
  validateField(month, 1, 12, 'month', expression);
  validateField(dayOfWeek, 0, 7, 'day of week', expression);

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function isWildcard(field: string): boolean {
  return field === '*';
}

/** The hour/minute pair, when both are plain numbers. */
export function toFixedTime(spec: CronSpec): { hour: number; minute: number } {
  if (!/^\d+$/.test(spec.hour) || !/^\d+$/.test(spec.minute)) {
    throw new Error(
      `Only fixed times are supported by this scheduler (got hour="${spec.hour}", minute="${spec.minute}"). ` +
        'Use a schedule such as "0 9 * * *".',
    );
  }
  return { hour: Number(spec.hour), minute: Number(spec.minute) };
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** A single numeric day of week (0 and 7 both mean Sunday). */
export function toWeekday(spec: CronSpec): number | null {
  if (isWildcard(spec.dayOfWeek)) {
    return null;
  }
  if (!/^\d+$/.test(spec.dayOfWeek)) {
    throw new Error(`Only a single numeric day of week is supported (got "${spec.dayOfWeek}").`);
  }
  return Number(spec.dayOfWeek) % 7;
}

export function cronWeekdayName(day: number): string {
  return CRON_WEEKDAY_NAMES[day % 7];
}

export function windowsWeekdayName(day: number): string {
  return WINDOWS_WEEKDAY_NAMES[day % 7];
}

/** Maps a cron spec onto a systemd `OnCalendar=` value. */
export function toSystemdCalendar(spec: CronSpec): string {
  const { hour, minute } = toFixedTime(spec);
  const time = `${formatTime(hour, minute)}:00`;
  const weekday = toWeekday(spec);

  if (weekday !== null) {
    return `${cronWeekdayName(weekday)} *-*-* ${time}`;
  }
  if (!isWildcard(spec.dayOfMonth) && /^\d+$/.test(spec.dayOfMonth)) {
    const month = isWildcard(spec.month) ? '*' : String(Number(spec.month)).padStart(2, '0');
    return `*-${month}-${String(Number(spec.dayOfMonth)).padStart(2, '0')} ${time}`;
  }
  return `*-*-* ${time}`;
}

/** True when the spec runs once a day at a fixed time. */
export function isDaily(spec: CronSpec): boolean {
  return isWildcard(spec.dayOfMonth) && isWildcard(spec.month) && isWildcard(spec.dayOfWeek);
}

/** True when the spec runs weekly on a single weekday at a fixed time. */
export function isWeekly(spec: CronSpec): boolean {
  return isWildcard(spec.dayOfMonth) && isWildcard(spec.month) && !isWildcard(spec.dayOfWeek);
}

function validateField(
  field: string,
  min: number,
  max: number,
  name: string,
  expression: string,
): void {
  for (const part of field.split(',')) {
    const match = FIELD_PATTERN.exec(part);
    if (!match) {
      throw new Error(`Invalid cron expression "${expression}": bad ${name} field "${part}".`);
    }
    const [, startRaw, endRaw, stepRaw] = match;
    const start = startRaw === '*' ? min : Number(startRaw);
    const end = endRaw ? Number(endRaw) : start;
    const step = stepRaw ? Number(stepRaw) : 1;

    if (start < min || start > max || end < min || end > max) {
      throw new Error(
        `Invalid cron expression "${expression}": ${name} "${part}" is outside ${min}-${max}.`,
      );
    }
    if (end < start) {
      throw new Error(
        `Invalid cron expression "${expression}": ${name} range "${part}" is reversed.`,
      );
    }
    if (step < 1) {
      throw new Error(`Invalid cron expression "${expression}": ${name} step must be >= 1.`);
    }
  }
}
