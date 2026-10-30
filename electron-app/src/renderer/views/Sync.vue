<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">🔄 手动同步</h2>

    <!-- 同步选项 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">同步内容</h3>
      <div class="space-y-3">
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            v-model="options.bookmarks"
            type="checkbox"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
          />
          <span>书签</span>
        </label>
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            v-model="options.history"
            type="checkbox"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
          />
          <span>历史记录</span>
        </label>
      </div>
    </div>

    <!-- 同步策略 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">同步策略</h3>
      <div class="flex space-x-4">
        <label class="flex items-center space-x-2 cursor-pointer">
          <input
            v-model="options.strategy"
            type="radio"
            value="merge"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 focus:ring-primary-500"
          />
          <span>双向合并（推荐）</span>
        </label>
        <label class="flex items-center space-x-2 cursor-pointer">
          <input
            v-model="options.strategy"
            type="radio"
            value="export"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 focus:ring-primary-500"
          />
          <span>只读导出</span>
        </label>
      </div>
    </div>

    <!-- 高级选项 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">高级选项</h3>
      <div class="space-y-3">
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            v-model="options.dryRun"
            type="checkbox"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
          />
          <div>
            <div>模拟运行</div>
            <div class="text-sm text-gray-400">不实际修改任何文件</div>
          </div>
        </label>
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            v-model="options.force"
            type="checkbox"
            class="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
          />
          <div>
            <div>强制同步</div>
            <div class="text-sm text-gray-400">即使浏览器正在运行也执行写回</div>
          </div>
        </label>
      </div>
    </div>

    <!-- 执行同步 -->
    <div class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <button
        @click="handleSync"
        :disabled="syncing"
        :class="[
          'w-full py-3 px-6 rounded-lg font-semibold transition-colors',
          syncing
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-primary-600 hover:bg-primary-700'
        ]"
      >
        {{ syncing ? '⏳ 同步中...' : '🚀 开始同步' }}
      </button>

      <!-- 进度条 -->
      <div v-if="syncing" class="mt-4">
        <div class="w-full bg-gray-700 rounded-full h-2">
          <div
            class="bg-primary-600 h-2 rounded-full transition-all"
            :style="{ width: progress + '%' }"
          ></div>
        </div>
        <p class="text-sm text-gray-400 mt-2">{{ statusMessage }}</p>
      </div>
    </div>

    <!-- 同步结果 -->
    <div v-if="result" class="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">同步结果</h3>
      <div v-if="result.success" class="space-y-2 text-green-400">
        <p>✅ 同步完成</p>
        <div v-if="result.data" class="text-sm text-gray-400">
          <p>开始时间: {{ new Date((result.data as any).startedAt).toLocaleString('zh-CN') }}</p>
          <p>结束时间: {{ new Date((result.data as any).finishedAt).toLocaleString('zh-CN') }}</p>
          <p>策略: {{ (result.data as any).strategy }}</p>
          <p v-if="(result.data as any).warnings?.length > 0" class="mt-2">
            警告:
            <ul class="list-disc list-inside mt-1">
              <li v-for="(warning, idx) in (result.data as any).warnings" :key="idx">
                {{ warning }}
              </li>
            </ul>
          </p>
        </div>
      </div>
      <div v-else class="text-red-400">
        <p>❌ 同步失败</p>
        <p class="text-sm mt-2">{{ result.error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const syncing = ref(false);
const progress = ref(0);
const statusMessage = ref('');
const result = ref<{ success: boolean; data?: unknown; error?: string } | null>(null);

const options = ref({
  bookmarks: true,
  history: true,
  strategy: 'merge',
  dryRun: false,
  force: false,
});

async function handleSync() {
  syncing.value = true;
  progress.value = 0;
  statusMessage.value = '准备同步...';
  result.value = null;

  try {
    progress.value = 20;
    statusMessage.value = '正在读取浏览器数据...';
    await new Promise((resolve) => setTimeout(resolve, 300));

    progress.value = 40;
    statusMessage.value = '正在合并数据...';
    const res = await window.electronAPI.sync.run(options.value);

    progress.value = 80;
    statusMessage.value = '正在写入结果...';
    await new Promise((resolve) => setTimeout(resolve, 300));

    progress.value = 100;
    statusMessage.value = '同步完成！';
    result.value = res;
  } catch (e) {
    result.value = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    setTimeout(() => {
      syncing.value = false;
      progress.value = 0;
      statusMessage.value = '';
    }, 1500);
  }
}
</script>
