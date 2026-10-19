import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { createContext, createMemoryIo, type CliContext } from '../src/context';
import { parseProfileNames, runProfilesCommand } from '../src/commands/profiles';
import { cleanupTempDirs, createCliFixture, type CliFixture } from './helpers';

interface Harness {
  fixture: CliFixture;
  context: CliContext;
  io: ReturnType<typeof createMemoryIo>;
}

function setupHarness(): Harness {
  const fixture = createCliFixture();
  fs.mkdirSync(path.join(fixture.chromeDataDir, 'Profile 11'));
  fs.mkdirSync(path.join(fixture.chromeDataDir, 'Profile 12'));
  const io = createMemoryIo();
  const context = createContext({ homeDir: fixture.homeDir, io, console: false });
  return { fixture, context, io };
}

afterEach(() => {
  cleanupTempDirs();
});

describe('profiles command', () => {
  it('lists available profiles and marks the current selection', () => {
    const { context, io } = setupHarness();

    expect(runProfilesCommand(context)).toBe(0);

    const output = io.stdout.join('\n');
    expect(output).toContain('chrome:');
    expect(output).toContain('Profile 11');
    expect(output).toContain('Profile 12');
    expect(output).toContain('Default  [selected]');
    expect(output).toContain('edge:');
    expect(output).toContain('Selected profile(s): Default');
  });

  it('limits listing to one browser', () => {
    const { context, io } = setupHarness();

    expect(runProfilesCommand(context, { browser: 'chrome' })).toBe(0);

    const output = io.stdout.join('\n');
    expect(output).toContain('chrome:');
    expect(output).not.toContain('edge:');
  });

  it('replaces the selection with --set', () => {
    const { fixture, context, io } = setupHarness();

    expect(runProfilesCommand(context, { set: 'Profile 11,Profile 12' })).toBe(0);

    expect(context.config.profile).toBe('Profile 11,Profile 12');
    expect(io.stdout.join('\n')).toContain('profile = "Profile 11,Profile 12"');
    const saved = JSON.parse(fs.readFileSync(fixture.configFile, 'utf8')) as { profile: string };
    expect(saved.profile).toBe('Profile 11,Profile 12');
  });

  it('adds and removes profiles without dropping other browsers', () => {
    const { context } = setupHarness();

    expect(runProfilesCommand(context, { add: 'Profile 11' })).toBe(0);
    expect(context.config.profile).toBe('Default,Profile 11');

    expect(runProfilesCommand(context, { remove: 'Default' })).toBe(0);
    expect(context.config.profile).toBe('Profile 11');
  });

  it('selects all profiles with --all and resets with --reset', () => {
    const { context } = setupHarness();

    expect(runProfilesCommand(context, { all: true })).toBe(0);
    expect(context.config.profile).toBe('all');

    expect(runProfilesCommand(context, { reset: true })).toBe(0);
    expect(context.config.profile).toBe('Default');
  });

  it('refuses to remove every profile', () => {
    const { context, io } = setupHarness();
    context.config.profile = 'Profile 11';

    expect(runProfilesCommand(context, { remove: 'Profile 11' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Refusing to remove every profile');
  });

  it('rejects invalid profile names', () => {
    const { context, io } = setupHarness();

    expect(runProfilesCommand(context, { set: 'NotAProfile' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('Invalid profile name');
  });

  it('rejects --browser together with a mutation', () => {
    const { context, io } = setupHarness();

    expect(runProfilesCommand(context, { browser: 'chrome', set: 'Profile 11' })).toBe(1);
    expect(io.stderr.join('\n')).toContain('--browser only applies when listing');
  });

  it('parseProfileNames validates names and accepts all', () => {
    expect(parseProfileNames('Default, Profile 11')).toEqual(['Default', 'Profile 11']);
    expect(parseProfileNames('all')).toBe('all');
    expect(() => parseProfileNames('')).toThrow(/empty/);
    expect(() => parseProfileNames('Default,nope')).toThrow(/Invalid profile name/);
  });
});
