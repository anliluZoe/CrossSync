import type { CliConfig } from '@crosssync/shared';
import { createDefaultConfig, isCliConfig } from '@crosssync/shared';

import type { CliContext } from '../context';
import { saveConfigFile } from '../context';

export interface ConfigCommandOptions {
  /** Print the config file path only. */
  path?: boolean;
  /** Read a dotted key, e.g. `sync.strategy`. */
  get?: string;
  /** Write a dotted key, e.g. `sync.strategy=export`. */
  set?: string;
  /** Recreate the default config. */
  reset?: boolean;
}

/** Reads a dotted key out of a `CliConfig`. */
export function getConfigValue(config: CliConfig, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, config);
}

/** Converts a CLI string into a boolean/number/null when it looks like one. */
export function coerceConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return raw;
}

/** Returns a new config with `dottedPath` set, refusing invalid results. */
export function setConfigValue(config: CliConfig, dottedPath: string, value: unknown): CliConfig {
  const keys = dottedPath.split('.');
  if (keys.some((key) => key.length === 0)) {
    throw new Error(`Invalid config key "${dottedPath}".`);
  }

  const next = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  let cursor: Record<string, unknown> = next;

  for (const key of keys.slice(0, -1)) {
    const existing = cursor[key];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;

  if (!isCliConfig(next)) {
    throw new Error(`Refusing to write an invalid config after setting "${dottedPath}".`);
  }
  return next;
}

export function runConfigCommand(context: CliContext, options: ConfigCommandOptions = {}): number {
  if (options.path) {
    context.io.out(context.dirs.configFile);
    return 0;
  }

  if (options.reset) {
    const config = createDefaultConfig({
      dataDir: context.dirs.root,
      backupDir: context.dirs.backups,
      exportDir: context.dirs.exports,
      logDir: context.dirs.logs,
    });
    saveConfigFile(context.dirs.configFile, config);
    context.config = config;
    context.io.out(`Config reset: ${context.dirs.configFile}`);
    return 0;
  }

  if (options.get) {
    const value = getConfigValue(context.config, options.get);
    if (value === undefined) {
      context.io.err(`Unknown config key "${options.get}".`);
      return 1;
    }
    context.io.out(typeof value === 'string' ? value : JSON.stringify(value));
    return 0;
  }

  if (options.set) {
    const separator = options.set.indexOf('=');
    if (separator <= 0) {
      context.io.err('Use --set key=value, e.g. --set sync.strategy=export.');
      return 1;
    }
    const key = options.set.slice(0, separator);
    const rawValue = options.set.slice(separator + 1);

    try {
      const next = setConfigValue(context.config, key, coerceConfigValue(rawValue));
      saveConfigFile(context.dirs.configFile, next);
      context.config = next;
      context.io.out(`${key} = ${JSON.stringify(getConfigValue(next, key))}`);
      return 0;
    } catch (error) {
      context.io.err(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  context.io.out(`# ${context.dirs.configFile}`);
  context.io.out(JSON.stringify(context.config, null, 2));
  return 0;
}
