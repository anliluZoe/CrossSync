# CrossSync

跨浏览器书签与历史记录同步 CLI —— 定时同步 Chrome 和 Edge 的数据。

通过直接读取本地浏览器数据文件实现：**不需要浏览器扩展，不需要常驻进程，也没有实时同步**。
一次运行就是「读取 → 备份 → 合并 → 写回书签 → 导出 JSON」。

跨设备同步不经过 CrossSync 的任何服务器，而是依赖浏览器自己的账号同步：合并结果写回本机
`Bookmarks` 后，Chrome / Edge 在下次启动时把它上传到已登录的账号。

```bash
crosssync sync --bookmarks     # 读取两边书签，按 id + date_added 合并后写回
crosssync install-cron         # 装一个每天 09:00 的定时任务
crosssync status               # 看看浏览器、备份和定时任务的状态
```

## 特性

- **纯 CLI**：没有扩展、没有 WebSocket、没有 token
- **双向合并书签**：按 `guid` → 名称/URL → URL 递归匹配（不依赖各浏览器本地的 `id`），同一条冲突保留 `date_added` 更新的那条
- **历史只读导出**：SQLite 复制后查询，按 URL 去重合并，绝不写回 `History.sqlite`
- **写前必备份**：备份失败则整次同步立即中止
- **不会踩坏浏览器**：写回前检测浏览器是否运行；写回时移除过期 `checksum`
- **跨平台定时任务**：Windows 任务计划程序 / macOS launchd / Linux systemd timer 或 crontab
- **跨平台路径解析**：Windows、macOS、Linux 的 Chrome/Edge 数据目录自动识别

## 安装

### 从源码（开发）

```bash
git clone <repo>
cd CrossSync
pnpm install      # 会编译原生依赖 better-sqlite3
pnpm build
node packages/cli/dist/index.js --version
```

### 从 npm 安装（发布后）

```bash
npm install -g crosssync
crosssync --version
```

> 使用 pnpm 全局安装时，需要允许 `better-sqlite3` 运行安装脚本，例如
> `pnpm add -g --allow-build=better-sqlite3 crosssync`。
>
> 如果从 GitHub 下载 `better-sqlite3` 预编译二进制失败，可以走 npmmirror：
>
> ```bash
> npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 \
>   npm install -g crosssync
> ```

### 从本地 tarball 安装

不发布到 npm，也可以先打包再安装：

```bash
pnpm install
pnpm build
pnpm --dir packages/cli pack          # 生成 packages/cli/crosssync-0.1.0.tgz
npm install -g ./packages/cli/crosssync-0.1.0.tgz
crosssync --version
```

## 使用

### 同步

```bash
crosssync sync --bookmarks            # 只同步书签（会写回）
crosssync sync --history              # 只同步历史（只读 + 导出）
crosssync sync --all                  # 两者都做（默认）
crosssync sync --bookmarks --dry-run  # 预览，不碰任何文件
crosssync sync --bookmarks --force    # 浏览器正在运行也强制写回
crosssync sync --strategy export      # 完全只读，仅导出合并结果
crosssync sync --browser edge         # 只处理 Edge
crosssync sync --profile all          # 处理所有 Chromium profile
crosssync sync --json                 # 机器可读报告
```

`sync` 的执行顺序：

1. 定位 Chrome / Edge 的 `Bookmarks` 与 `History`
2. **备份**两边原始文件到 `~/.crosssync/backups/<时间戳>/`（失败即中止）
3. 读取（历史通过临时副本读取 SQLite）
4. 合并（书签按 `guid`/URL + `date_added`；历史按 `url`）
5. 写回书签（浏览器运行中默认跳过），并按需导出 JSON

### Profile 选择

```bash
crosssync profiles                                  # 列出可用 profile 和当前选择
crosssync profiles --set "Default,Profile 11,Profile 12"
crosssync profiles --add "Profile 9"
crosssync profiles --remove "Profile 11"
crosssync profiles --all                            # 选择所有 profile
crosssync profiles --reset                          # 恢复为 Default
```

