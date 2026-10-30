# CrossSync Desktop

CrossSync Desktop 是一个跨浏览器书签与历史同步工具，支持 Chrome 和 Edge 浏览器。

## ✨ 特性

- 📊 **实时状态监控** — 检测浏览器安装和配置文件状态
- 🔄 **一键同步** — 手动同步书签和历史记录
- 💾 **自动备份** — 同步前自动备份，支持恢复
- ⚙️ **可视化配置** — 通过图形界面管理所有设置
- 📋 **日志查看** — 实时查看同步日志
- 🔔 **系统托盘** — 后台运行，快速访问

## 🚀 快速开始

### 环境要求

- Node.js 20+
- pnpm 10+

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 打包

```bash
pnpm run build
# 打包会在 release/ 目录生成安装包
```

## 🏗️ 项目结构

```
electron-app/
├── src/
│   ├── main/          # Electron 主进程
│   │   ├── index.ts   # 主进程入口
│   │   ├── tray.ts    # 系统托盘
│   │   └── ipc/       # IPC 通信处理器
│   ├── preload/       # 预加载脚本
│   │   └── index.ts   # 暴露 API 给渲染进程
│   └── renderer/      # Vue 3 渲染进程
│       ├── App.vue    # 根组件
│       └── views/     # 页面组件
│           ├── Dashboard.vue  # 仪表板
│           ├── Sync.vue       # 同步页面
│           ├── Backup.vue     # 备份管理
│           ├── Logs.vue       # 日志查看
│           └── Settings.vue   # 设置
├── public/            # 静态资源
├── electron.vite.config.ts
└── package.json
```

## 🔧 开发指南

### 技术栈

- **Electron** — 跨平台桌面应用框架
- **Vue 3** — 渐进式 JavaScript 框架
- **TypeScript** — 类型安全的 JavaScript
- **Tailwind CSS** — 实用优先的 CSS 框架
- **Vite** — 下一代前端构建工具

### IPC 通信

渲染进程通过 `window.electronAPI` 调用主进程功能：

```typescript
// 同步书签
const result = await window.electronAPI.sync.run({
  bookmarks: true,
  history: false,
  browser: 'all',
  strategy: 'merge'
});

// 检测浏览器
const browsers = await window.electronAPI.sync.detectBrowsers();

// 创建备份
const backup = await window.electronAPI.backup.run();
```

### 工作区依赖

本应用依赖于 monorepo 中的其他包：

- `@crosssync/core` — 核心同步逻辑
- `@crosssync/shared` — 共享类型和工具

确保从根目录安装依赖：

```bash
pnpm install
```

## 📝 配置

配置文件位于 `~/.crosssync/config.json`：

```json
{
  "sync": {
    "strategy": "merge",
    "defaultBrowser": "all",
    "forceWrite": false
  },
  "backup": {
    "keepCount": 5
  },
  "app": {
    "autoStart": true,
    "minimizeToTray": true
  }
}
```

## 🐛 调试

### 开发工具

开发模式下会自动打开 DevTools。也可以使用：

```bash
# 主进程调试
electron --inspect-browser

# 渲染进程调试
Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (macOS)
```

### 日志

应用日志位于 `~/.crosssync/logs/crosssync.log`

## 🚢 发布

### 自动发布

CI/CD 工作流在 GitHub Actions 中配置，推送到 main 分支会自动触发构建和发布。

### 手动发布

```bash
# 构建应用
pnpm build

# 打包安装程序
pnpm exec electron-builder

# 打包并发布
pnpm exec electron-builder --publish always
```

## 📄 许可证

MIT License - 详见 [LICENSE](../LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

- GitHub: https://github.com/anliluZoe/CrossSync
- Issues: https://github.com/anliluZoe/CrossSync/issues
