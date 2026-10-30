<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold mb-4">📊 仪表板</h2>

    <!-- 浏览器状态 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">浏览器状态</h3>
      <div v-if="loading" class="text-gray-400">加载中...</div>
      <div v-else-if="error" class="text-red-400">{{ error }}</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="browser in browsers"
          :key="browser.name"
          :class="[
            'p-4 rounded-lg border',
            browser.running ? 'border-green-600 bg-green-900/20' : 'border-gray-600 bg-gray-700/30'
          ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-lg">{{ browser.label }}</h4>
              <p class="text-sm text-gray-400">{{ browser.dataDir }}</p>
            </div>
            <div
              :class="[
                'w-3 h-3 rounded-full',
                browser.running ? 'bg-green-500' : 'bg-red-500'
              ]"
            />
          </div>
          <div v-if="browser.profiles && browser.profiles.length > 0" class="mt-2">
            <p class="text-xs text-gray-500">配置文件 ({{ browser.profiles.length }}):</p>
            <div class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="profile in browser.profiles"
                :key="profile.name"
                class="px-2 py-1 bg-gray-700 rounded text-xs"
              >
                {{ profile.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div class="text-gray-400 text-sm mb-2">最后同步</div>
        <div class="text-2xl font-bold">{{ lastSync || '从未' }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div class="text-gray-400 text-sm mb-2">备份数量</div>
        <div class="text-2xl font-bold">{{ backupCount || 0 }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
        <div class="text-gray-400 text-sm mb-2">同步策略</div>
        <div class="text-2xl font-bold capitalize">{{ strategy || 'merge' }}</div>
      </div>
    </div>

    <!-- 快速操作 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">快速操作</h3>
      <div class="flex flex-wrap gap-3">
        <button
          @click="navigateTo('sync')"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
        >
          🔄 立即同步
        </button>
        <button
          @click="navigateTo('backup')"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          💾 立即备份
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface BrowserInfo {
  name: string;
  label: string;
  detected: boolean;
  running: boolean;
  dataDir: string;
  profiles?: { name: string }[];
}

const loading = ref(true);
const error = ref<string | null>(null);
const browsers = ref<BrowserInfo[]>([]);
const lastSync = ref<string | null>(null);
const backupCount = ref<number>(0);
const strategy = ref<string>('merge');

const emit = defineEmits<{
  navigate: [tab: string];
}>();

function navigateTo(tab: string) {
  emit('navigate', tab);
}

onMounted(async () => {
  try {
    const result = await window.electronAPI.sync.detectBrowsers();
    if (result.success && result.data) {
      browsers.value = result.data;
    }
  } catch (e) {
    error.value = '无法检测浏览器';
  } finally {
    loading.value = false;
  }
});
</script>
