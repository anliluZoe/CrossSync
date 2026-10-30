<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">⚙️ 设置</h2>

    <!-- 同步设置 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">同步设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">同步策略</label>
          <select
            :value="config?.sync?.strategy || 'merge'"
            @change="updateConfig('sync.strategy', ($event.target as HTMLSelectElement).value)"
            class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="merge">双向合并</option>
            <option value="export">只读导出</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">默认浏览器</label>
          <select
            :value="config?.sync?.defaultBrowser || 'all'"
            @change="updateConfig('sync.defaultBrowser', ($event.target as HTMLSelectElement).value)"
            class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">全部</option>
            <option value="chrome">Chrome</option>
            <option value="edge">Edge</option>
          </select>
        </div>

        <div class="flex items-center space-x-3">
          <input
            :checked="config?.sync?.forceWrite || false"
            @change="updateConfig('sync.forceWrite', ($event.target as HTMLInputElement).checked)"
            type="checkbox"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded"
          />
          <label class="text-sm">强制写回（即使浏览器正在运行）</label>
        </div>
      </div>
    </div>

    <!-- 备份设置 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">备份设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">自动备份保留数量</label>
          <input
            :value="config?.backup?.keepCount || 5"
            @change="updateConfig('backup.keepCount', Number(($event.target as HTMLInputElement).value))"
            type="number"
            min="1"
            max="100"
            class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>
    </div>

    <!-- 应用设置 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">应用设置</h3>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">开机自启</div>
            <div class="text-sm text-gray-400">启动系统时自动运行 CrossSync</div>
          </div>
          <button
            @click="toggleSetting('app.autoStart')"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              config?.app?.autoStart ? 'bg-primary-600' : 'bg-gray-600'
            ]"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                config?.app?.autoStart ? 'translate-x-6' : 'translate-x-1'
              ]"
            />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">最小化到托盘</div>
            <div class="text-sm text-gray-400">关闭窗口时最小化到系统托盘</div>
          </div>
          <button
            @click="toggleSetting('app.minimizeToTray')"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              config?.app?.minimizeToTray ? 'bg-primary-600' : 'bg-gray-600'
            ]"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                config?.app?.minimizeToTray ? 'translate-x-6' : 'translate-x-1'
              ]"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">关于</h3>
      <div class="text-gray-400 space-y-2">
        <p>CrossSync Desktop v1.0.0</p>
        <p class="text-sm">跨浏览器书签与历史同步工具</p>
        <p class="text-sm">MIT License</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Config {
  sync?: {
    strategy: string;
    defaultBrowser: string;
    forceWrite: boolean;
  };
  backup?: {
    keepCount: number;
  };
  app?: {
    autoStart: boolean;
    minimizeToTray: boolean;
  };
}

const config = ref<Config>({});

async function loadConfig() {
  try {
    const res = await window.electronAPI.status.getConfig();
    if (res.success && res.data) {
      config.value = res.data as Config;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

async function updateConfig(key: string, value: unknown) {
  try {
    const res = await window.electronAPI.status.setConfig(key, value);
    if (res.success) {
      await loadConfig();
    } else {
      alert('保存配置失败: ' + res.error);
    }
  } catch (e) {
    alert('保存配置失败: ' + (e instanceof Error ? e.message : String(e)));
  }
}

async function toggleSetting(key: string) {
  const keys = key.split('.');
  let current = config.value;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as any;
  }
  const newValue = !current[keys[keys.length - 1]];
  await updateConfig(key, newValue);
}

onMounted(loadConfig);
</script>
