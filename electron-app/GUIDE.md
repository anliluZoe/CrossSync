# CrossSync Desktop — 桌面应用

🎉 **恭喜！CrossSync Desktop 桌面应用已创建完成！**

## 📦 项目结构

```
D:\learning\CrossSync\
├── packages/                  # 原有 CLI 工具包
│   ├── shared/               # 共享类型和工具
│   ├── core/                 # 核心同步引擎
│   └── cli/                  # CLI 命令行工具
└── electron-app/             ✨ 新增的桌面应用
    ├── src/
    │   ├── main/             # Electron 主进程
    │   │   ├── index.ts      # 主进程入口
    │   │   ├── tray.ts       # 系统托盘
    │   │   └── ipc/          # IPC 通信处理器
    │   │       ├── sync.ts   # 同步相关
    │   │       ├── status.ts # 状态查询
    │   │       └── backup.ts # 备份管理
    │   ├── preload/          # 预加载脚本
    │   │   └── index.ts      # 暴露 API 给渲染进程
    │   └── renderer/         # Vue 3 前端界面
    │       ├── App.vue       # 根组件
    │       └── views/        # 页面组件
    │           ├── Dashboard.vue  # 仪表板
    │           ├── Sync.vue       # 手动同步 ⭐
    │           ├── Backup.vue     # 备份管理
    │           ├── Logs.vue       # 日志查看
    │           └── Settings.vue   # 设置
    ├── public/               # 静态资源
    ├── package.json
    ├── electron.vite.config.ts
    ├── electron-builder.yml
    └── README.md
```

## ✨ 已实现功能

### ✅ P0 - 核心功能（已完成）

1. **手动同步** — 通过 GUI 执行书签和历史同步
   - ✅ 可选的同步内容（书签/历史）
   - ✅ 同步策略选择（双向合并/只读导出）
   - ✅ 高级选项（模拟运行/强制同步）
   - ✅ 实时进度显示
   - ✅ 同步结果展示

2. **状态监控** — 仪表板页面
   - ✅ 浏览器检测（Chrome/Edge）
   - ✅ 浏览器运行状态
   - ✅ 配置文件列表
   - ✅ 快速操作入口

3. **备份管理** — 创建和列出备份
   - ✅ 一键创建备份
   - ✅ 备份列表查看
   - ✅ 清理旧备份

4. **日志查看** — 实时日志
   - ✅ 日志列表展示
   - ✅ 日志级别标识
   - ✅ 清空日志功能

5. **配置管理** — 可视化配置编辑
   - ✅ 同步策略设置
   - ✅ 备份保留数量
   - ✅ 应用设置（开机自启/最小化到托盘）

### ⏳ P1 - 待实现功能

- 定时任务配置界面
- 一键打开配置文件/日志文件夹
- 浏览器数据目录自定义

### 📋 P2 - 优化项

- 系统托盘菜单增强
- 启动项管理
- 通知提醒
- 更多主题支持

## 🚀 快速开始

### 环境要求

- Node.js 20+
- pnpm 10+

### 安装依赖

```bash
# 从根目录安装所有工作区依赖
pnpm install
```

### 开发模式

```bash
cd electron-app
pnpm dev
```

