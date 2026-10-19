import { describe, it, expect } from 'vitest';

import {
  buildProcessQuery,
  getProcessName,
  getRunningBrowserNames,
  getRunningBrowsers,
  isBrowserRunning,
  parseProcessOutput,
  type ProcessRunner,
} from '../src/browser-status';

function runnerFor(map: Record<string, { status: number; stdout: string }>): ProcessRunner {
  return (command) => map[command] ?? { status: 1, stdout: '' };
}

describe('getProcessName', () => {
  it('resolves the executable per platform', () => {
    expect(getProcessName('chrome', 'win32')).toBe('chrome.exe');
    expect(getProcessName('edge', 'win32')).toBe('msedge.exe');
    expect(getProcessName('chrome', 'darwin')).toBe('Google Chrome');
    expect(getProcessName('edge', 'darwin')).toBe('Microsoft Edge');
    expect(getProcessName('chrome', 'linux')).toBe('chrome');
    expect(getProcessName('edge', 'linux')).toBe('msedge');
  });
});

describe('buildProcessQuery', () => {
  it('uses tasklist on Windows', () => {
    const query = buildProcessQuery('chrome', 'win32');
    expect(query.command).toBe('tasklist');
    expect(query.args).toContain('/FI');
    expect(query.args).toContain('IMAGENAME eq chrome.exe');
  });

  it('uses pgrep on macOS and Linux', () => {
    expect(buildProcessQuery('edge', 'darwin')).toEqual({
      command: 'pgrep',
      args: ['-ix', 'Microsoft Edge'],
    });
    expect(buildProcessQuery('edge', 'linux')).toEqual({
      command: 'pgrep',
      args: ['-ix', 'msedge'],
    });
  });
});

describe('parseProcessOutput', () => {
  it('detects a running browser from tasklist output', () => {
    const output = '"chrome.exe","1234","Console","1","100,000 K"\r\n';
    expect(parseProcessOutput('chrome', 'win32', { status: 0, stdout: output })).toBe(true);
  });

  it('treats the tasklist "no tasks" notice as not running', () => {
    const output = 'INFO: No tasks are running which match the specified criteria.\r\n';
    expect(parseProcessOutput('chrome', 'win32', { status: 0, stdout: output })).toBe(false);
  });

  it('uses pgrep exit codes', () => {
    expect(parseProcessOutput('chrome', 'linux', { status: 0, stdout: '4242\n' })).toBe(true);
    expect(parseProcessOutput('chrome', 'linux', { status: 1, stdout: '' })).toBe(false);
  });

  it('ignores blank pgrep output', () => {
    expect(parseProcessOutput('chrome', 'darwin', { status: 0, stdout: '\n  \n' })).toBe(false);
  });
});

describe('isBrowserRunning', () => {
  it('returns true when the runner reports the process', () => {
    const runner = runnerFor({
      tasklist: { status: 0, stdout: '"msedge.exe","1","Console","1","1 K"' },
    });
    expect(isBrowserRunning('edge', { platform: 'win32', runner })).toBe(true);
  });

  it('returns false when the runner finds nothing', () => {
    const runner = runnerFor({ tasklist: { status: 1, stdout: '' } });
    expect(isBrowserRunning('edge', { platform: 'win32', runner })).toBe(false);
  });

  it('returns false when the runner throws', () => {
    const runner: ProcessRunner = () => {
      throw new Error('command not found');
    };
    expect(isBrowserRunning('chrome', { platform: 'linux', runner })).toBe(false);
  });
});

describe('getRunningBrowsers', () => {
  it('reports both browsers', () => {
    let calls = 0;
    const runner: ProcessRunner = () => {
      calls += 1;
      return { status: 0, stdout: calls === 1 ? '4242' : '' };
    };

    const statuses = getRunningBrowsers({ platform: 'linux', runner });

    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({ browser: 'chrome', running: true, processName: 'chrome' });
    expect(statuses[1]).toMatchObject({ browser: 'edge', running: false, processName: 'msedge' });
  });

  it('lists only the running browser names', () => {
    const runner: ProcessRunner = () => ({ status: 0, stdout: '4242' });
    expect(getRunningBrowserNames({ platform: 'linux', runner })).toEqual(['chrome', 'edge']);
  });
});
