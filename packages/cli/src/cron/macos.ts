import fs from 'fs';
import path from 'path';

import { DEFAULT_CRON_SCHEDULE, ensureDir, resolveHomeDir } from '@crosssync/shared';

import { MACOS_LAUNCH_AGENT_LABEL } from '../constants';
import { resolveInvocation } from './invocation';
import { defaultCronRunner, toActionResult } from './runner';
import { isWildcard, parseCronExpression, toFixedTime, toWeekday } from './schedule';
import type { CronManager, CronManagerOptions } from './types';

/** Escapes a value for inclusion in a plist `<string>` element. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Path of the launchd agent written by CrossSync. */
export function launchAgentPath(label: string, homeDir?: string): string {
  return path.join(homeDir ?? resolveHomeDir(), 'Library', 'LaunchAgents', `${label}.plist`);
}

/** Renders the `com.crosssync.sync.plist` LaunchAgent. */
export function renderLaunchAgent(options: {
  label: string;
  expression: string;
  program: string;
  args: string[];
  logDir: string;
}): string {
  const spec = parseCronExpression(options.expression);
  const { hour, minute } = toFixedTime(spec);

  const calendar: string[] = [
    '    <key>Hour</key>',
    `    <integer>${hour}</integer>`,
    '    <key>Minute</key>',
    `    <integer>${minute}</integer>`,
  ];

  const weekday = toWeekday(spec);
  if (weekday !== null) {
    calendar.push('    <key>Weekday</key>', `    <integer>${weekday}</integer>`);
  }
  if (!isWildcard(spec.dayOfMonth) && /^\d+$/.test(spec.dayOfMonth)) {
    calendar.push('    <key>Day</key>', `    <integer>${Number(spec.dayOfMonth)}</integer>`);
  }
  if (!isWildcard(spec.month) && /^\d+$/.test(spec.month)) {
    calendar.push('    <key>Month</key>', `    <integer>${Number(spec.month)}</integer>`);
  }

  const programArguments = [options.program, ...options.args]
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${escapeXml(options.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    programArguments,
    '  </array>',
    '  <key>StartCalendarInterval</key>',
    '  <dict>',
    calendar.join('\n'),
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <false/>',
    '  <key>StandardOutPath</key>',
    `  <string>${escapeXml(path.join(options.logDir, 'launchd.out.log'))}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${escapeXml(path.join(options.logDir, 'launchd.err.log'))}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/**
 * Installs the schedule as a per-user launchd agent.
 *
 * launchd only understands calendar intervals, so a fixed time is required.
 */
export function createMacosCronManager(options: CronManagerOptions = {}): CronManager {
  const label = options.label ?? MACOS_LAUNCH_AGENT_LABEL;
  const expression = options.expression ?? DEFAULT_CRON_SCHEDULE;
  const invocation = resolveInvocation(options);
  const runner = options.runner ?? defaultCronRunner;
  const homeDir = options.homeDir ?? resolveHomeDir();
  const plistPath = launchAgentPath(label, homeDir);
  const logDir = path.join(homeDir, '.crosssync', 'logs');

  const render = (): string =>
    renderLaunchAgent({
      label,
      expression,
      program: invocation.program,
      args: invocation.args,
      logDir,
    });

  return {
    platform: 'darwin',
    label,

    describe(action) {
      if (action === 'install') {
        return [
          `Write launchd agent: ${plistPath}`,
          `  launchctl load -w ${plistPath}`,
          '',
          render().trimEnd(),
        ].join('\n');
      }
      return [
        `Unload launchd agent:`,
        `  launchctl unload -w ${plistPath}`,
        `Remove file: ${plistPath}`,
      ].join('\n');
    },

    install() {
      ensureDir(path.dirname(plistPath));
      fs.writeFileSync(plistPath, render(), 'utf8');
      runner('launchctl', ['unload', '-w', plistPath]);
      const result = runner('launchctl', ['load', '-w', plistPath]);
      return toActionResult(result, `launchd agent "${label}" installed.`, 'launchctl load failed');
    },

    uninstall() {
      const result = runner('launchctl', ['unload', '-w', plistPath]);
      const existed = fs.existsSync(plistPath);
      if (existed) {
        fs.rmSync(plistPath, { force: true });
      }
      if (!existed && result.status !== 0) {
        return { changed: false, messages: [`No launchd agent named "${label}" was installed.`] };
      }
      return { changed: existed, messages: [`launchd agent "${label}" removed.`] };
    },
  };
}