当配置的 profile（默认 `Default`）在某个浏览器中不存在时，交互式终端会列出该浏览器的
所有 profile，让你按序号选择（支持多选，例如 `1,3`，或输入 `all`）。选择结果会写入
`~/.crosssync/config.json`，之后每次同步都会沿用；也可以用上面的 `profiles` 命令随时修改。

列表中的 profile 会附带显示 `Local State` 里记录的名称和已登录的 Google 账号（例如
`Profile 11  Roe(silk) <roe@example.com>`），这样可以直接认出每个 profile 对应哪个账号。
未登录的 profile 只显示本地名称。

配置值是各浏览器可用 profile 名称的并集：例如 `Default,Profile 11` 表示 Edge 使用
`Default`、Chrome 使用 `Profile 11`，某个浏览器中不存在的名称会被自动忽略。
也可以临时用 `--profile "Profile 11,Profile 12"` 覆盖，而不修改配置。

### 备份

```bash
crosssync backup                     # 立即备份所有书签/历史文件
crosssync backup --list              # 列出已有备份
crosssync backup --prune --keep 10   # 只保留最近 10 份
crosssync restore                    # 从最近一次备份恢复书签
crosssync restore 20261019-101603    # 恢复指定备份
crosssync restore --history          # 同时恢复 History 数据库
crosssync restore --dry-run          # 只预览恢复计划
```

`restore` 默认只恢复书签文件；写回 `History` 需要显式加 `--history`。恢复前会自动把
当前文件再备份一次，因此恢复本身也可以撤销。浏览器运行中默认跳过，`--force` 可覆盖。

### 导出

```bash
crosssync export --format json              # 写入 ~/.crosssync/export/
crosssync export --format json --out ./out  # 写入指定目录
crosssync export --format json --stdout     # 直接打印
```

### 状态与日志

```bash
crosssync status          # 浏览器数据目录、profile、备份数、定时任务状态
crosssync status --json
crosssync logs --limit 50 --level warn
crosssync logs --clear
```

### 定时任务

```bash
crosssync install-cron                       # 默认每天 09:00
crosssync install-cron --expression "30 7 * * 1"   # 每周一 07:30
crosssync install-cron --dry-run             # 只打印将要执行的计划
crosssync uninstall-cron
```

| 平台 | 机制 | 产物 |
|---|---|---|
| Windows | 任务计划程序 | `schtasks` 任务 `CrossSync`（DAILY / WEEKLY，固定时刻） |
| macOS | launchd | `~/Library/LaunchAgents/com.crosssync.sync.plist` |
| Linux | systemd user timer | `~/.config/systemd/user/crosssync-sync.{service,timer}` |
| Linux（无 systemd） | crontab | 带 `# crosssync` 标记的条目 |

### 跨设备同步（依赖浏览器账号）

CrossSync 只写本机的 `Bookmarks` 文件，**不连接任何在线服务**。另一台电脑上的书签来自
浏览器自己的账号同步：Chrome 同步到 Google 账号，Edge 同步到 Microsoft 账号。

要让 CrossSync 合并出的书签真正进入账号，需要同时满足：

1. **写回时浏览器已完全退出。** 浏览器运行中 CrossSync 默认跳过写回；此时不要用
   `--force` 强制写入——Chrome 退出时会用内存中的书签覆盖文件。
2. **写回后打开对应 profile 的浏览器。** Chrome / Edge 在启动时发现本地有未同步的书签，
   会把它们作为本地变更提交到账号。
3. **两台电脑登录同一账号并开启书签同步。** 可在 `chrome://settings/syncSetup` 检查；
   `chrome://sync-internals` 中能看到 Bookmarks 的提交记录。

推荐的手动流程：

```bash
# 1. 完全退出 Chrome / Edge
crosssync sync --bookmarks
# 2. 重新打开需要同步的 profile，等待一次同步完成
```

推荐的无人工干预流程（方式一）：把定时任务安排在浏览器肯定关闭的时段。

```bash
# 例如每天凌晨 03:00
crosssync install-cron --expression "0 3 * * *"
```

到点后 CrossSync 写回书签；下次打开浏览器时由浏览器上传到账号，另一台电脑随后收到。

