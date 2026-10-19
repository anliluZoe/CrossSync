import path from 'path';

import { LOG_FILE_NAME, pathExists } from '@crosssync/shared';
import { createBrowserReader, getRunningBrowsers, listBackups } from '@crosssync/core';

import { CLI_VERSION } from '../constants';
import type { CliContext } from '../context';
import { listExports } from './export';

export interface StatusCommandOptions {
  json?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface BrowserProfileStatus {
  profile: string;
  bookmarks: boolean;
  history: boolean;
}

export interface BrowserStatusReport {
  browser: string;
  dataDir: string;
  exists: boolean;
  running: boolean;
  profiles: BrowserProfileStatus[];
}

export interface StatusReport {
  version: string;
  configFile: string;
  dataDir: string;
  logLevel: string;
  logFile: string;
  profile: string;
  schedule: { installed: boolean; expression: string };
  browsers: BrowserStatusReport[];
  backups: { count: number; latest: string | null; dir: string };
  exports: { count: number; latest: string | null; dir: string };
}

/** Pure-ish collector used by both `status` and its tests. */
export function buildStatusReport(
  context: CliContext,
  options: StatusCommandOptions = {},
): StatusReport {
  const { config, dirs } = context;
  const running = new Map(
    getRunningBrowsers({ platform: options.platform }).map((status) => [
      status.browser,
      status.running,
    ]),
  );

  const browsers: BrowserStatusReport[] = [];
  for (const browser of Object.keys(config.browsers) as (keyof typeof config.browsers)[]) {
    const browserConfig = config.browsers[browser];
    const dataDir = browserConfig.dataDir ?? '';
    const profiles: BrowserProfileStatus[] = [];

    if (browserConfig.enabled) {
      const reader = createReader(browser, browserConfig.dataDir, options);
      for (const profile of reader.resolveProfiles(config.profile)) {
        profiles.push({
          profile,
          bookmarks: pathExists(reader.bookmarksPath(profile)),
          history: pathExists(reader.historyPath(profile)),
        });
      }
      browsers.push({
        browser,
        dataDir: reader.dataDir,
        exists: pathExists(reader.dataDir),
        running: running.get(browser) ?? false,
        profiles,
      });
    } else {
      browsers.push({
        browser,
        dataDir,
        exists: false,
        running: running.get(browser) ?? false,
        profiles: [],
      });
    }
  }

  const backups = listBackups(config.backupDir);
  const exports = listExports(config.exportDir, 1);

  return {
    version: CLI_VERSION,
    configFile: dirs.configFile,
    dataDir: config.dataDir,
    logLevel: config.logLevel,
    logFile: path.join(config.logDir, LOG_FILE_NAME),
    profile: config.profile,
    schedule: { ...config.schedule },
    browsers,
    backups: {
      count: backups.length,
      latest: backups.length > 0 ? backups[0].dir : null,
      dir: config.backupDir,
    },
    exports: { count: exports.count, latest: exports.latest, dir: config.exportDir },
  };
}

function createReader(
  browser: keyof CliContext['config']['browsers'],
  dataDir: string | undefined,
  options: StatusCommandOptions,
) {
  return createBrowserReader(browser, {
    dataDir,
    platform: options.platform,
    env: options.env,
  });
}

export function runStatusCommand(context: CliContext, options: StatusCommandOptions = {}): number {
  const report = buildStatusReport(context, options);

  if (options.json) {
    context.io.out(JSON.stringify(report, null, 2));
    return 0;
  }

  const io = context.io;
  io.out(`CrossSync ${report.version}`);
  io.out(`  config:    ${report.configFile}`);
  io.out(`  data dir:  ${report.dataDir}`);
  io.out(`  profile:   ${report.profile}`);
  io.out(`  log level: ${report.logLevel}`);
  io.out(`  log file:  ${report.logFile}`);
  io.out(
    `  schedule:  ${report.schedule.installed ? `installed (${report.schedule.expression})` : 'not installed'}`,
  );

  io.out('  browsers:');
  for (const entry of report.browsers) {
    io.out(
      `    ${entry.browser}: ${entry.exists ? entry.dataDir : `not found (${entry.dataDir})`}` +
        `${entry.running ? ' [running]' : ''}`,
    );
    for (const profile of entry.profiles) {
      const files = [
        profile.bookmarks ? 'Bookmarks' : null,
        profile.history ? 'History' : null,
      ].filter((name): name is string => name !== null);
      io.out(`      ${profile.profile}: ${files.length > 0 ? files.join(', ') : 'no data files'}`);
    }
  }

  io.out(`  backups:   ${report.backups.count} (latest: ${report.backups.latest ?? 'none'})`);
  io.out(`  exports:   ${report.exports.count} (latest: ${report.exports.latest ?? 'none'})`);
  return 0;
}
