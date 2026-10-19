import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  applyCrontabLine,
  buildCrontabLine,
  createLinuxCronManager,
  renderSystemdService,
  renderSystemdTimer,
  shouldUseSystemd,
  systemdUnitPath,
  type CronRunner,
} from '../src/cron';
import { cleanupTempDirs, makeTempDir } from './helpers';

const EXECUTABLE = '/usr/local/bin/crosssync';

interface Recorder {
  runner: CronRunner;
  calls: { command: string; args: string[] }[];
  crontabWritten: string[];
}

function createRecorder(
  respond?: (command: string, args: string[]) => { status: number; stdout: string; stderr: string },
): Recorder {
  const calls: { command: string; args: string[] }[] = [];
  const crontabWritten: string[] = [];
  const runner: CronRunner = (command, args) => {
    calls.push({ command, args });
    if (command === 'crontab' && args[0] !== '-l') {
      crontabWritten.push(fs.readFileSync(args[0], 'utf8'));
    }
    return respond?.(command, args) ?? { status: 0, stdout: '', stderr: '' };
  };
  return { runner, calls, crontabWritten };
}

afterEach(() => {
  cleanupTempDirs();
});

describe('applyCrontabLine', () => {
  it('appends the CrossSync line and keeps foreign entries', () => {
    const result = applyCrontabLine('0 1 * * * /usr/bin/other\n', '0 9 * * * crosssync sync --all');
    expect(result).toBe('0 1 * * * /usr/bin/other\n0 9 * * * crosssync sync --all\n');
  });

  it('replaces an existing CrossSync line', () => {
    const existing = '0 9 * * * crosssync sync --all # crosssync\n';
    expect(applyCrontabLine(existing, '30 7 * * * crosssync sync --all')).toBe(
      '30 7 * * * crosssync sync --all\n',
    );
  });

  it('removes the CrossSync line and keeps the rest', () => {
    const existing = '0 1 * * * /usr/bin/other\n0 9 * * * crosssync # crosssync\n';
    expect(applyCrontabLine(existing, null)).toBe('0 1 * * * /usr/bin/other\n');
  });

  it('produces an empty crontab when nothing is left', () => {
    expect(applyCrontabLine('0 9 * * * crosssync # crosssync\n', null)).toBe('');
  });
});

describe('cron entry rendering', () => {
  it('buildCrontabLine embeds the marker', () => {
    expect(buildCrontabLine('0 9 * * *', '/usr/bin/crosssync sync --all')).toBe(
      '0 9 * * * /usr/bin/crosssync sync --all # crosssync',
    );
  });

  it('renders a systemd service', () => {
    const service = renderSystemdService(EXECUTABLE, ['sync', '--all']);
    expect(service).toContain('[Service]');
    expect(service).toContain('Type=oneshot');
    expect(service).toContain(`ExecStart=${EXECUTABLE} sync --all`);
  });

  it('quotes service arguments containing spaces', () => {
    expect(renderSystemdService(EXECUTABLE, ['sync', '--profile', 'Profile 1'])).toContain(
      "ExecStart=/usr/local/bin/crosssync sync --profile 'Profile 1'",
    );
  });

  it('renders a systemd timer', () => {
    const timer = renderSystemdTimer('0 9 * * *', 'crosssync-sync');
    expect(timer).toContain('OnCalendar=*-*-* 09:00:00');
    expect(timer).toContain('WantedBy=timers.target');
  });

  it('resolves the unit path', () => {
    expect(systemdUnitPath('crosssync-sync', 'timer', '/home/me')).toBe(
      path.join('/home/me', '.config', 'systemd', 'user', 'crosssync-sync.timer'),
    );
  });
});

describe('shouldUseSystemd', () => {
  it('is forced on by the option', () => {
    expect(shouldUseSystemd({ useSystemd: true }, '/usr/bin/node')).toBe(true);
  });

  it('is forced off by the option', () => {
    expect(shouldUseSystemd({ useSystemd: false }, '/usr/bin/node')).toBe(false);
  });

  it('requires an absolute executable path', () => {
    expect(shouldUseSystemd({}, 'crosssync')).toBe(false);
  });
});

