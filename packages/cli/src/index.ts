import type { LogLevel } from '@crosssync/shared';
import { Command } from 'commander';

import { CLI_DESCRIPTION, CLI_NAME, CLI_VERSION } from './constants';
import { createContext, type CliContext, type CreateContextOptions } from './context';
import { runBackupCommand } from './commands/backup';
import { runConfigCommand } from './commands/config';
import { runInstallCronCommand, runUninstallCronCommand } from './commands/cron';
import { runExportCommand } from './commands/export';
import { runLogsCommand } from './commands/logs';
import { runProfilesCommand } from './commands/profiles';
import { runRestoreCommand } from './commands/restore';
import { runStatusCommand } from './commands/status';
import { runSyncCommand } from './commands/sync';

export interface GlobalOptions {
  /** Use a different home directory (used by tests). */
  homeDir?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export type ContextFactory = (options: GlobalOptions) => CliContext;

/** Builds the CLI context, turning a bad config into a friendly error. */
export function createCliContext(options: GlobalOptions = {}): CliContext {
  const logLevel: LogLevel | undefined = options.verbose
    ? 'debug'
    : options.quiet
      ? 'error'
      : undefined;
  const contextOptions: CreateContextOptions = { homeDir: options.homeDir, logLevel };
  return createContext(contextOptions);
}

export function buildProgram(contextFactory: ContextFactory = createCliContext): Command {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description(CLI_DESCRIPTION)
    .version(CLI_VERSION, '-v, --version', 'print the CrossSync version')
    .option('--home-dir <path>', 'use an alternate home directory')
    .option('--verbose', 'enable debug logging')
    .option('--quiet', 'only log errors');

  const withContext = (action: (context: CliContext) => number | Promise<number>) => async () => {
    const context = contextFactory(program.opts<GlobalOptions>());
    try {
      process.exitCode = await action(context);
    } catch (error) {
      context.io.err(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };

  const syncCommand = program
    .command('sync')
    .description('read, merge and write back browser bookmarks/history')
    .option('--bookmarks', 'sync bookmarks only')
    .option('--history', 'sync history only')
    .option('--all', 'sync bookmarks and history (default)')
    .option('--browser <name>', 'chrome, edge or all', 'all')
    .option('--profile <names>', 'profile name(s), comma-separated, or "all"')
    .option('--strategy <name>', 'merge (write back) or export (read only)')
    .option('--dry-run', 'show what would happen without touching any file')
    .option('--force', 'write bookmarks back even while the browser is running')
    .option('--json', 'print the report as JSON');
  syncCommand.action(withContext((context) => runSyncCommand(context, syncCommand.opts())));

  const backupCommand = program
    .command('backup')
    .description('back up browser bookmark and history files')
    .option('--list', 'list existing backups')
    .option('--prune', 'delete old backups')
    .option('--keep <count>', 'how many backups to keep when pruning');
  backupCommand.action(
    withContext((context) => {
      const options = backupCommand.opts();
      return runBackupCommand(context, {
        list: options.list,
        prune: options.prune,
        keep: options.keep === undefined ? undefined : Number(options.keep),
      });
    }),
  );

  const restoreCommand = program
    .command('restore')
    .description('restore browser files from a CrossSync backup')
    .argument('[backup-id]', 'backup id to restore (defaults to the newest)')
    .option('--history', 'also restore History databases')
    .option('--force', 'restore even while the browser is running')
    .option('--dry-run', 'show what would be restored without writing');
  restoreCommand.action(
    withContext((context) => {
      const options = restoreCommand.opts();
      return runRestoreCommand(context, {
        id: restoreCommand.args[0],
        history: options.history,
        force: options.force,
        dryRun: options.dryRun,
      });
    }),
  );

  const exportCommand = program
    .command('export')
    .description('export merged bookmarks/history as JSON')
    .option('--format <format>', 'output format (json)', 'json')
    .option('--out <dir>', 'directory to write into')
    .option('--browser <name>', 'chrome, edge or all', 'all')
    .option('--profile <names>', 'profile name(s), comma-separated, or "all"')
    .option('--stdout', 'print the export instead of writing a file');
  exportCommand.action(withContext((context) => runExportCommand(context, exportCommand.opts())));

  const statusCommand = program
    .command('status')
    .description('show browsers, profiles, backups and schedule state')
    .option('--json', 'print the status as JSON');
  statusCommand.action(withContext((context) => runStatusCommand(context, statusCommand.opts())));

  const profilesCommand = program
    .command('profiles')
    .description('list available Chromium profiles or change the synced selection')
    .option('--list', 'list profiles and the current selection (default)')
    .option('--set <names>', 'replace the selection, e.g. "Default,Profile 11" or "all"')
    .option('--add <names>', 'add profiles to the selection')
    .option('--remove <names>', 'remove profiles from the selection')
    .option('--all', 'select every available profile')
    .option('--reset', 'reset the selection to "Default"')
    .option('--browser <name>', 'limit listing to chrome, edge or all', 'all');
  profilesCommand.action(
    withContext((context) => runProfilesCommand(context, profilesCommand.opts())),
  );

  const logsCommand = program
    .command('logs')
    .description('print CrossSync log entries')
    .option('--limit <count>', 'number of entries to show', '50')
    .option('--level <level>', 'debug, info, warn or error')
    .option('--clear', 'delete the log file')
    .option('--json', 'print the entries as JSON');
  logsCommand.action(
    withContext((context) => {
      const options = logsCommand.opts();
      return runLogsCommand(context, {
        limit: Number(options.limit),
        level: options.level,
        clear: options.clear,
        json: options.json,
      });
    }),
  );

  const installCronCommand = program
    .command('install-cron')
    .description('install a scheduled sync (Task Scheduler, launchd, systemd or cron)')
    .option('--expression <cron>', 'cron expression, e.g. "0 9 * * *"')
    .option('--label <name>', 'task/agent/unit name')
    .option('--dry-run', 'print the plan without changing anything');
  installCronCommand.action(
    withContext((context) => runInstallCronCommand(context, installCronCommand.opts())),
  );

  const uninstallCronCommand = program
    .command('uninstall-cron')
    .description('remove the installed schedule')
    .option('--label <name>', 'task/agent/unit name')
    .option('--dry-run', 'print the plan without changing anything');
  uninstallCronCommand.action(
    withContext((context) => runUninstallCronCommand(context, uninstallCronCommand.opts())),
  );

  const configCommand = program
    .command('config')
    .description('show or edit the CrossSync configuration')
    .option('--path', 'print the config file path')
    .option('--get <key>', 'read a dotted key, e.g. sync.strategy')
    .option('--set <key=value>', 'write a key, e.g. sync.strategy=export')
    .option('--reset', 'restore the default config');
  configCommand.action(withContext((context) => runConfigCommand(context, configCommand.opts())));

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

export { CLI_NAME, CLI_VERSION };
export const PACKAGE = 'crosssync';
export const VERSION = CLI_VERSION;

if (require.main === module) {
  void run();
}
