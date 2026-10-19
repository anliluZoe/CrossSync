# CrossSync

跨浏览器书签与历史记录同步 CLI —— 定时同步 Chrome 和 Edge 的数据。

通过直接读取本地浏览器数据文件实现：**不需要浏览器扩展，不需要常驻进程，也没有实时同步**。
一次运行就是「读取 → 备份 → 合并 → 写回书签 → 导出 JSON」。

## 安装

```bash
npm install -g crosssync
```

使用 pnpm 全局安装时，需要允许 `better-sqlite3` 运行安装脚本：

```bash
pnpm add -g --allow-build=better-sqlite3 crosssync
```

## 使用

```bash
crosssync sync --bookmarks            # 只同步书签（会写回）
crosssync sync --bookmarks --dry-run  # 预览，不碰任何文件
crosssync sync --history              # 只读导出历史
crosssync sync --strategy export      # 完全只读，仅导出合并结果
crosssync status                      # 浏览器、备份与定时任务状态
crosssync install-cron                # 每天 09:00 自动同步
```

运行数据位于 `~/.crosssync/`（配置、备份、导出、日志）。

完整文档见仓库主页：https://github.com/anliluZoe/CrossSync

## License

MIT
