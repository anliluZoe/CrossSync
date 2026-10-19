import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  createMacosCronManager,
  escapeXml,
  launchAgentPath,
  renderLaunchAgent,
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

describe('macOS launchd', () => {
  it('escapes xml special characters', () => {
    expect(escapeXml('a&b<c>"d\'')).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });

  it('resolves the launch agent path', () => {
    expect(launchAgentPath('com.crosssync.sync', '/Users/me')).toBe(
      path.join('/Users/me', 'Library', 'LaunchAgents', 'com.crosssync.sync.plist'),
    );
  });

  it('renders a calendar interval with hour and minute', () => {
    const plist = renderLaunchAgent({
      label: 'com.crosssync.sync',
      expression: '0 9 * * *',
      program: EXECUTABLE,
      args: ['sync', '--all'],
      logDir: '/Users/me/.crosssync/logs',
    });

    expect(plist).toContain('<key>Label</key>');
    expect(plist).toContain('<string>com.crosssync.sync</string>');
    expect(plist).toContain('<integer>9</integer>');
    expect(plist).toContain('<integer>0</integer>');
    expect(plist).toContain(`<string>${EXECUTABLE}</string>`);
    expect(plist).toContain('StartCalendarInterval');
  });

  it('adds a Weekday key for weekly schedules', () => {
    const plist = renderLaunchAgent({
      label: 'com.crosssync.sync',
      expression: '30 7 * * 1',
      program: EXECUTABLE,
      args: ['sync'],
      logDir: '/tmp/logs',
    });

    expect(plist).toContain('<key>Weekday</key>');
    expect(plist).toContain('<integer>1</integer>');
  });

  it('writes the plist and loads the agent', () => {
    const homeDir = makeTempDir('crosssync-launchd');
    const recorder = createRecorder();
    const manager = createMacosCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      runner: recorder.runner,
    });

    const result = manager.install();

    expect(result.changed).toBe(true);
    const plist = launchAgentPath('com.crosssync.sync', homeDir);
    expect(fs.existsSync(plist)).toBe(true);
    expect(recorder.calls.map((call) => call.command)).toEqual(['launchctl', 'launchctl']);
    expect(recorder.calls[0].args[0]).toBe('unload');
    expect(recorder.calls[1].args).toEqual(['load', '-w', plist]);
  });

  it('removes the plist on uninstall', () => {
    const homeDir = makeTempDir('crosssync-launchd');
    const recorder = createRecorder();
    const manager = createMacosCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      runner: recorder.runner,
    });

    manager.install();
    const result = manager.uninstall();

    expect(result.changed).toBe(true);
    expect(fs.existsSync(launchAgentPath('com.crosssync.sync', homeDir))).toBe(false);
  });

  it('is idempotent when uninstalling a missing agent', () => {
    const homeDir = makeTempDir('crosssync-launchd');
    const recorder = createRecorder(() => ({ status: 1, stdout: '', stderr: 'not found' }));
    const manager = createMacosCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
      runner: recorder.runner,
    });

    expect(manager.uninstall().changed).toBe(false);
  });

  it('describes the install plan', () => {
    const homeDir = makeTempDir('crosssync-launchd');
    const manager = createMacosCronManager({
      expression: '0 9 * * *',
      executable: EXECUTABLE,
      homeDir,
    });
    expect(manager.describe('install')).toContain('launchctl load -w');
  });
});
