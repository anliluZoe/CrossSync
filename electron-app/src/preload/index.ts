import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 同步相关
  sync: {
    run: (options: Record<string, unknown>) => ipcRenderer.invoke('sync:run', options),
    detectBrowsers: () => ipcRenderer.invoke('sync:detect-browsers'),
    readBookmarks: (browser: string) => ipcRenderer.invoke('sync:read-bookmarks', browser),
    readHistory: (browser: string) => ipcRenderer.invoke('sync:read-history', browser),
  },

  // 状态相关
  status: {
    get: () => ipcRenderer.invoke('status:get'),
    getConfig: () => ipcRenderer.invoke('config:get'),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  },

  // 备份相关
  backup: {
    run: () => ipcRenderer.invoke('backup:run'),
    list: () => ipcRenderer.invoke('backup:list'),
    prune: (keepCount: number) => ipcRenderer.invoke('backup:prune', keepCount),
  },
});
