<template>
  <div class="h-full flex flex-col bg-gray-900 text-gray-100">
    <!-- 顶部导航 -->
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <svg class="w-8 h-8 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0013.172 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h1 class="text-xl font-bold">CrossSync Desktop</h1>
        </div>
        <nav class="flex space-x-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="currentTab = tab.id"
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              currentTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            ]"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto p-6">
      <!-- 仪表板 -->
      <Dashboard v-if="currentTab === 'dashboard'" />

      <!-- 同步 -->
      <SyncView v-if="currentTab === 'sync'" />

      <!-- 备份 -->
      <BackupView v-if="currentTab === 'backup'" />

      <!-- 日志 -->
      <LogsView v-if="currentTab === 'logs'" />

      <!-- 设置 -->
      <SettingsView v-if="currentTab === 'settings'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Dashboard from './views/Dashboard.vue';
import SyncView from './views/Sync.vue';
import BackupView from './views/Backup.vue';
import LogsView from './views/Logs.vue';
import SettingsView from './views/Settings.vue';

const currentTab = ref('dashboard');

const tabs = [
  { id: 'dashboard', label: '📊 仪表板' },
  { id: 'sync', label: '🔄 同步' },
  { id: 'backup', label: '💾 备份' },
  { id: 'logs', label: '📋 日志' },
  { id: 'settings', label: '⚙️ 设置' },
];
</script>
