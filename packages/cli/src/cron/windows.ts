import { DEFAULT_CRON_SCHEDULE } from '@crosssync/shared';

import { WINDOWS_TASK_NAME } from '../constants';
import { resolveInvocation } from './invocation';
import { defaultCronRunner, toActionResult } from './runner';
import {
  formatTime,
  isDaily,
  isWeekly,
  parseCronExpression,
  toFixedTime,
  toWeekday,
  windowsWeekdayName,
} from './schedule';
import type { CronManager, CronManagerOptions } from './types';

const UNSUPPORTED_MESSAGE =
  'Windows Task Scheduler supports daily or weekly CrossSync schedules only. ' +
  'Use an expression such as "0 9 * * *" or "0 9 * * 1".';

/**
 * Installs the schedule through Task Scheduler (`schtasks`).
 *
 * `schtasks` cannot express arbitrary cron expressions, so only daily and
 * weekly schedules at a fixed time are accepted.
 */
export function createWindowsCronManager(options: CronManagerOptions = {}): CronManager {
  const label = options.label ?? WINDOWS_TASK_NAME;
  const expression = options.expression ?? DEFAULT_CRON_SCHEDULE;
  const invocation = resolveInvocation(options);
  const runner = options.runner ?? defaultCronRunner;

  const scheduleArgs = buildScheduleArgs(expression);

  return {
    platform: 'win32',
    label,

    describe(action) {
      if (action === 'install') {
        return [
          `Register scheduled task "${label}" (${expression}):`,
          `  schtasks ${['/Create', '/F', '/TN', label, ...scheduleArgs, '/TR', invocation.windowsCommandLine].join(' ')}`,
        ].join('\n');
      }
      return [
        `Remove scheduled task "${label}":`,
        `  schtasks ${['/Delete', '/F', '/TN', label].join(' ')}`,
      ].join('\n');
    },

    install() {
      const result = runner('schtasks', [
        '/Create',
        '/F',
        '/TN',
        label,
        ...scheduleArgs,
        '/TR',
        invocation.windowsCommandLine,
      ]);
      return toActionResult(result, `Scheduled task "${label}" installed.`, 'schtasks failed');
    },

    uninstall() {
      const result = runner('schtasks', ['/Delete', '/F', '/TN', label]);
      if (result.status !== 0) {
        // `schtasks` exits non-zero (with a localized message) when the task is
        // absent, so treat any failure as "nothing to remove" to stay idempotent.
        return {
          changed: false,
          messages: [`No scheduled task named "${label}" was removed.`],
        };
      }
      return { changed: true, messages: [`Scheduled task "${label}" removed.`] };
    },
  };
}

/** Builds the `/SC ...` arguments for a cron expression. */
export function buildScheduleArgs(expression: string): string[] {
  const spec = parseCronExpression(expression);
  const { hour, minute } = toFixedTime(spec);
  const time = formatTime(hour, minute);

  if (isDaily(spec)) {
    return ['/SC', 'DAILY', '/ST', time];
  }
  if (isWeekly(spec)) {
    const weekday = toWeekday(spec);
    return ['/SC', 'WEEKLY', '/D', windowsWeekdayName(weekday ?? 0), '/ST', time];
  }
  throw new Error(UNSUPPORTED_MESSAGE);
}
