# CI/CD 配置完整说明

## 📋 已配置的 GitHub Actions Workflows

### ✅ Workflow 1: CI — 持续集成

**文件**: `.github/workflows/ci.yml`

**触发条件**:
- Push 到 main/master 分支
- Pull Request 到 main/master 分支

**执行步骤**:
1. ✅ Checkout 代码
2. ✅ 安装 pnpm
3. ✅ 安装依赖 (`pnpm install --frozen-lockfile`)
4. ✅ TypeScript 类型检查 (`pnpm typecheck`)
5. ✅ 运行测试 (`pnpm test`)
6. ✅ 构建所有包 (`pnpm build`)
7. ✅ ESLint 代码检查 (`pnpm lint`)
8. ✅ **构建 Electron 应用** ⭐ (新增)
9. ✅ CLI 冒烟测试

**新增内容** (v1.0.0):
```yaml
- name: Build Electron app
  run: cd electron-app && pnpm build
  env:
    ELECTRON_SKIP_BINARY_DOWNLOAD: true
```

**运行时间**: ~5-10 分钟

---

### ✅ Workflow 2: Build Electron App — PR 自动打包

**文件**: `.github/workflows/build-electron.yml`

**触发条件**:
- Push 到 main/master 分支
- Pull Request 到 main/master 分支

**执行步骤**:
1. ✅ Checkout 代码
2. ✅ 安装 pnpm + Node.js
3. ✅ 安装依赖
4. ✅ 构建所有包
5. ✅ 构建 Electron 应用
6. ✅ 打包 Linux 版本 (`--linux --x64 --dir`)
7. ✅ 上传 Artifacts (7 天有效)
8. ✅ PR 评论构建信息

**说明**:
- 仅在 Linux 上打包（使用免费 GitHub Actions 额度）
- Windows/macOS 打包在 Release workflow 中
- 产物可在 GitHub Actions 页面下载

**运行时间**: ~3-5 分钟

---

### ✅ Workflow 3: Release Electron App — 自动发布

**文件**: `.github/workflows/release-electron.yml`

**触发条件**:
- **方式 A**: 创建版本标签 `v*` (如 `v1.0.0`)
- **方式 B**: 手动触发 (workflow_dispatch)

**执行步骤**:
1. ✅ Checkout 代码
2. ✅ 安装 pnpm + Node.js
3. ✅ 安装依赖
4. ✅ 构建所有包
5. ✅ 构建 Electron 应用
6. ✅ **构建 macOS** (`--mac`)
7. ✅ **构建 Windows** (`--win`)
8. ✅ **构建 Linux** (`--linux`)
9. ✅ 发布到 GitHub Releases
10. ✅ 生成 Release Notes

**矩阵策略**:
```yaml
matrix:
  include:
    - platform: 'mac-latest'
      args: '--mac'
    - platform: 'windows-latest'
      args: '--win'
    - platform: 'ubuntu-latest'
      args: '--linux'
```

**运行时间**: ~10-15 分钟

---

### ✅ Workflow 4: Publish to npm — CLI 发布 (已有)

**文件**: `.github/workflows/publish.yml`

**触发条件**:
- 手动触发 (workflow_dispatch)

**执行步骤**:
1. ✅ 安装依赖
2. ✅ 运行 lint/typecheck/test/build
3. ✅ 检查版本是否已存在
4. ✅ 发布到 npm registry

**注意**: 此 workflow 仅发布 CLI 包，不包含 Electron 应用

---

## 🚀 使用指南

### 日常开发

```bash
# 1. 本地开发
pnpm dev                    # 启动所有包
# 或
pnpm electron:dev           # 只启动桌面应用

# 2. 运行测试
pnpm test

# 3. 提交代码
git add .
git commit -m "feat: add new feature"
git push

# 4. GitHub Actions 自动运行 CI + Build Electron
```

### 发布新版本

#### 步骤 1: 更新版本号

编辑 `electron-app/package.json`:
```json
{
  "version": "1.0.1"  // ← 更新版本
}
```

#### 步骤 2: 提交并推送

```bash
git add electron-app/package.json
git commit -m "chore: bump version to 1.0.1"
git push
```

#### 步骤 3: 创建并推送标签

```bash
# 创建标签
git tag v1.0.1

# 推送标签
git push origin v1.0.1
```

#### 步骤 4: 自动发布 ✨

GitHub Actions 自动执行:
1. 构建 macOS, Windows, Linux 版本
2. 打包生成安装包
3. 发布到 GitHub Releases
4. 生成 Release Notes

**完成！** 访问 GitHub Releases 页面下载安装包。

---

## 📦 构建产物

### CI Artifacts (临时，7 天)

每次 Push/PR:
- `electron-app-linux` — Linux 构建产物

### Release Artifacts (永久)

版本发布时:

**macOS**:
- `CrossSync-Desktop-1.0.0.dmg` — 安装程序
- `CrossSync-Desktop-1.0.0-mac.zip` — 便携版

