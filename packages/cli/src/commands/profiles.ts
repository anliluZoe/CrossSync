import type { BrowserName } from '@crosssync/shared';
import {
  addProfilesToSelection,
  BROWSERS,
  DEFAULT_PROFILE,
  isBrowserName,
  parseProfileList,
  PROFILE_NAME_PATTERN,
} from '@crosssync/shared';
import { createBrowserReader, createConfiguredBrowserReaders } from '@crosssync/core';

import type { CliContext } from '../context';
import { saveConfigFile } from '../context';
import { formatProfileAccount } from '../profile-info';

export interface ProfilesCommandOptions {
  list?: boolean;
  set?: string;
  add?: string;
  remove?: string;
  all?: boolean;
  reset?: boolean;
  browser?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Print the report as JSON. */
  json?: boolean;
}

/** Parses a comma-separated list of profile names, or the `all` sentinel. */
export function parseProfileNames(value: string): string[] | 'all' {
  if (value.trim().toLowerCase() === 'all') {
    return 'all';
  }
  const names = parseProfileList(value);
  if (names.length === 0) {
    throw new Error('Profile list is empty.');
  }
  for (const name of names) {
    if (!PROFILE_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid profile name "${name}". Use "Default" or "Profile N".`);
    }
  }
  return names;
}

export interface ProfileAccountInfo {
  profile: string;
  name?: string;
  userName?: string;
  gaiaName?: string;
  isUsingDefaultName?: boolean;
}

export interface AvailableProfile {
  profile: string;
  selected: boolean;
  account: ProfileAccountInfo | null;
}

export interface ProfilesBrowserReport {
  browser: BrowserName;
  dataDir: string;
  enabled: boolean;
  available: AvailableProfile[];
  missingConfigured: string[];
}

export interface ProfilesListReport {
  selected: string | null;
  browsers: ProfilesBrowserReport[];
}

export interface ProfileMutationReport {
  changed: boolean;
  profile: string;
}

/** Lists available profiles for each browser, marking the current selection. */
function listProfiles(context: CliContext, options: ProfilesCommandOptions): number {
  const filter = options.browser ?? 'all';
  if (filter !== 'all' && !isBrowserName(filter)) {
    context.io.err(`Unknown browser "${filter}". Use one of: ${BROWSERS.join(', ')}, all.`);
    return 1;
  }

  const report = buildProfilesListReport(context, options);
  if (options.json) {
    context.io.out(JSON.stringify(report, null, 2));
    return 0;
  }

  for (const browser of report.browsers) {
    context.io.out(`${browser.browser}: ${browser.dataDir}${browser.enabled ? '' : ' [disabled]'}`);
    if (browser.available.length === 0) {
      context.io.out('  (no profiles found)');
      continue;
    }
    for (const entry of browser.available) {
      const account = formatProfileAccount(entry.account ?? undefined);
      context.io.out(
        `  ${entry.profile}${account ? `  ${account}` : ''}${entry.selected ? '  [selected]' : ''}`,
      );
    }
    if (browser.missingConfigured.length > 0) {
      context.io.out(`  (configured but not found: ${browser.missingConfigured.join(', ')})`);
    }
  }

  context.io.out(`Selected profile(s): ${report.selected ?? 'all'}`);
  return 0;
}

export function buildProfilesListReport(
  context: CliContext,
  options: ProfilesCommandOptions,
): ProfilesListReport {
  const filter = options.browser ?? 'all';
  const selection = context.config.profile;
  const selected = selection.trim() === 'all' ? null : parseProfileList(selection);
  const browsers: ProfilesBrowserReport[] = [];

  for (const browser of BROWSERS) {
    if (filter !== 'all' && browser !== filter) {
      continue;
    }
    const browserConfig = context.config.browsers[browser];
    const reader = createBrowserReader(browser, {
      dataDir: browserConfig.dataDir,
      platform: options.platform,
      env: options.env,
    });
    const availableProfiles = reader.profiles();
    const infos = new Map(reader.profileInfos().map((info) => [info.profile, info]));
    const available: AvailableProfile[] = availableProfiles.map((name) => ({
      profile: name,
      selected: selected === null || selected.includes(name),
      account: infos.get(name) ?? null,
    }));

    browsers.push({
      browser,
      dataDir: reader.dataDir,
      enabled: browserConfig.enabled,
      available,
      missingConfigured: selected?.filter((name) => !availableProfiles.includes(name)) ?? [],
    });
  }

  return { selected: selection.trim() === 'all' ? null : selection, browsers };
}

/** Expands `all` into the profiles that currently exist, for `--remove`. */
function expandAllProfiles(context: CliContext, options: ProfilesCommandOptions): string[] {
  const names: string[] = [];
  const readers = createConfiguredBrowserReaders(context.config, {
    platform: options.platform,
    env: options.env,
  });
  for (const reader of readers) {
    for (const name of reader.profiles()) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

function removeProfiles(
  context: CliContext,
  current: string,
  names: string[] | 'all',
  options: ProfilesCommandOptions,
): string {
  if (names === 'all') {
    throw new Error('Refusing to remove every profile; use --reset or --set instead.');
  }
  const base = current.trim() === 'all' ? expandAllProfiles(context, options).join(',') : current;
  const remaining = parseProfileList(base).filter((name) => !names.includes(name));
  if (remaining.length === parseProfileList(base).length) {
    throw new Error(`None of the selected profiles matched: ${names.join(', ')}.`);
  }
  if (remaining.length === 0) {
    throw new Error('Refusing to remove every profile; use --reset or --set instead.');
  }
  return remaining.join(',');
}

export function runProfilesCommand(
  context: CliContext,
  options: ProfilesCommandOptions = {},
): number {
  const mutating =
    options.set !== undefined ||
    options.add !== undefined ||
    options.remove !== undefined ||
    options.all === true ||
    options.reset === true;

  if (!mutating) {
    return listProfiles(context, options);
  }

  if (options.browser !== undefined && options.browser !== 'all') {
    context.io.err('--browser only applies when listing; profile changes are global.');
    return 1;
  }

  try {
    let next = context.config.profile;
    if (options.reset) {
      next = DEFAULT_PROFILE;
    } else if (options.all) {
      next = 'all';
    } else if (options.set !== undefined) {
      const names = parseProfileNames(options.set);
      next = names === 'all' ? 'all' : names.join(',');
    } else if (options.add !== undefined) {
      const names = parseProfileNames(options.add);
      next = names === 'all' ? 'all' : addProfilesToSelection(next, names);
    } else if (options.remove !== undefined) {
      next = removeProfiles(context, next, parseProfileNames(options.remove), options);
    }

    const nextConfig = { ...context.config, profile: next };
    saveConfigFile(context.dirs.configFile, nextConfig);
    context.config = nextConfig;

    const report: ProfileMutationReport = { changed: true, profile: next };
    if (options.json) {
      context.io.out(JSON.stringify(report, null, 2));
    } else {
      context.io.out(`profile = ${JSON.stringify(next)}`);
    }
    return 0;
  } catch (error) {
    context.io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
