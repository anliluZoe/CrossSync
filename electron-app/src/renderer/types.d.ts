// Electron API 类型声明

export interface ElectronAPI {
  sync: {
    run: (options: Record<string, unknown>) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    supportedBrowsers: () => Promise<{
      success: boolean;
      data?: string[];
      error?: string;
    }>;
    detectBrowsers: () => Promise<{
      success: boolean;
      data?: Array<{
        name: string;
        label: string;
        detected: boolean;
        running: boolean;
        dataDir: string;
        profiles: Array<{ name: string }>;
      }>;
      error?: string;
    }>;
    readBookmarks: (browser: string, profile: string) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    readHistory: (browser: string, profile: string) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
  };
  status: {
    get: () => Promise<{
      success: boolean;
      data?: {
        browsers: Array<{
          name: string;
          label: string;
          detected: boolean;
          running: boolean;
          dataDir: string;
          profiles: Array<{ name: string; path: string }>;
        }>;
        config: Record<string, unknown>;
        logs: unknown[];
        lastSync: string | null;
      };
      error?: string;
    }>;
    getConfig: () => Promise<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
    }>;
    setConfig: (key: string, value: unknown) => Promise<{
      success: boolean;
      error?: string;
    }>;
  };
  backup: {
    run: () => Promise<{
      success: boolean;
      data?: { backupId: string; dir: string };
      error?: string;
    }>;
    list: () => Promise<{
      success: boolean;
      data?: Array<{
        id: string;
        createdAt: string;
        fileCount: number;
      }>;
      error?: string;
    }>;
    prune: (keepCount: number) => Promise<{
      success: boolean;
      data?: { deletedCount: number };
      error?: string;
    }>;
  };
  logs: {
    get: (limit?: number) => Promise<{
      success: boolean;
      data?: unknown[];
      error?: string;
    }>;
    clear: () => Promise<{
      success: boolean;
      error?: string;
    }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