function crontabResponder(stdout: string, status = 0) {
  return (command: string, args: string[]) => {
    if (command === 'crontab' && args[0] === '-l') {
      return { status, stdout, stderr: status === 0 ? '' : 'no crontab' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
}

describe('crontab scheduling', () => {
  it('adds an entry and keeps foreign entries', () => {
    const recorder = createRecorder(crontabResponder('0 1 * * * /usr/bin/other\n'));
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      useSystemd: false,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(true);
    expect(recorder.crontabWritten).toHaveLength(1);
    expect(recorder.crontabWritten[0]).toContain('0 1 * * * /usr/bin/other');
    expect(recorder.crontabWritten[0]).toContain(`0 9 * * * ${EXECUTABLE} sync --all # crosssync`);
  });

  it('works when no crontab exists yet', () => {
    const recorder = createRecorder(crontabResponder('', 1));
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      useSystemd: false,
      runner: recorder.runner,
    });

    expect(manager.install().changed).toBe(true);
    expect(recorder.crontabWritten[0]).toBe(`0 9 * * * ${EXECUTABLE} sync --all # crosssync\n`);
  });

  it('removes only the CrossSync entry on uninstall', () => {
    const recorder = createRecorder(
      crontabResponder('0 1 * * * /usr/bin/other\n0 9 * * * crosssync # crosssync\n'),
    );
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      useSystemd: false,
      runner: recorder.runner,
    });

    const result = manager.uninstall();

    expect(result.changed).toBe(true);
    expect(recorder.crontabWritten[0]).toBe('0 1 * * * /usr/bin/other\n');
  });

  it('is idempotent when no entry is installed', () => {
    const recorder = createRecorder(crontabResponder('0 1 * * * /usr/bin/other\n'));
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      useSystemd: false,
      runner: recorder.runner,
    });

    expect(manager.uninstall().changed).toBe(false);
    expect(recorder.crontabWritten).toHaveLength(0);
  });

  it('describes the crontab plan', () => {
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      useSystemd: false,
    });
    expect(manager.describe('install')).toContain('# crosssync');
    expect(manager.describe('uninstall')).toContain('# crosssync');
  });
});

describe('systemd timer scheduling', () => {
  it('writes the unit files and enables the timer', () => {
    const homeDir = makeTempDir('crosssync-systemd');
    const recorder = createRecorder();
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      useSystemd: true,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(true);
    expect(fs.existsSync(systemdUnitPath('crosssync-sync', 'service', homeDir))).toBe(true);
    expect(fs.existsSync(systemdUnitPath('crosssync-sync', 'timer', homeDir))).toBe(true);
    expect(recorder.calls.map((call) => call.args.join(' '))).toEqual([
      '--user daemon-reload',
      '--user enable --now crosssync-sync.timer',
    ]);
  });

  it('removes the unit files on uninstall', () => {
    const homeDir = makeTempDir('crosssync-systemd');
    const recorder = createRecorder();
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      useSystemd: true,
      runner: recorder.runner,
    });

    manager.install();
    const result = manager.uninstall();

    expect(result.changed).toBe(true);
    expect(fs.existsSync(systemdUnitPath('crosssync-sync', 'service', homeDir))).toBe(false);
    expect(fs.existsSync(systemdUnitPath('crosssync-sync', 'timer', homeDir))).toBe(false);
  });

  it('reports a failed enable', () => {
    const homeDir = makeTempDir('crosssync-systemd');
    const recorder = createRecorder((command, args) =>
      args.includes('enable')
        ? { status: 1, stdout: '', stderr: 'no user bus' }
        : { status: 0, stdout: '', stderr: '' },
    );
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      useSystemd: true,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(false);
    expect(result.messages[0]).toContain('no user bus');
  });

  it('describes both plans', () => {
    const homeDir = makeTempDir('crosssync-systemd');
    const manager = createLinuxCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      useSystemd: true,
    });
    expect(manager.describe('install')).toContain(
      'systemctl --user enable --now crosssync-sync.timer',
    );
    expect(manager.describe('uninstall')).toContain(
      'systemctl --user disable --now crosssync-sync.timer',
    );
  });
});
