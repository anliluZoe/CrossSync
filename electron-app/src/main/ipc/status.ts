import { ipcMain } from 'electron';
import { createConfiguredBrowserReaders } from '@crosssync/core/readers';
import { getRunningBrowsers } from '@crosssync/core/browser-status';
import { readLogEntries, clearLogFile } from '@crosssync/core/logger';
import {
  createDefaultConfig,
  resolveCrossSyncDirs,
  readJsonFile,
  isCliConfig,
} from '@crosssync/shared';
import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs/promises';

export function registerStatusHandlers() {
  // 获取完整状态
  ipcMain.handle('status:get', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);

      // 获取浏览器状态
      const runningBrowsers = getRunningBrowsers();
      const readers = createConfiguredBrowserReaders(config);

      const browserStatus = readers.map((reader) => {
        const profiles = reader.profiles();
        const running = runningBrowsers.find((b) => b.browser === reader.browser);

        return {
          name: reader.browser,
          label: reader.browser === 'chrome' ? 'Chrome' : 'Edge',
          detected: true,
          running: running?.running ?? false,
          dataDir: reader.dataDir,
          profiles: profiles.map((p) => ({ name: p, path: reader.profileDir(p) })),
        };
      });

      // 读取日志
      const logPath = join(homeDir, 'logs', 'crosssync.log');
      const recentLogs = readLogEntries(logPath, { limit: 50 });

      return {
        success: true,
        data: {
          browsers: browserStatus,
          config,
          logs: recentLogs,
          lastSync: recentLogs[0]?.timestamp || null,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 获取配置
  ipcMain.handle('config:get', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const config = loadConfig(dirs.configFile);
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 修改配置
  ipcMain.handle('config:set', async (_event, key: string, value: unknown) => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const configFile = dirs.configFile;

      const config = loadConfig(configFile);

      // 支持嵌套 key，例如 "sync.strategy"
      const keys = key.split('.');
      let current: Record<string, unknown> = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]] = value;

      await fs.writeFile(configFile, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 获取日志
  ipcMain.handle('logs:get', async (_event, limit = 50) => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const logPath = join(dirs.logs, 'crosssync.log');
      const logs = readLogEntries(logPath, { limit });
      return { success: true, data: logs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 清空日志
  ipcMain.handle('logs:clear', async () => {
    try {
      const homeDir = join(homedir(), '.crosssync');
      const dirs = resolveCrossSyncDirs(homeDir);
      const logPath = join(dirs.logs, 'crosssync.log');
      clearLogFile(logPath);
      return { success: true };
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
