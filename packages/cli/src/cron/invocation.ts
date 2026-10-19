import { CLI_NAME, DEFAULT_SCHEDULE_ARGS } from '../constants';
import type { CronInvocation, CronManagerOptions } from './types';

/** Quotes a value for `schtasks /TR`, which re-parses the string itself. */
export function quoteWindowsArgument(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Quotes a value for POSIX shells (crontab / systemd ExecStart). */
export function quotePosixArgument(value: string): string {
  if (value === '') {
    return "''";
  }
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Works out what the schedule should execute.
 *
 * When CrossSync runs from source (`node dist/index.js`) the schedule has to go
 * through Node; when it runs from the installed `crosssync` bin the bin is used.
 */
export function resolveInvocation(options: CronManagerOptions = {}): CronInvocation {
  const args = options.args ?? [...DEFAULT_SCHEDULE_ARGS];
  let program: string;
  let fullArgs: string[];

  if (options.executable) {
    program = options.executable;
    fullArgs = args;
  } else {
    const script = process.argv[1];
    if (script && /\.[cm]?js$/.test(script)) {
      program = process.execPath;
      fullArgs = [script, ...args];
    } else {
      program = CLI_NAME;
      fullArgs = args;
    }
  }

  return {
    program,
    args: fullArgs,
    windowsCommandLine: [program, ...fullArgs].map(quoteWindowsArgument).join(' '),
    posixCommandLine: [program, ...fullArgs].map(quotePosixArgument).join(' '),
  };
}
