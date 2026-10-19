export interface CronProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Injectable command runner so cron plans stay unit-testable. */
export type CronRunner = (command: string, args: string[]) => CronProcessResult;

export interface CronManagerOptions {
  platform?: NodeJS.Platform;
  /** Overrides the user home directory; used by tests. */
  homeDir?: string;
  /** Absolute path of the executable to schedule. */
  executable?: string;
  /** Cron expression describing the schedule. */
  expression?: string;
  /** Arguments handed to the executable by the schedule. */
  args?: string[];
  /** Task / agent / unit name. */
  label?: string;
  runner?: CronRunner;
  /** Linux only: force systemd timers instead of crontab. */
  useSystemd?: boolean;
}

export interface CronActionResult {
  changed: boolean;
  messages: string[];
}

export interface CronInvocation {
  program: string;
  args: string[];
  /** One command line with Windows quoting, used with `schtasks /TR`. */
  windowsCommandLine: string;
  /** One command line with POSIX quoting, used inside crontab / systemd entries. */
  posixCommandLine: string;
}

export interface CronManager {
  platform: NodeJS.Platform;
  label: string;
  /** Preview of the files/commands the action would touch. */
  describe(action: CronAction): string;
  install(): CronActionResult;
  uninstall(): CronActionResult;
}

export type CronAction = 'install' | 'uninstall';
