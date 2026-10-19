import { execFileSync } from 'child_process';

import type { CronActionResult, CronProcessResult, CronRunner } from './types';

/** Runs a command, capturing output instead of throwing. */
export const defaultCronRunner: CronRunner = (command, args) => {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: String(stdout ?? ''), stderr: '' };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: unknown; stderr?: unknown };
    return {
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: toText(failure.stdout),
      stderr: toText(failure.stderr),
    };
  }
};

function toText(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return typeof value === 'string' ? value : '';
}

/** Turns a process result into a `CronActionResult`. */
export function toActionResult(
  result: CronProcessResult,
  successMessage: string,
  failurePrefix: string,
): CronActionResult {
  if (result.status === 0) {
    return { changed: true, messages: [successMessage] };
  }
  const detail = (result.stderr || result.stdout).trim();
  return {
    changed: false,
    messages: [`${failurePrefix} (exit ${result.status})${detail ? `: ${detail}` : ''}`],
  };
}
