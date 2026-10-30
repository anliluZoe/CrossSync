# CrossSync Desktop — GitHub Actions 快速参考

## 📋 Workflows 概览

| Workflow | 文件 | 触发 | 功能 |
|---------|------|------|------|
| **CI** | `ci.yml` | Push/PR | 测试 + 构建 |
| **Build Electron** | `build-electron.yml` | Push/PR | 打包 (Linux) |
| **Release Electron** | `release-electron.yml` | Tag/手动 | 全平台打包发布 |
| **Publish to npm** | `publish.yml` | 手动 | 发布 npm 包 |

---

## 🚀 常用命令

### 开发

```bash
# 本地开发（所有包）
pnpm dev

# 只启动桌面应用
pnpm electron:dev

# 构建所有
pnpm build:all

# 只构建桌面
pnpm electron:build
```

### 发布

```bash
# 1. 更新版本号
# 编辑 electron-app/package.json

# 2. 提交
git add .
git commit -m "chore: release"
git push

# 3. 打标签
git tag v1.0.0
git push origin v1.0.0

# 4. GitHub Actions 自动发布 ✨
```

---

## 📦 构建产物

### CI Artifacts (临时)
- `electron-app-linux` — 7 天有效

### Release Artifacts (永久)
- `CrossSync-Desktop-1.0.0.dmg` — macOS
- `CrossSync-Desktop-1.0.0.exe` — Windows
- `CrossSync-Desktop-1.0.0.AppImage` — Linux
- `CrossSync-Desktop-1.0.0.deb` — Debian/Ubuntu

---

## 🔐 需要的 Secrets

| Secret | 用于 | 必需 |
|--------|------|------|
| `GITHUB_TOKEN` | 发布 Release | ✅ 自动 |
| `NPM_TOKEN` | 发布 npm 包 | 可选 |

---

## 📝 Workflow 文件

### 1. CI (ci.yml) — 持续集成

```yaml
on: [push, pull_request]
jobs:
  - 安装依赖
  - TypeScript 检查
  - 运行测试
  - 构建所有包
  - ESLint 检查
  - 构建 Electron 应用 ⭐
```

### 2. Build Electron (build-electron.yml) — PR 打包

```yaml
on: [push, pull_request]
jobs:
  - 构建 Electron 应用
  - 打包 Linux 版本
  - 上传 Artifacts
  - PR 评论构建信息
```

### 3. Release Electron (release-electron.yml) — 正式发布

```yaml
on: [tags, workflow_dispatch]
jobs:
  - 构建 (macOS, Windows, Linux)
  - 打包所有平台
  - 发布到 GitHub Releases
```

---

## ✅ 验证

```bash
# 检查文件
ls .github/workflows/

# 应该看到:
# ci.yml
# publish.yml
# build-electron.yml      ← 新增
# release-electron.yml    ← 新增
```

---

**更新时间**: 2024-10-30
**版本**: 1.0.0
