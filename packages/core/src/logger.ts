import fs from 'fs';
import path from 'path';

import type { LogLevel } from '@crosssync/shared';
import { ensureDir, LOG_LEVELS } from '@crosssync/shared';

import { DEFAULT_LOG_LIMIT, MAX_BUFFERED_LOG_ENTRIES } from './constants';

export type { LogLevel };

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  /** Append JSON-lines entries to this file, consumed by `crosssync logs`. */
  filePath?: string;
  /** Mirror entries to the console. Defaults to true. */
  console?: boolean;
}

/**
 * Console + JSON-lines file logger.
 *
 * Logging must never break a sync run, so file write failures are swallowed.
 */
export class Logger {
  private minLevel: LogLevel;
  private readonly options: Required<LoggerOptions>;
  private readonly buffer: LogEntry[] = [];

  constructor(minLevel: LogLevel = 'info', options: LoggerOptions = {}) {
    this.minLevel = LOG_LEVELS.includes(minLevel) ? minLevel : 'info';
    this.options = {
      filePath: options.filePath ?? '',
      console: options.console ?? true,
    };
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLevel(): LogLevel {
    return this.minLevel;
  }

  setFile(filePath: string): void {
    this.options.filePath = filePath;
  }

  getFile(): string {
    return this.options.filePath;
  }

  isEnabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  /** Snapshot of the in-memory ring buffer. */
  getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer.length = 0;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.isEnabled(level)) {
      return;
    }
    const entry: LogEntry = { level, message, timestamp: Date.now(), meta };
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFERED_LOG_ENTRIES) {
      this.buffer.shift();
    }
    if (this.options.console) {
      writeConsole(entry);
    }
    this.appendToFile(entry);
  }

  private appendToFile(entry: LogEntry): void {
    if (!this.options.filePath) {
      return;
    }
    try {
      ensureDir(path.dirname(this.options.filePath));
      fs.appendFileSync(this.options.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      /* logging must never break a run */
    }
  }
}

function writeConsole(entry: LogEntry): void {
  const prefix = `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}]`;
  if (entry.level === 'error') {
    console.error(prefix, entry.message, entry.meta ?? '');
  } else if (entry.level === 'warn') {
    console.warn(prefix, entry.message, entry.meta ?? '');
  } else {
    console.log(prefix, entry.message, entry.meta ?? '');
  }
}

export interface ReadLogEntriesOptions {
  limit?: number;
  level?: LogLevel;
}

/** Reads the most recent JSON-lines entries from a log file. */
export function readLogEntries(filePath: string, options: ReadLogEntriesOptions = {}): LogEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const limit = options.limit ?? DEFAULT_LOG_LIMIT;
  const entries: LogEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = parseLogEntry(trimmed);
    if (!parsed) {
      continue;
    }
    if (options.level && LEVEL_ORDER[parsed.level] < LEVEL_ORDER[options.level]) {
      continue;
    }
    entries.push(parsed);
  }

  return limit > 0 ? entries.slice(-limit) : entries;
}

/** Removes the log file; used by `crosssync logs --clear`. */
export function clearLogFile(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* ignore */
  }
}

function parseLogEntry(line: string): LogEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.level !== 'string' ||
    !LOG_LEVELS.includes(record.level as LogLevel) ||
    typeof record.message !== 'string' ||
    typeof record.timestamp !== 'number'
  ) {
    return null;
  }
  const meta =
    typeof record.meta === 'object' && record.meta !== null
      ? (record.meta as Record<string, unknown>)
      : undefined;
  return {
    level: record.level as LogLevel,
    message: record.message,
    timestamp: record.timestamp,
    meta,
  };
}
