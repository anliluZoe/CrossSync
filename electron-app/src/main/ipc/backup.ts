import { ipcMain } from 'electron';
import {
  createBackup,
  listBackups,
  pruneBackups,
  type BackupOptions,
} from '@crosssync/core/backup';
import { createConfiguredBrowserReaders } from '@crosssync/core/readers';
import { createDefaultConfig, resolveCrossSyncDirs, pathExists } from '@crosssync/shared';
import { homedir } from 'os';
import { join } from 'path';

export function registerBackupHandlers() {
  // 执行备份
  ipcMain.handle('backup:run', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);

      // 读取所有浏览器数据并备份
      const readers = createConfiguredBrowserReaders(config);
      const sources: BackupOptions['sources'] = [];

      for (const reader of readers) {
        const profiles = reader.profiles();
        for (const profile of profiles) {
          const bookmarksPath = reader.bookmarksPath(profile);
          const historyPath = reader.historyPath(profile);

          if (await pathExists(bookmarksPath)) {
            sources.push({
              kind: 'bookmarks' as const,
              browser: reader.browser,
              profile,
              filePath: bookmarksPath,
            });
          }

          if (await pathExists(historyPath)) {
            sources.push({
              kind: 'history' as const,
              browser: reader.browser,
              profile,
              filePath: historyPath,
            });
          }
        }
      }

      if (sources.length === 0) {
        return {
          success: false,
          error: '没有找到可备份的数据',
        };
      }

      const backupOptions: BackupOptions = {
        backupDir: config.backupDir,
        sources,
      };

      const backup = createBackup(backupOptions);
      return { success: true, data: { backupId: backup.id, dir: backup.dir } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 列出备份
  ipcMain.handle('backup:list', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);
      const backups = listBackups(config.backupDir);
      return { success: true, data: backups };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 清理备份
  ipcMain.handle('backup:prune', async (_event, keepCount: number) => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);
      const deleted = pruneBackups(config.backupDir, keepCount);
      return { success: true, data: { deletedCount: deleted.length } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function loadConfig(configFile: string) {
  try {
    const raw = readJsonFile<unknown>(configFile);
    if (!raw || !isCliConfig(raw)) {
      const dirs = resolveCrossSyncDirs();
      const config = createDefaultConfig({
        dataDir: dirs.root,
        backupDir: dirs.backups,
        exportDir: dirs.exports,
        logDir: dirs.logs,
      });
      return config;
    }
    return raw;
  } catch {
    const dirs = resolveCrossSyncDirs();
    return createDefaultConfig({
      dataDir: dirs.root,
      backupDir: dirs.backups,
      exportDir: dirs.exports,
      logDir: dirs.logs,
    });
  }
}
