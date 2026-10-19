import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  applyCrontabLine,
  buildCrontabLine,
  buildScheduleArgs,
  createLinuxCronManager,
  createMacosCronManager,
  createWindowsCronManager,
  escapeXml,
  launchAgentPath,
  renderLaunchAgent,
  renderSystemdService,
  renderSystemdTimer,
  shouldUseSystemd,
  systemdUnitPath,
  type CronRunner,
} from '../src/cron';
import { cleanupTempDirs, makeTempDir } from './helpers';

const EXECUTABLE = process.platform === 'win32' ? 'C:\\crosssync\\node.exe' : '/usr/bin/node';

interface Recorder {
  runner: CronRunner;
  calls: { command: string; args: string[] }[];
  files: Record<string, string>;
}

function createRecorder(
  respond?: (command: string, args: string[]) => { status: number; stdout: string; stderr: string },
): Recorder {
  const calls: { command: string; args: string[] }[] = [];
  const files: Record<string, string> = {};
  const runner: CronRunner = (command, args) => {
    calls.push({ command, args });
    if (command === 'crontab' && args[0] !== '-l') {
      files[args[0]] = fs.readFileSync(args[0], 'utf8');
    }
    return respond?.(command, args) ?? { status: 0, stdout: '', stderr: '' };
  };
  return { runner, calls, files };
}

afterEach(() => {
  cleanupTempDirs();
});

describe('Windows Task Scheduler', () => {
  it('builds daily schedule arguments', () => {
    expect(buildScheduleArgs('0 9 * * *')).toEqual(['/SC', 'DAILY', '/ST', '09:00']);
  });

  it('builds weekly schedule arguments', () => {
    expect(buildScheduleArgs('30 7 * * 1')).toEqual(['/SC', 'WEEKLY', '/D', 'MON', '/ST', '07:30']);
  });

  it('rejects schedules Task Scheduler cannot express', () => {
    expect(() => buildScheduleArgs('0 9 15 * *')).toThrow(/daily or weekly/);
  });

  it('registers the task with the resolved command', () => {
    const recorder = createRecorder();
    const manager = createWindowsCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(true);
    expect(recorder.calls[0].command).toBe('schtasks');
    expect(recorder.calls[0].args).toEqual([
      '/Create',
      '/F',
      '/TN',
      'CrossSync',
      '/SC',
      'DAILY',
      '/ST',
      '09:00',
      '/TR',
      `${EXECUTABLE} sync --all`,
    ]);
  });

  it('quotes paths containing spaces', () => {
    const recorder = createRecorder();
    const manager = createWindowsCronManager({
      expression: '0 9 * * *',
      executable: 'C:\\Program Files\\CrossSync\\crosssync.exe',
      runner: recorder.runner,
    });

    manager.install();

    const taskCommand = recorder.calls[0].args[recorder.calls[0].args.length - 1];
    expect(taskCommand).toContain('"C:\\Program Files\\CrossSync\\crosssync.exe"');
  });

  it('honours a custom label', () => {
    const recorder = createRecorder();
    const manager = createWindowsCronManager({
      label: 'CrossSyncTest',
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      runner: recorder.runner,
    });

    expect(manager.label).toBe('CrossSyncTest');
    manager.install();
    expect(recorder.calls[0].args).toContain('CrossSyncTest');
  });

  it('reports a failed install', () => {
    const recorder = createRecorder(() => ({ status: 1, stdout: '', stderr: 'access denied' }));
    const manager = createWindowsCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(false);
    expect(result.messages[0]).toContain('access denied');
  });

  it('is idempotent when uninstalling a missing task', () => {
    const recorder = createRecorder(() => ({ status: 1, stdout: '', stderr: 'not found' }));
    const manager = createWindowsCronManager({ runner: recorder.runner });

    const result = manager.uninstall();

    expect(result.changed).toBe(false);
    expect(result.messages[0]).toContain('was removed');
  });

  it('describes the install plan', () => {
    const manager = createWindowsCronManager({ expression: '0 9 * * *', executable: EXECUTABLE });
    expect(manager.describe('install')).toContain('schtasks /Create');
    expect(manager.describe('uninstall')).toContain('schtasks /Delete');
  });
});
