import { ipcMain } from 'electron';
import { runSync, type SyncRunOptions } from '@crosssync/core/sync';
import { createConfiguredBrowserReaders, supportedBrowsers } from '@crosssync/core/readers';
import { getRunningBrowsers } from '@crosssync/core/browser-status';
import {
  createDefaultConfig,
  resolveCrossSyncDirs,
  readJsonFile,
  isCliConfig,
} from '@crosssync/shared';
import { homedir } from 'os';
import { join } from 'path';

export function registerSyncHandlers() {
  // 执行同步
  ipcMain.handle('sync:run', async (_event, options: SyncRunOptions) => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);

      const runOptions: SyncRunOptions = {
        config,
        targets: {
          bookmarks: options.bookmarks ?? true,
          history: options.history ?? true,
        },
        dryRun: options.dryRun ?? false,
        force: options.force ?? false,
        strategy: options.strategy ?? config.sync.strategy,
        platform: process.platform,
      };

      const result = runSync(runOptions);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 获取支持的浏览器列表
  ipcMain.handle('sync:supported-browsers', async () => {
    try {
      const browsers = supportedBrowsers();
      return { success: true, data: Array.from(browsers) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 检测浏览器状态
  ipcMain.handle('sync:detect-browsers', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);

      const readers = createConfiguredBrowserReaders(config);
      const runningBrowsers = getRunningBrowsers();

      const browsers = readers.map((reader) => {
        const profiles = reader.profiles();
        const running = runningBrowsers.find((b) => b.browser === reader.browser);

        return {
          name: reader.browser,
          label: reader.browser === 'chrome' ? 'Chrome' : 'Edge',
          detected: true,
          running: running?.running ?? false,
          dataDir: reader.dataDir,
          profiles: profiles.map((p) => ({ name: p })),
        };
      });

      return { success: true, data: browsers };
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
      // 创建默认配置
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
    // 返回默认配置
    const dirs = resolveCrossSyncDirs();
    return createDefaultConfig({
      dataDir: dirs.root,
      backupDir: dirs.backups,
      exportDir: dirs.exports,
      logDir: dirs.logs,
    });
  }
}