这将启动：
- ✅ Electron 主进程
- ✅ Vite 开发服务器 (http://localhost:5173)
- ✅ 自动打开 DevTools

### 构建项目

```bash
# 构建所有包（包括桌面应用）
cd ..
pnpm build

# 或只构建桌面应用
cd electron-app
pnpm build
```

### 打包发布

```bash
# 构建后打包
cd electron-app
pnpm exec electron-builder
```

这将生成：
- **Windows**: `.exe` 安装程序 / 便携版
- **macOS**: `.dmg` 镜像 / `.zip`
- **Linux**: `.AppImage` / `.deb`

## 🔧 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| **Electron** | ^30.0.0 | 跨平台桌面框架 |
| **Vue 3** | ^3.4.0 | 渐进式前端框架 |
| **TypeScript** | ^5.3.0 | 类型安全 |
| **Vite** | ^8.3.5 | 极速构建工具 |
| **Tailwind CSS** | ^3.4.0 | 原子化 CSS |
| **electron-vite** | ^6.0.0 | Electron + Vite 整合 |
| **electron-builder** | ^24.9.0 | 打包发布 |

## 🏗️ 架构设计

### 主进程 (Main Process)

- **职责**：系统交互、文件操作、子进程管理
- **IPC 接口**：通过 `ipcMain` 暴露 API 给渲染进程
- **安全**：所有 Node.js 操作都在主进程，渲染进程只通过 preload 脚本通信

### 预加载脚本 (Preload)

- **职责**：安全地暴露有限的 API 给渲染进程
- **机制**：使用 `contextBridge` 暴露 `window.electronAPI`
- **安全**：禁用 Node.js 集成，开启上下文隔离

### 渲染进程 (Renderer)

- **职责**：UI 展示、用户交互
- **技术**：Vue 3 + Composition API + TypeScript
- **样式**：Tailwind CSS
- **通信**：通过 `window.electronAPI` 调用主进程功能

## 🔐 安全设计

1. **上下文隔离**：渲染进程无法直接访问 Node.js API
2. **禁用 Node.js 集成**：`nodeIntegration: false`
3. **沙箱模式**：`sandbox: false`（需要 Node.js API，但通过 preload 安全暴露）
4. **预加载脚本**：只暴露必要的 API，不暴露完整的 Node.js
5. **IPC 验证**：主进程对所有 IPC 消息进行验证

## 📡 IPC API 设计

### 同步相关

```typescript
// 执行同步
window.electronAPI.sync.run({
  bookmarks: true,
  history: true,
  strategy: 'merge',
  dryRun: false,
  force: false
})

// 检测浏览器
window.electronAPI.sync.detectBrowsers()

// 读取书签
window.electronAPI.sync.readBookmarks('chrome', 'Default')
```

### 状态相关

```typescript
// 获取完整状态
window.electronAPI.status.get()

// 获取配置
window.electronAPI.status.getConfig()

// 设置配置
window.electronAPI.status.setConfig('sync.strategy', 'export')
```

### 备份相关

```typescript
// 创建备份
window.electronAPI.backup.run()

// 列出备份
window.electronAPI.backup.list()

// 清理备份
window.electronAPI.backup.prune(5)
```

## 🎨 UI 预览

### 仪表板
- 浏览器状态卡片（绿色=运行中，红色=未运行）
- 统计信息卡片（最后同步时间、备份数量、同步策略）
- 快速操作按钮

### 同步页面
- 同步内容选择（书签/历史）
- 同步策略选择
- 高级选项（模拟运行/强制同步）
- 实时进度条
- 结果展示

### 备份管理
- 一键创建备份
- 备份列表（ID、时间、文件数）
- 清理旧备份

### 日志查看
- 彩色日志级别标识
- 时间戳
- 日志详情

### 设置
- 同步策略配置
- 备份保留数量
- 开机自启开关
- 最小化到托盘开关

## 📦 依赖复用

桌面应用直接复用了 CLI 的核心逻辑：

```typescript
// 导入核心模块
import { runSync } from '@crosssync/core/sync';
import { createBackup, listBackups, pruneBackups } from '@crosssync/core/backup';
import { createConfiguredBrowserReaders } from '@crosssync/core/readers';
import { getRunningBrowsers } from '@crosssync/core/browser-status';
import { readLogEntries, clearLogFile } from '@crosssync/core/logger';
import { createDefaultConfig, resolveCrossSyncDirs, isCliConfig } from '@crosssync/shared';
```

**好处**：
- ✅ 无需重写核心逻辑
- ✅ 自动获得 CLI 的所有 bug 修复和新功能
- ✅ 代码复用率高，维护成本低

## 🐛 已知问题

1. **模块类型警告**：postcss.config.js 缺少 `"type": "module"`
   - 不影响功能，可忽略
   - 或在 package.json 添加 `"type": "module"`

2. **@vitejs/plugin-vue 版本警告**：与 Vite 8 的 peer dependency 不匹配
   - 目前功能正常
   - 建议后续升级到 plugin-vue 最新版

3. **图标文件缺失**：托盘图标和窗口图标使用占位
   - 需要准备 `.ico` (Windows) 和 `.icns` (macOS) 图标

4. **开发模式需要 Electron 下载**：首次运行会下载 Electron 二进制
   - 需要网络连接
   - 或使用国内镜像

## 🔜 下一步建议

### 短期（1-2 天）

1. **修复图标**：准备跨平台图标文件
   - Windows: `build/icon.ico` (256x256)
   - macOS: `build/icon.icns` (512x512)
   - Linux: `build/icon.png` (512x512)

2. **完善托盘菜单**
   - 添加同步状态
   - 添加快速操作

3. **错误处理优化**
   - 添加错误边界
   - 优化错误提示

### 中期（3-5 天）

1. **定时同步配置界面**
   - 同步频率设置
   - 时间选择器
   - 启用/禁用开关

2. **启动项管理**
   - 开机自启开关（跨平台实现）
   - 最小化到系统托盘

3. **通知系统**
   - 同步完成通知
   - 错误提醒
   - 备份成功通知

### 长期（1-2 周）

1. **性能优化**
   - 虚拟滚动（大量日志）
   - 懒加载
   - 缓存策略

2. **用户体验**
   - 暗色/亮色主题切换
   - 多语言支持
   - 快捷键支持

3. **发布准备**
   - CI/CD 自动化打包
   - 自动更新机制（electron-updater）
   - 安装程序签名

## 📝 开发技巧

### 调试主进程

```bash
# 方式 1: 使用 DevTools（开发模式已自动打开）
# 方式 2: 附加调试器
electron --inspect-browser=9222
```

### 调试渲染进程

- `Ctrl+Shift+I` (Windows/Linux)
- `Cmd+Option+I` (macOS)

### 查看日志

```bash
# 应用日志
cat ~/.crosssync/logs/crosssync.log

# Electron 主进程日志
# 在 DevTools Console 查看
```

### 清理构建

```bash
# 删除构建产物
rm -rf out/ dist/

# 重新安装依赖
pnpm install
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License — 与 CrossSync CLI 保持一致

---

**状态**: ✅ 项目已搭建完成，核心功能可运行
**下一步**: 运行 `pnpm dev` 启动开发模式，开始测试和优化！
