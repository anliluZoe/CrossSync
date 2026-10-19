import fs from 'fs';
import os from 'os';
import path from 'path';

import { DEFAULT_CRON_SCHEDULE, ensureDir, pathExists, resolveHomeDir } from '@crosssync/shared';

import { CRONTAB_MARKER, SYSTEMD_UNIT_NAME } from '../constants';
import { quotePosixArgument, resolveInvocation } from './invocation';
import { defaultCronRunner, toActionResult } from './runner';
import { parseCronExpression, toSystemdCalendar } from './schedule';
import type { CronManager, CronManagerOptions, CronRunner } from './types';

/** `~/.config/systemd/user/<unit>.<kind>` */
export function systemdUnitPath(unit: string, kind: 'service' | 'timer', homeDir?: string): string {
  return path.join(homeDir ?? resolveHomeDir(), '.config', 'systemd', 'user', `${unit}.${kind}`);
}

export function renderSystemdService(program: string, args: string[]): string {
  const execStart = [program, ...args].map(quotePosixArgument).join(' ');
  return [
    '[Unit]',
    'Description=CrossSync browser bookmark & history sync',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${execStart}`,
    '',
  ].join('\n');
}

export function renderSystemdTimer(expression: string, unit: string): string {
  const spec = parseCronExpression(expression);
  return [
    '[Unit]',
    `Description=Run CrossSync (${unit}) on a schedule`,
    '',
    '[Timer]',
    `OnCalendar=${toSystemdCalendar(spec)}`,
    'Persistent=true',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
}

/** Replaces CrossSync's crontab entry, keeping every other line intact. */
export function applyCrontabLine(existing: string, line: string | null): string {
  const kept = existing
    .split(/\r?\n/)
    .filter((entry) => entry.trim().length > 0 && !entry.includes(CRONTAB_MARKER));
  if (line) {
    kept.push(line);
  }
  return kept.length > 0 ? `${kept.join('\n')}\n` : '';
}

export function buildCrontabLine(expression: string, commandLine: string): string {
  return `${expression} ${commandLine} ${CRONTAB_MARKER}`;
}

/** True when the schedule should be installed as a systemd user timer. */
export function shouldUseSystemd(options: CronManagerOptions, program: string): boolean {
  if (options.useSystemd === true) {
    return true;
  }
  if (options.useSystemd === false) {
    return false;
  }
  // systemd requires an absolute ExecStart path; otherwise fall back to crontab.
  return path.isAbsolute(program) && pathExists('/run/systemd/system');
}

/**
 * Installs the schedule as a systemd user timer when available, otherwise as a
 * crontab entry. `describe()` lets `install-cron --dry-run` show the plan.
 */
export function createLinuxCronManager(options: CronManagerOptions = {}): CronManager {
  const expression = options.expression ?? DEFAULT_CRON_SCHEDULE;
  const invocation = resolveInvocation(options);
  const runner = options.runner ?? defaultCronRunner;
  const homeDir = options.homeDir ?? resolveHomeDir();
  const useSystemd = shouldUseSystemd(options, invocation.program);
  const unit = options.label ?? SYSTEMD_UNIT_NAME;
  const servicePath = systemdUnitPath(unit, 'service', homeDir);
  const timerPath = systemdUnitPath(unit, 'timer', homeDir);
  const cronLine = buildCrontabLine(expression, invocation.posixCommandLine);

  return {
    platform: 'linux',
    label: unit,

    describe(action) {
      if (useSystemd) {
        if (action === 'install') {
          return [
            `Write systemd user timer (${expression}):`,
            `  ${servicePath}`,
            `  ${timerPath}`,
            '  systemctl --user daemon-reload',
            `  systemctl --user enable --now ${unit}.timer`,
          ].join('\n');
        }
        return [
          'Disable systemd user timer:',
          `  systemctl --user disable --now ${unit}.timer`,
          `Remove files: ${servicePath}, ${timerPath}`,
          '  systemctl --user daemon-reload',
        ].join('\n');
      }

      if (action === 'install') {
        return ['Add crontab entry:', `  ${cronLine}`].join('\n');
      }
      return `Remove the crontab entry containing "${CRONTAB_MARKER}".`;
    },

    install() {
      if (useSystemd) {
        ensureDir(path.dirname(servicePath));
        fs.writeFileSync(
          servicePath,
          renderSystemdService(invocation.program, invocation.args),
          'utf8',
        );
        fs.writeFileSync(timerPath, renderSystemdTimer(expression, unit), 'utf8');

        const reload = runner('systemctl', ['--user', 'daemon-reload']);
        if (reload.status !== 0) {
          return toActionResult(reload, '', 'systemctl --user daemon-reload failed');
        }
        const result = runner('systemctl', ['--user', 'enable', '--now', `${unit}.timer`]);
        return toActionResult(
          result,
          `systemd timer "${unit}.timer" installed.`,
          'systemctl --user enable failed',
        );
      }

      const current = runner('crontab', ['-l']);
      const next = applyCrontabLine(current.status === 0 ? current.stdout : '', cronLine);
      return writeCrontab(next, runner, `crontab entry for ${unit} installed.`);
    },

    uninstall() {
      if (useSystemd) {
        runner('systemctl', ['--user', 'disable', '--now', `${unit}.timer`]);
        let existed = false;
        for (const file of [servicePath, timerPath]) {
          if (pathExists(file)) {
            existed = true;
            fs.rmSync(file, { force: true });
          }
        }
        runner('systemctl', ['--user', 'daemon-reload']);
        return {
          changed: existed,
          messages: [
            existed
              ? `systemd timer "${unit}.timer" removed.`
              : `No systemd timer named "${unit}.timer" was installed.`,
          ],
        };
      }

      const current = runner('crontab', ['-l']);
      const before = current.status === 0 ? current.stdout : '';
      const next = applyCrontabLine(before, null);
      if (next === before) {
        return { changed: false, messages: [`No crontab entry for ${unit} was installed.`] };
      }
      return writeCrontab(next, runner, `crontab entry for ${unit} removed.`);
    },
  };
}

function writeCrontab(
  content: string,
  runner: CronRunner,
  successMessage: string,
): { changed: boolean; messages: string[] } {
  const tempFile = path.join(os.tmpdir(), `crosssync-crontab-${process.pid}.txt`);
  fs.writeFileSync(tempFile, content, 'utf8');
  try {
    const result = runner('crontab', [tempFile]);
    return toActionResult(result, successMessage, 'crontab failed');
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}