**Windows**:
- `CrossSync-Desktop-1.0.0.exe` — NSIS 安装程序
- `CrossSync-Desktop-1.0.0-win-portable.exe` — 便携版

**Linux**:
- `CrossSync-Desktop-1.0.0.AppImage` — 通用格式
- `CrossSync-Desktop-1.0.0.deb` — Debian/Ubuntu
- `CrossSync-Desktop-1.0.0.tar.gz` — 压缩包

---

## 🔐 需要的 GitHub Secrets

### GitHub Token (自动)

用于发布 GitHub Releases，**自动可用，无需配置**。

### NPM_TOKEN (可选)

用于自动发布 npm 包 (CLI):

**配置方法**:
1. 生成 npm token: https://www.npmjs.com/settings/<username>/tokens
2. GitHub → Settings → Secrets and variables → Actions
3. New repository secret:
   - Name: `NPM_TOKEN`
   - Value: `<your npm token>`

---

## 📊 Workflow 对比

| Workflow | 触发 | 构建平台 | 打包 | 发布 | Artifacts |
|---------|------|---------|------|------|----------|
| **CI** | Push/PR | ❌ | ❌ | ❌ | ❌ |
| **Build Electron** | Push/PR | Linux | ✅ | ❌ | ✅ (7天) |
| **Release Electron** | Tag/手动 | All | ✅ | ✅ | ✅ (永久) |
| **Publish to npm** | 手动 | ❌ | ❌ | ✅ npm | ❌ |

---

## 🎯 完整发布流程示例

### 场景: 发布 v1.0.0

```bash
# 1. 更新版本号
# electron-app/package.json: "version": "1.0.0"

# 2. 更新 CLI 版本
# packages/cli/package.json: "version": "0.1.5"
# packages/cli/src/constants.ts: CLI_VERSION = '0.1.5'

# 3. 提交
git add .
git commit -m "chore: release v1.0.0"
git push origin main

# 4. 创建标签
git tag v1.0.0
git push origin v1.0.0

# 5. GitHub Actions 自动执行:
# ✅ Build Electron App (3-5 分钟)
#   - 构建 Linux 版本
#   - 上传 Artifacts
#
# ✅ Release Electron App (10-15 分钟)
#   - 构建 macOS
#   - 构建 Windows
#   - 构建 Linux
#   - 发布 GitHub Release

# 6. 访问 GitHub Releases 页面
# https://github.com/anliluZoe/CrossSync/releases/tag/v1.0.0
```

---

## 🔧 自定义配置

### 修改打包平台

编辑 `.github/workflows/release-electron.yml`:

```yaml
matrix:
  include:
    # 只构建 Windows
    - platform: 'windows-latest'
      args: '--win --x64'

    # 添加 ARM 支持
    - platform: 'ubuntu-latest'
      args: '--linux --arm64'
```

### 修改打包参数

编辑 `electron-app/electron-builder.yml`:

```yaml
win:
  target:
    - target: nsis      # 安装程序
    - target: portable  # 便携版
    - target: zip       # 压缩包
  icon: build/icon.ico
```

### 修改 Artifacts 保留时间

默认 7 天，可在 `build-electron.yml` 中修改:

```yaml
- uses: actions/upload-artifact@v4
  with:
    retention-days: 30  # 改为 30 天
```

---

## 🐛 故障排查

### CI 失败

```bash
# 1. 查看 GitHub Actions 日志
# 2. 本地测试
pnpm typecheck
pnpm test
pnpm build

# 3. 检查依赖
pnpm install --frozen-lockfile
```

### Electron 打包失败

```bash
# 1. 本地测试打包
cd electron-app
pnpm exec electron-builder --dir

# 2. 检查配置
cat electron-builder.yml

# 3. 查看详细日志
DEBUG=electron-builder pnpm exec electron-builder
```

### Release 未创建

**检查**:
- 标签格式是否正确: `v*` (如 `v1.0.0`)
- 是否推送到远程: `git push origin v1.0.0`
- GitHub Actions 是否运行
- 权限设置: `permissions: contents: write`

---

## 📝 总结

### 已添加的文件

1. ✅ `.github/workflows/build-electron.yml` — PR 自动打包
2. ✅ `.github/workflows/release-electron.yml` — 自动发布
3. ✅ `electron-app/package.json` — 添加 package scripts
4. ✅ `package.json` — 添加 root scripts
5. ✅ `GITHUB_ACTIONS.md` — 详细文档

### Workflow 状态

| Workflow | 状态 | 说明 |
|---------|------|------|
| CI | ✅ 已配置 | 测试 + 构建 |
| Build Electron | ✅ 已配置 | PR 自动打包 |
| Release Electron | ✅ 已配置 | 标签触发发布 |
| Publish to npm | ✅ 已有 | CLI 发布 |

---

**创建时间**: 2024-10-30
**版本**: 1.0.0
**状态**: ✅ 完整配置
