<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold">📋 同步日志</h2>
      <div class="flex space-x-2">
        <button
          @click="loadLogs"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          🔄 刷新
        </button>
        <button
          @click="handleClear"
          :disabled="clearing"
          class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          {{ clearing ? '清理中...' : '🗑️ 清空' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-gray-400">加载中...</div>
    <div v-else-if="logs.length === 0" class="text-gray-500 text-center py-8">
      暂无日志
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="log in logs"
        :key="log.id"
        :class="[
          'p-4 rounded-lg',
          log.level === 'error' ? 'bg-red-900/30 border border-red-800' :
          log.level === 'warn' ? 'bg-yellow-900/30 border border-yellow-800' :
          'bg-gray-800'
        ]"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-2">
            <span
              :class="[
                'px-2 py-0.5 rounded text-xs font-semibold',
                log.level === 'error' ? 'bg-red-600' :
                log.level === 'warn' ? 'bg-yellow-600' :
                log.level === 'debug' ? 'bg-gray-600' :
                'bg-blue-600'
              ]"
            >
              {{ log.level.toUpperCase() }}
            </span>
            <span class="text-sm text-gray-400">{{ formatTime(log.timestamp) }}</span>
          </div>
        </div>
        <p class="mt-2 text-gray-200">{{ log.message }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

const loading = ref(false);
const clearing = ref(false);
const logs = ref<LogEntry[]>([]);

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

async function loadLogs() {
  loading.value = true;
  try {
    const res = await window.electronAPI.logs.get(50);
    if (res.success && res.data) {
      logs.value = res.data as LogEntry[];
    }
  } finally {
    loading.value = false;
  }
}

async function handleClear() {
  if (!confirm('确定要清空所有日志吗？')) {
    return;
  }

  clearing.value = true;
  try {
    await window.electronAPI.logs.clear();
    logs.value = [];
  } finally {
    clearing.value = false;
  }
}

onMounted(loadLogs);
</script>
