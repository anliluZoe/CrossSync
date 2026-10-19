import { DEFAULT_CRON_SCHEDULE } from '@crosssync/shared';

import { createLinuxCronManager } from './linux';
import { createMacosCronManager } from './macos';
import type { CronManager, CronManagerOptions } from './types';
import { createWindowsCronManager } from './windows';

export * from './types';
export * from './schedule';

export { quotePosixArgument, quoteWindowsArgument, resolveInvocation } from './invocation';

export { defaultCronRunner, toActionResult } from './runner';

export { buildScheduleArgs, createWindowsCronManager } from './windows';
export { escapeXml, launchAgentPath, renderLaunchAgent, createMacosCronManager } from './macos';
export {
  applyCrontabLine,
  buildCrontabLine,
  createLinuxCronManager,
  renderSystemdService,
  renderSystemdTimer,
  shouldUseSystemd,
  systemdUnitPath,
} from './linux';

/** Picks the scheduler implementation for the current platform. */
export function createCronManager(options: CronManagerOptions = {}): CronManager {
  const platform = options.platform ?? process.platform;
  const resolved: CronManagerOptions = {
    expression: options.expression ?? DEFAULT_CRON_SCHEDULE,
    ...options,
    platform,
  };

  if (platform === 'win32') {
    return createWindowsCronManager(resolved);
  }
  if (platform === 'darwin') {
    return createMacosCronManager(resolved);
  }
  return createLinuxCronManager(resolved);
}
