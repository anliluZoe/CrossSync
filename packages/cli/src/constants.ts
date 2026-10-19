export const CLI_PACKAGE = 'crosssync';
export const CLI_VERSION = '0.1.1';
export const CLI_NAME = 'crosssync';
export const CLI_DESCRIPTION = 'Cross-browser bookmark & history sync CLI (Chrome + Edge)';

/** Name of the Windows Task Scheduler entry. */
export const WINDOWS_TASK_NAME = 'CrossSync';

/** Reverse-DNS label of the launchd agent installed on macOS. */
export const MACOS_LAUNCH_AGENT_LABEL = 'com.crosssync.sync';

/** Name of the systemd user timer/service installed on Linux. */
export const SYSTEMD_UNIT_NAME = 'crosssync-sync';

/** Marker used to recognise CrossSync lines inside a crontab. */
export const CRONTAB_MARKER = '# crosssync';

/** Default arguments passed to `crosssync` by the installed schedule. */
export const DEFAULT_SCHEDULE_ARGS = ['sync', '--all'];
