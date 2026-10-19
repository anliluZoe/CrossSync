import path from 'path';

import type { LogEntry } from '@crosssync/core';
import { clearLogFile, readLogEntries } from '@crosssync/core';
import type { LogLevel } from '@crosssync/shared';
import { isLogLevel, LOG_FILE_NAME } from '@crosssync/shared';

import type { CliContext } from '../context';

export interface LogsCommandOptions {
  /** Maximum number of entries to print (most recent last). */
  limit?: number;
  level?: string;
  clear?: boolean;
  json?: boolean;
}

export function currentLogFile(context: CliContext): string {
  return path.join(context.config.logDir, LOG_FILE_NAME);
}

export function runLogsCommand(context: CliContext, options: LogsCommandOptions = {}): number {
  const file = currentLogFile(context);

  if (options.clear) {
    clearLogFile(file);
    context.io.out(`Cleared ${file}`);
    return 0;
  }

  if (options.level !== undefined && !isLogLevel(options.level)) {
    context.io.err(`Unknown log level "${options.level}".`);
    return 1;
  }

  const entries = readLogEntries(file, {
    limit: options.limit,
    level: options.level as LogLevel | undefined,
  });

  if (entries.length === 0) {
    context.io.out(`No log entries in ${file}.`);
    return 0;
  }

  if (options.json) {
    context.io.out(JSON.stringify(entries, null, 2));
    return 0;
  }

  for (const entry of entries) {
    context.io.out(formatLogEntry(entry));
  }
  return 0;
}

export function formatLogEntry(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString();
  const meta =
    entry.meta && Object.keys(entry.meta).length > 0 ? ` ${JSON.stringify(entry.meta)}` : '';
  return `${timestamp} [${entry.level.toUpperCase()}] ${entry.message}${meta}`;
}
