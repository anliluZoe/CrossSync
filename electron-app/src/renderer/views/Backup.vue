<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">💾 备份管理</h2>

    <!-- 创建备份 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">创建新备份</h3>
      <p class="text-gray-400 text-sm mb-4">
        备份将保存当前所有浏览器的书签和历史记录数据
      </p>
      <button
        @click="handleBackup"
        :disabled="backingUp"
        :class="[
          'px-6 py-2 rounded-lg font-semibold transition-colors',
          backingUp
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-primary-600 hover:bg-primary-700'
        ]"
      >
        {{ backingUp ? '⏳ 备份中...' : '📦 立即备份' }}
      </button>
    </div>

    <!-- 备份列表 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">备份列表</h3>
        <button
          v-if="backups.length > 0"
          @click="handlePrune"
          :disabled="pruning"
          class="px-4 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
        >
          {{ pruning ? '清理中...' : '清理旧备份' }}
        </button>
      </div>

      <div v-if="loading" class="text-gray-400">加载中...</div>
      <div v-else-if="backups.length === 0" class="text-gray-500 text-center py-8">
        暂无备份
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="backup in backups"
          :key="backup.id"
          class="p-4 bg-gray-700 rounded-lg flex items-center justify-between"
        >
          <div>
            <div class="font-semibold">{{ backup.id }}</div>
            <div class="text-sm text-gray-400">
              {{ formatDate(backup.createdAt) }} · {{ backup.fileCount }} 个文件
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Backup {
  id: string;
  createdAt: string;
  fileCount: number;
}

const loading = ref(false);
const backingUp = ref(false);
const pruning = ref(false);
const backups = ref<Backup[]>([]);

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
}

async function loadBackups() {
  loading.value = true;
  try {
    const res = await window.electronAPI.backup.list();
    if (res.success && res.data) {
      backups.value = res.data;
    }
  } finally {
    loading.value = false;
  }
}

async function handleBackup() {
  backingUp.value = true;
  try {
    const res = await window.electronAPI.backup.run();
    if (res.success) {
      alert('备份成功！');
      await loadBackups();
    } else {
      alert('备份失败: ' + res.error);
    }
  } finally {
    backingUp.value = false;
  }
}

async function handlePrune() {
  if (!confirm('确定要清理旧备份吗？将只保留最新的 5 个备份。')) {
    return;
  }

  pruning.value = true;
  try {
    const res = await window.electronAPI.backup.prune(5);
    if (res.success) {
      alert(`已删除 ${res.data?.deletedCount || 0} 个旧备份`);
      await loadBackups();
    }
  } finally {
    pruning.value = false;
  }
}

onMounted(loadBackups);
</script>
