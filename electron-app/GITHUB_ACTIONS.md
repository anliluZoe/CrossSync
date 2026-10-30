# GitHub Actions — CI/CD 配置说明

## 📋 已配置的 Workflows

### 1. **CI** — 持续集成 (`.github/workflows/ci.yml`)

**触发**: Push / Pull Request 到 main 或 master

**任务**:
- ✅ 检查代码
- ✅ 安装依赖
- ✅ TypeScript 类型检查
- ✅ 运行测试
- ✅ 构建所有包
- ✅ ESLint 代码检查
- ✅ 构建 Electron 应用
- ✅ CLI 冒烟测试

**新增** (v1.0.0):
```yaml
- name: Build Electron app
  run: cd electron-app && pnpm build
  env:
    ELECTRON_SKIP_BINARY_DOWNLOAD: true
```

---

### 2. **Build Electron App** — Electron 打包 (`.github/workflows/build-electron.yml`) ⭐ 新增

**触发**: Push / Pull Request 到 main 或 master

**任务**:
- ✅ 安装依赖
- ✅ 构建所有包
- ✅ 构建 Electron 应用
- ✅ 打包 Electron (Linux)
- ✅ 上传构建产物 (Artifacts)
- ✅ PR 评论构建信息

**策略**:
- 仅在 Linux 上打包（免费额度）
- Windows/macOS 打包在 Release workflow 中

---

### 3. **Release Electron App** — 自动发布 (`.github/workflows/release-electron.yml`) ⭐ 新增

**触发**:
- 创建版本标签: `git tag v1.0.0 && git push origin v1.0.0`
- 手动触发 (workflow_dispatch)

**任务**:
- ✅ 构建所有平台 (macOS, Windows, Linux)
- ✅ 打包 (dmg, exe, AppImage, deb)
- ✅ 自动发布到 GitHub Releases
- ✅ 上传所有安装包

**使用方法**:

```bash
# 1. 更新版本号
# 编辑 electron-app/package.json 的 version 字段

# 2. 创建标签
git tag v1.0.0
git push origin v1.0.0

# 3. GitHub Actions 自动触发发布流程
```

---

## 🚀 使用指南

### 开发流程

```bash
# 1. 本地开发
pnpm dev  # 启动所有包
# 或
pnpm electron:dev  # 只启动桌面应用

# 2. 提交代码
git add .
git commit -m "feat: add new feature"
git push

# 3. GitHub Actions 自动运行
# - CI: 测试 + 构建
# - Build Electron App: 打包 Linux 版本
```

### 发布流程

#### 方式 A: 自动发布 (推荐)

```bash
# 1. 更新版本号
# 编辑 electron-app/package.json
# "version": "1.0.1"

# 2. 提交版本更新
git add electron-app/package.json
git commit -m "chore: bump version to 1.0.1"
git push

# 3. 创建并推送标签
git tag v1.0.1
git push origin v1.0.1

# 4. GitHub Actions 自动:
# - 构建 macOS, Windows, Linux 版本
# - 发布到 GitHub Releases
```

#### 方式 B: 手动触发

1. 进入 GitHub 仓库
2. 点击 **Actions** 标签
3. 选择 **Build and Release Electron App**
4. 点击 **Run workflow**
5. 填写版本号（如 `v1.0.1`）
6. 点击 **Run workflow**

---

## 📦 Artifacts

### CI Artifacts (临时，7 天)

每次 Push/PR 都会生成:
- `electron-app-linux` — Linux 构建产物

### Release Artifacts (永久)

版本发布时生成:
- **macOS**: `.dmg`, `.zip`
- **Windows**: `.exe` (NSIS), `.exe` (Portable)
- **Linux**: `.AppImage`, `.deb`, `.tar.gz`

---

## 🔐 需要的 Secrets

### GitHub Token (自动)

用于发布 GitHub Releases，**不需要手动配置**。

### NPM Token (可选)

用于发布 npm 包（CLI 工具）:
```
Settings → Secrets and variables → Actions → New repository secret
Name: NPM_TOKEN
Value: <your npm token>
```

---

## 📊 Workflow 对比

| Workflow | 触发 | 构建平台 | 发布 |
|---------|------|---------|------|
| **CI** | Push/PR | ❌ | ❌ |
| **Build Electron App** | Push/PR | Linux | ❌ (Artifacts) |
| **Release Electron App** | Tag/手动 | All | ✅ GitHub Releases |
| **Publish to npm** | 手动 | ❌ | ✅ npm Registry |

---

## 🎯 推荐工作流

### 日常开发

```bash
# 本地开发 + 测试
pnpm dev
pnpm test
pnpm build

# Push 到 GitHub
git push

# GitHub Actions 自动:
# 1. 运行测试
# 2. 构建 CLI
# 3. 构建 Electron (Linux)
# 4. 上传 Artifacts
```

### 发布新版本

```bash
# 1. 更新版本号
# electron-app/package.json: "version": "1.0.1"
# packages/cli/package.json: "version": "0.1.5"

# 2. 提交并推送
git add .
git commit -m "chore: release v1.0.1"
git push

# 3. 打标签
git tag v1.0.1
git push origin v1.0.1

# 4. GitHub Actions 自动:
# - 构建 macOS, Windows, Linux 安装包
# - 创建 GitHub Release
# - 上传所有安装包
```

---

## 🐛 常见问题

### Q1: 构建失败

**检查**:
- 依赖是否完整: `pnpm install`
- 类型检查: `pnpm typecheck`
- 测试是否通过: `pnpm test`

### Q2: Electron 打包失败

**可能原因**:
- `electron-builder` 配置错误
- 图标文件缺失
- 磁盘空间不足

**解决**:
```bash
# 本地测试打包
cd electron-app
pnpm exec electron-builder --dir
```

### Q3: Release 没有自动创建

**检查**:
- 标签格式是否正确: `v*` (如 `v1.0.0`)
- 是否推送到远程: `git push origin v1.0.0`
- GitHub Actions 日志

---

## 📝 自定义配置

### 修改构建平台

编辑 `.github/workflows/release-electron.yml`:

```yaml
matrix:
  include:
    - platform: 'mac-latest'
      args: '--mac'  # macOS
    - platform: 'windows-latest'
      args: '--win'  # Windows
    - platform: 'ubuntu-latest'
      args: '--linux'  # Linux
```

### 修改打包参数

编辑 `electron-app/electron-builder.yml`:

```yaml
mac:
  target:
    - target: dmg
    - target: zip
  icon: build/icon.icns

win:
  target:
    - target: nsis
    - target: portable
  icon: build/icon.ico
```

---

## ✅ 验证配置

```bash
# 检查所有 workflows
ls -la .github/workflows/

# 输出应该是:
# ci.yml                        ← 现有
# publish.yml                   ← 现有
# build-electron.yml            ← 新增 ✨
# release-electron.yml          ← 新增 ✨
```

---

**创建时间**: 2024-10-30
**版本**: 1.0.0
**状态**: ✅ 已配置
