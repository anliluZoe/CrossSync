# CrossSync

[![npm version](https://img.shields.io/npm/v/crosssync.svg)](https://www.npmjs.com/package/crosssync)
[![license](https://img.shields.io/npm/l/crosssync.svg)](./LICENSE)

跨浏览器书签与历史记录同步 CLI —— 定时同步 Chrome 和 Edge 的数据。

通过直接读取本地浏览器数据文件实现：**不需要浏览器扩展，不需要常驻进程，也没有实时同步**。
一次运行就是「读取 → 备份 → 合并 → 写回书签 → 导出 JSON」。

## 特性

- **纯 CLI**：没有扩展、没有 WebSocket、没有 token
- **双向合并书签**：按 `id` 递归归并，同 id 冲突保留 `date_added` 更新的那条
- **历史只读导出**：SQLite 复制后查询，按 URL 去重合并，绝不写回 `History.sqlite`
- **写前必备份**：备份失败则整次同步立即中止
- **不会踩坏浏览器**：写回前检测浏览器是否运行；写回时移除过期 `checksum`
- **跨平台定时任务**：Windows 任务计划程序 / macOS launchd / Linux systemd timer 或 crontab
- **跨平台路径解析**：Windows、macOS、Linux 的 Chrome/Edge 数据目录自动识别

## 环境要求

- Node.js **20 或更高版本**
- Chrome 和/或 Edge（Chromium 内核）

## 安装

```bash
npm install -g crosssync
```

使用 pnpm 全局安装时，需要允许 `better-sqlite3` 运行安装脚本：

```bash
pnpm add -g --allow-build=better-sqlite3 crosssync
```

如果从 GitHub 下载 `better-sqlite3` 预编译二进制失败，可以走 npmmirror：

```bash
npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 \
  npm install -g crosssync
```

## 快速开始

```bash
# 查看浏览器路径、profile、备份和定时任务状态
crosssync status

# 先预览，不碰任何文件
crosssync sync --bookmarks --dry-run

# 正式同步书签（会先自动备份，再写回）
crosssync sync --bookmarks

# 读取历史并导出 JSON（只读，不写回）
crosssync sync --history

# 完全只读，只导出合并结果
crosssync export --format json --out ./out
```

> 写回书签前请先退出 Chrome / Edge。浏览器运行中会跳过写回，必要时可用 `--force`
> 强制覆盖（有风险，不建议）。

## 命令

### `crosssync sync`

```bash
crosssync sync --bookmarks            # 只同步书签
crosssync sync --history              # 只同步历史（只读导出）
crosssync sync --all                  # 两者都做（默认）
crosssync sync --bookmarks --dry-run  # 预览，不写任何文件
crosssync sync --bookmarks --force    # 浏览器运行中也强制写回
crosssync sync --strategy export      # 完全只读
crosssync sync --browser edge         # 只处理 Edge
crosssync sync --profile all          # 处理所有 Chromium profile
crosssync sync --json                 # 机器可读报告
```

### `crosssync backup`

```bash
crosssync backup                     # 立即备份所有书签/历史文件
crosssync backup --list              # 列出已有备份
crosssync backup --prune --keep 10   # 只保留最近 10 份
```

### `crosssync export`

```bash
crosssync export --format json              # 写入 ~/.crosssync/export/
crosssync export --format json --out ./out  # 写入指定目录
crosssync export --format json --stdout     # 直接打印
```

### `crosssync status` / `crosssync logs`

```bash
crosssync status
crosssync status --json
crosssync logs --limit 50 --level warn
crosssync logs --clear
```

### `crosssync config`

```bash
crosssync config                      # 打印完整配置
crosssync config --path               # 打印配置文件路径
crosssync config --get exports.keep
crosssync config --set exports.keep=5
crosssync config --set sync.strategy=export
crosssync config --reset
```

### `crosssync install-cron` / `uninstall-cron`

```bash
crosssync install-cron                              # 默认每天 09:00
crosssync install-cron --expression "30 7 * * 1"    # 每周一 07:30
crosssync install-cron --dry-run
crosssync uninstall-cron
```

| 平台 | 机制 |
|---|---|
| Windows | 任务计划程序 |
| macOS | launchd |
| Linux | systemd user timer 或 crontab |

## 数据位置

所有运行数据位于 `~/.crosssync/`：

| 内容 | 位置 |
|---|---|
| 配置 | `~/.crosssync/config.json` |
| 备份 | `~/.crosssync/backups/<yyyyMMdd-HHmmss>/` |
| 导出 | `~/.crosssync/export/` |
| 日志 | `~/.crosssync/logs/crosssync.log`（JSONL） |

导出文件会自动清理：默认保留最近 `10` 个。可用
`crosssync config --set exports.keep=5` 调整，设为 `0` 关闭自动清理。
备份不会自动删除，需要时运行 `crosssync backup --prune --keep N`。

## 安全约定

- 写回任何浏览器文件前必先备份；备份失败即中止，不写回
- 写回书签前检测浏览器进程，运行中默认跳过（`--force` 可覆盖）
- 写回 `Bookmarks` 时移除 `checksum`，避免 Chromium 丢弃外部改动
- **从不写回 `History.sqlite`**（Chromium 运行期独占该文件）
- **从不读取**密码、Cookie、标签页数据
- 所有 JSON 落盘使用临时文件 + rename 原子替换
- 日志脱敏，不记录书签 URL / 标题

## 从源码构建

```bash
git clone https://github.com/anliluZoe/CrossSync.git
cd CrossSync
pnpm install
pnpm build
node packages/cli/dist/index.js --version
```

完整文档见仓库主页：https://github.com/anliluZoe/CrossSync

## License

[MIT](./LICENSE) © 2026 CrossSync contributors
