# CrossSync Desktop — 快速开始指南

## 🚀 5 分钟快速启动

### 前提条件

确保已安装：
- **Node.js** 20+ ([下载地址](https://nodejs.org/))
- **pnpm** 10+ (`npm install -g pnpm`)

### 一键启动

**Windows**:
```bash
cd electron-app
scripts\dev.bat
```

**macOS/Linux**:
```bash
cd electron-app
chmod +x scripts/dev.sh
./scripts/dev.sh
```

或手动启动：
```bash
cd electron-app
pnpm install
pnpm dev
```

✅ **就是这么简单！** 应用窗口会自动打开。

---

## 📋 功能说明

### 📊 仪表板

**位置**: 首页

**功能**:
- 查看 Chrome/Edge 安装状态
- 查看浏览器是否正在运行
- 查看已配置的配置文件
- 快速访问同步和备份

**使用**:
1. 打开应用，默认显示仪表板
2. 绿色圆点 = 浏览器正在运行
3. 红色圆点 = 浏览器未运行
4. 点击"立即同步"跳转到同步页面

---

### 🔄 手动同步（核心功能 ⭐）

**位置**: 同步标签页

**功能**:
- 一键同步书签和历史记录
- 实时进度显示
- 同步结果展示

**使用**:
1. 点击顶部导航的"🔄 同步"
2. 选择同步内容：
   - ✅ 书签（推荐）
   - ✅ 历史记录
3. 选择同步策略：
   - **双向合并（推荐）**：智能合并，保留最新数据
   - **只读导出**：不修改浏览器文件，仅导出
4. 高级选项：
   - ☑️ 模拟运行：预览但不实际修改
   - ☑️ 强制同步：即使浏览器运行也写回
5. 点击"🚀 开始同步"
6. 等待完成，查看结果

**注意事项**:
- ⚠️ 同步前会自动备份，无需手动备份
- ⚠️ 浏览器运行时默认跳过写回，使用"强制同步"覆盖
- ⚠️ 建议首次使用先"模拟运行"预览

---

### 💾 备份管理

**位置**: 备份标签页

**功能**:
- 一键创建完整备份
- 查看所有备份
- 清理旧备份

**使用**:
1. 点击顶部导航的"💾 备份"
2. **创建备份**:
   - 点击"📦 立即备份"
   - 等待完成
3. **查看备份**:
   - 备份列表显示 ID、时间、文件数
4. **清理备份**:
   - 点击"清理旧备份"
   - 保留最新的 5 个（可配置）

**恢复备份**:
- 目前需要在 CLI 中操作：
  ```bash
  crosssync restore <backup-id>
  ```
- 后续版本会添加 GUI 恢复功能

---

### 📋 日志查看

**位置**: 日志标签页

**功能**:
- 查看同步日志
- 按级别筛选（Debug/Info/Warning/Error）
- 清空日志

**使用**:
1. 点击顶部导航的"📋 日志"
2. 查看最近的 50 条日志
3. 点击"🔄 刷新"更新
4. 点击"🗑️ 清空"删除所有日志

**日志级别**:
- 🔵 **INFO**（蓝色）：普通信息
- 🟡 **WARN**（黄色）：警告
- 🔴 **ERROR**（红色）：错误
- ⚪ **DEBUG**（灰色）：调试信息

---

### ⚙️ 设置

**位置**: 设置标签页

**功能**:
- 同步策略配置
- 备份设置
- 应用行为设置

**使用**:

#### 同步设置
- **同步策略**：选择"双向合并"或"只读导出"
- **默认浏览器**：Chrome / Edge / 全部
- **强制写回**：覆盖浏览器运行检测

#### 备份设置
- **自动备份保留数量**：默认 5 个

#### 应用设置
- **开机自启**：启用后随系统启动（待实现）
- **最小化到托盘**：关闭窗口时隐藏到托盘

---

## 🎯 常见使用场景

### 场景 1: 首次使用

1. **启动应用**
   ```bash
   pnpm dev
   ```

2. **检查浏览器状态**
   - 打开"📊 仪表板"
   - 确认 Chrome/Edge 被检测到

3. **首次同步**
   - 进入"🔄 同步"
   - 勾选"书签"
   - 勾选"模拟运行"
   - 点击"🚀 开始同步"
   - 查看预览结果

4. **正式同步**
   - 取消"模拟运行"
   - 点击"🚀 开始同步"
   - 等待完成

---

### 场景 2: 定期同步

**方式 A**: 使用系统定时任务（当前推荐）

Windows:
```bash
crosssync install-cron --expression "0 9 * * *"
```

macOS/Linux:
```bash
crosssync install-cron --expression "0 9 * * *"
```

**方式 B**: 等待 GUI 定时配置（待实现）

---

### 场景 3: 恢复误删书签

1. **查看备份列表**
   - 进入"💾 备份"
   - 找到合适的备份 ID

2. **通过 CLI 恢复**（待 GUI 实现）
   ```bash
   crosssync restore <backup-id>
   ```

---

### 场景 4: 查看同步历史

1. **查看日志**
   - 进入"📋 日志"
   - 滚动查看历史记录

2. **查看导出文件**
   ```bash
   # Windows
   explorer %USERPROFILE%\.crosssync\export

   # macOS/Linux
   open ~/.crosssync/export
   ```

---

## ⚠️ 重要提示

### 安全建议

1. **首次使用先备份**
   ```bash
   # 在应用内点击"立即备份"
   # 或使用 CLI
   crosssync backup
   ```

2. **首次同步建议"模拟运行"**
   - 预览将要发生的改动
   - 确认无误后再实际操作

3. **注意浏览器运行状态**
   - 浏览器运行时默认不写回
   - 使用"强制同步"需谨慎

4. **保留备份**
   - 定期清理旧备份
   - 重要操作前手动备份

### 文件位置

| 文件 | Windows | macOS/Linux |
|------|---------|-------------|
| **配置文件** | `%USERPROFILE%\.crosssync\config.json` | `~/.crosssync/config.json` |
| **备份目录** | `%USERPROFILE%\.crosssync\backups\` | `~/.crosssync/backups/` |
| **导出目录** | `%USERPROFILE%\.crosssync\export\` | `~/.crosssync/export/` |
| **日志文件** | `%USERPROFILE%\.crosssync\logs\crosssync.log` | `~/.crosssync/logs/crosssync.log` |

---

## 🐛 问题排查

### 问题 1: 应用无法启动

**症状**: 点击启动没反应

**解决**:
```bash
# 1. 检查 Node.js 版本
node --version  # 应该 >= 20

# 2. 重新安装依赖
cd electron-app
rm -rf node_modules package-lock.json pnpm-lock.yaml
pnpm install

# 3. 清理构建缓存
rm -rf out/
pnpm build
pnpm dev
```

---

### 问题 2: 无法检测到浏览器

**症状**: 仪表板显示浏览器未检测到

**解决**:
1. 确认 Chrome/Edge 已安装
2. 检查浏览器配置目录：
   - Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data\`
   - Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\`
3. 尝试手动指定数据目录（待实现）

---

### 问题 3: 同步失败

**症状**: 点击同步后报错

**解决**:
1. 查看"📋 日志"了解详细错误
2. 确认浏览器未运行（或使用"强制同步"）
3. 检查配置文件：
   ```bash
   crosssync config --path
   ```
4. 尝试恢复备份：
   ```bash
   crosssync restore
   ```

---

### 问题 4: 开发模式卡住

**症状**: `pnpm dev` 启动后 Electron 窗口不显示

**解决**:
1. 检查端口 5173 是否被占用
2. 查看终端错误信息
3. 尝试清理重启：
   ```bash
   # 杀死所有 Node 进程
   taskkill /F /IM node.exe  # Windows
   killall node              # macOS/Linux

   # 重新启动
   pnpm dev
   ```

---

## 📚 更多资源

- **详细开发文档**: [GUIDE.md](./GUIDE.md)
- **项目总结**: [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)
- **产品说明**: [../产品说明.md](../产品说明.md)
- **项目章程**: [../CLAUDE.md](../CLAUDE.md)
- **CLI 工具**: [../packages/cli/README.md](../packages/cli/README.md)

---

## 🤝 贡献

发现 Bug？有功能建议？

1. 提交 [Issue](https://github.com/anliluZoe/CrossSync/issues)
2. 提交 [Pull Request](https://github.com/anliluZoe/CrossSync/pulls)

---

## 📄 许可证

MIT License

---

**当前版本**: v1.0.0-alpha
**最后更新**: 2024-10-30
**状态**: ✅ MVP 完成，可测试

**下一步**: 启动应用，尝试手动同步！🚀