注意事项：

- 定时任务要求到点时机器处于开机状态。Windows 任务计划程序默认不会补跑错过的任务。
- 合并结果会写进所有选中的 profile，但每个 profile 只在被打开时才会上传到它自己的账号。
  想让某个账号拿到全部书签，请在同步后打开该账号对应的 profile。
- 只有**新增书签**能可靠上传。对已有书签的改名、移动、删除是文件层面的修改，浏览器启动时
  不一定会当作本地变更提交，且可能以服务器版本为准——这是浏览器账号同步的机制限制。
- 不需要 `import` 或手动导出文件；`crosssync export` 只是只读导出，不参与跨设备同步。

### 配置

```bash
crosssync config                      # 打印完整配置
crosssync config --path               # 打印配置文件路径
crosssync config --get sync.strategy
crosssync config --set sync.strategy=export
crosssync config --set browsers.edge.enabled=false
crosssync config --set exports.keep=5
crosssync config --reset
```

配置文件位于 `~/.crosssync/config.json`，也支持通过 CLI 参数临时覆盖（如 `--browser`、`--profile`）。

`exports.keep`（默认 `10`）控制自动保留的导出文件数量：每次成功的 `sync` / `export`
写入新文件后，会删除较旧的 CrossSync 导出文件，只保留最近 N 个；设为 `0` 可关闭自动清理。
清理只会匹配 `bookmarks-merged-*.json`、`history-merged-*.json` 和
`crosssync-export-*.json`，不会动目录里的其他文件；`--out` 指定的自定义目录也不会被清理。

## 数据与安全

| 内容 | 位置 |
|---|---|
| 配置 | `~/.crosssync/config.json` |
| 备份 | `~/.crosssync/backups/<yyyyMMdd-HHmmss>/` |
| 导出 | `~/.crosssync/export/` |
| 日志 | `~/.crosssync/logs/crosssync.log`（JSONL） |

安全约定：

- 写回任何浏览器文件前必先备份；备份失败即中止，不写回
- 写回书签前检测浏览器进程，运行中默认跳过（`--force` 可覆盖）
- 写回 `Bookmarks` 时移除 `checksum`，避免 Chromium 丢弃外部改动
- **从不写回 `History.sqlite`**（Chromium 运行期独占该文件）
- **从不读取**密码、Cookie、标签页数据
- 所有 JSON 落盘使用临时文件 + rename 原子替换
- 日志脱敏，不记录书签 URL / 标题

## 开发

```bash
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest
pnpm build       # tsc (shared/core) + tsup bundle (cli)
pnpm format      # Prettier
```

请按 `lint -> typecheck -> test -> build` 顺序本地验证。项目总纲见 `CLAUDE.md` / `.cursorrules`，
产品说明见 `产品说明.md`。

### 从源码跑 CLI

```bash
pnpm build
node packages/cli/dist/index.js --home-dir /tmp/crosssync-demo status
```

`--home-dir` 会把 `~/.crosssync` 重定向到指定目录，方便试验（不会动真实数据）。

## CI

`.github/workflows/ci.yml` 在 push / PR 到 `main`/`master` 时执行：
`pnpm install` → `typecheck` → `test` → `build` → `lint`。

## 发布到 npm

`.github/workflows/publish.yml` 是手动触发的发布流程：

1. 在 npm 账号中创建带发布权限的 token（CI 建议使用 Automation token，可绕过 2FA）；
2. 在 GitHub 仓库 `Settings → Secrets and variables → Actions` 添加 `NPM_TOKEN`；
3. 同时修改两处版本号：`packages/cli/package.json` 和
   `packages/cli/src/constants.ts` 里的 `CLI_VERSION`；
4. 提交并推送后，进入 `Actions → Publish to npm → Run workflow`：
   - 勾选 `dry_run` 只验证打包，不会上传；
   - 工作流会依次执行 `lint → typecheck → test → build`，并检查该版本是否已存在。

首次发布成功后，可以在 npm 包设置中配置 Trusted Publishing（GitHub Actions），
之后即可删除 `NPM_TOKEN`。

## License

MIT
