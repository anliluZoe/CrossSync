import { execFileSync } from 'child_process';

import type { BrowserName } from '@crosssync/shared';
import { BROWSERS } from '@crosssync/shared';

import { BROWSER_PROCESS_NAMES } from './constants';

export interface BrowserStatus {
  browser: BrowserName;
  running: boolean;
  processName: string;
}

export interface ProcessResult {
  status: number;
  stdout: string;
}

/** Injectable process runner, so detection is unit-testable. */
export type ProcessRunner = (command: string, args: string[]) => ProcessResult;

export interface BrowserStatusOptions {
  platform?: NodeJS.Platform;
  runner?: ProcessRunner;
}

/** Executable / application name used to detect the given browser. */
export function getProcessName(
  browser: BrowserName,
  platform: NodeJS.Platform = process.platform,
): string {
  const names = BROWSER_PROCESS_NAMES[browser];
  if (platform === 'win32') {
    return names.win32;
  }
  return platform === 'darwin' ? names.darwin : names.linux;
}

/** Builds the OS command that lists processes for the given browser. */
export function buildProcessQuery(
  browser: BrowserName,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const processName = getProcessName(browser, platform);
  if (platform === 'win32') {
    return {
      command: 'tasklist',
      args: ['/FI', `IMAGENAME eq ${processName}`, '/NH', '/FO', 'CSV'],
    };
  }
  return { command: 'pgrep', args: ['-ix', processName] };
}

/** Interprets the output of `tasklist` / `pgrep`. */
export function parseProcessOutput(
  browser: BrowserName,
  platform: NodeJS.Platform,
  result: ProcessResult,
): boolean {
  const output = result.stdout ?? '';
  if (platform === 'win32') {
    if (/no tasks are running/i.test(output)) {
      return false;
    }
    return output.toLowerCase().includes(getProcessName(browser, platform).toLowerCase());
  }
  if (result.status !== 0) {
    return false;
  }
  return output.trim().length > 0 && output.split(/\r?\n/).some((line) => line.trim().length > 0);
}

export function isBrowserRunning(
  browser: BrowserName,
  options: BrowserStatusOptions = {},
): boolean {
  const platform = options.platform ?? process.platform;
  return parseProcessOutput(browser, platform, runQuery(browser, platform, options.runner));
}

/** Reports the running state of every supported browser. */
export function getRunningBrowsers(options: BrowserStatusOptions = {}): BrowserStatus[] {
  const platform = options.platform ?? process.platform;
  return BROWSERS.map((browser) => ({
    browser,
    running: parseProcessOutput(browser, platform, runQuery(browser, platform, options.runner)),
    processName: getProcessName(browser, platform),
  }));
}

/** Lists the browsers currently running. */
export function getRunningBrowserNames(options: BrowserStatusOptions = {}): BrowserName[] {
  return getRunningBrowsers(options)
    .filter((status) => status.running)
    .map((status) => status.browser);
}

function runQuery(
  browser: BrowserName,
  platform: NodeJS.Platform,
  runner?: ProcessRunner,
): ProcessResult {
  const { command, args } = buildProcessQuery(browser, platform);
  const execute = runner ?? defaultProcessRunner;
  try {
    return execute(command, args);
  } catch {
    return { status: 1, stdout: '' };
  }
}

const defaultProcessRunner: ProcessRunner = (command, args) => {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { status: 0, stdout: typeof stdout === 'string' ? stdout : String(stdout ?? '') };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: unknown };
    const stdout = Buffer.isBuffer(failure.stdout)
      ? failure.stdout.toString('utf8')
      : typeof failure.stdout === 'string'
        ? failure.stdout
        : '';
    return { status: typeof failure.status === 'number' ? failure.status : 1, stdout };
  }
};
