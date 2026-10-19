import { DEFAULT_CRON_SCHEDULE } from '@crosssync/shared';

import type { CliContext } from '../context';
import { saveConfigFile } from '../context';
import { createCronManager, type CronRunner } from '../cron';

export interface CronCommandOptions {
  /** Cron expression, e.g. `0 9 * * *`. */
  expression?: string;
  /** Print the plan instead of changing anything. */
  dryRun?: boolean;
  label?: string;
  executable?: string;
  platform?: NodeJS.Platform;
  homeDir?: string;
  /** Injectable for tests. */
  runner?: CronRunner;
}

export function runInstallCronCommand(
  context: CliContext,
  options: CronCommandOptions = {},
): number {
  const expression =
    options.expression ?? context.config.schedule.expression ?? DEFAULT_CRON_SCHEDULE;

  let manager;
  try {
    manager = createCronManager({
      label: options.label,
      executable: options.executable,
      expression,
      platform: options.platform,
      homeDir: options.homeDir,
      runner: options.runner,
    });
  } catch (error) {
    context.io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (options.dryRun) {
    context.io.out(`Dry run: no changes made (platform: ${manager.platform}).`);
    context.io.out(manager.describe('install'));
    return 0;
  }

  let result;
  try {
    result = manager.install();
  } catch (error) {
    context.io.err(
      `Failed to install the schedule: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  for (const message of result.messages) {
    if (result.changed) {
      context.io.out(message);
    } else {
      context.io.err(message);
    }
  }

  if (!result.changed) {
    return 1;
  }

  const next = { ...context.config, schedule: { installed: true, expression } };
  saveConfigFile(context.dirs.configFile, next);
  context.config = next;
  return 0;
}

export function runUninstallCronCommand(
  context: CliContext,
  options: CronCommandOptions = {},
): number {
  const expression = context.config.schedule.expression ?? DEFAULT_CRON_SCHEDULE;

  let manager;
  try {
    manager = createCronManager({
      label: options.label,
      executable: options.executable,
      expression,
      platform: options.platform,
      homeDir: options.homeDir,
      runner: options.runner,
    });
  } catch (error) {
    context.io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (options.dryRun) {
    context.io.out(`Dry run: no changes made (platform: ${manager.platform}).`);
    context.io.out(manager.describe('uninstall'));
    return 0;
  }

  const result = manager.uninstall();
  for (const message of result.messages) {
    if (result.changed) {
      context.io.out(message);
    } else {
      context.io.err(message);
    }
  }

  const next = { ...context.config, schedule: { installed: false, expression } };
  saveConfigFile(context.dirs.configFile, next);
  context.config = next;

  return 0;
}
