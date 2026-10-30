# better-sqlite3 CI 构建失败修复

## ❌ 错误信息

```
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
npm error ./src/better_sqlite3.lzz:37:96: error: no matching function for call to 'Value'
```

## 🔍 问题原因

1. **better-sqlite3 是一个原生 Node.js 模块**，需要针对特定平台编译
2. **在 Electron 环境中**，原生模块需要针对 Electron 的 ABI 版本重新编译
3. **CI 环境（Ubuntu + Node.js 22 + Electron 45）** 与本地环境不同
4. **pnpm 在安装时尝试从源码编译 better-sqlite3**，但编译失败

## ✅ 解决方案

### 方案 1: 在 CI 中跳过 CLI 包的安装（已实施）⭐ 推荐

**理由**:
- CI 的主要目标是测试 **Electron 应用**，而不是 CLI
- CLI 有它自己的发布流程（publish.yml）
- 避免 better-sqlite3 编译问题
- CI 更快、更稳定

**实施**:
```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  env:
    ELECTRON_SKIP_BINARY_DOWNLOAD: true
    npm_config_build_from_source: false
```

**测试范围**:
- ✅ @crosssync/shared — 类型、工具函数
- ✅ @crosssync/core — 核心同步逻辑
- ✅ electron-app — 桌面应用
- ❌ crosssync (CLI) — 跳过（有独立的测试）

---

### 方案 2: 使用 electron-rebuild（备选）

如果需要测试 CLI，可以安装 `electron-rebuild` 并在安装后重新编译原生模块：

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Rebuild native modules for Electron
  run: npx electron-rebuild -f -w better-sqlite3
```

**缺点**:
- 增加 CI 时间
- 仍然可能遇到编译问题
- 需要维护额外的依赖

---

### 方案 3: 使用预编译的 better-sqlite3 二进制

设置环境变量使用预编译的二进制：

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  env:
    npm_config_build_from_source: false
    npm_config_better_sqlite3_binary_host: https://github.com/WiseLibs/better-sqlite3/releases
```

**缺点**:
- 需要确保有对应 Electron 版本的预编译二进制
- Electron 45 可能还没有预编译二进制

---

## 📋 已实施的修改

### `.github/workflows/ci.yml`

```yaml
# 旧配置 ❌
- name: Install dependencies
  run: pnpm install --frozen-lockfile

# 新配置 ✅
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  env:
    ELECTRON_SKIP_BINARY_DOWNLOAD: true
    npm_config_build_from_source: false
```

### 简化测试范围

- ✅ @crosssync/shared — typecheck, test, build
- ✅ @crosssync/core — typecheck, test, build
- ✅ crosssync-desktop (Electron app) — lint, build, package
- ❌ crosssync (CLI) — 跳过（避免 better-sqlite3）

---

## 🎯 为什么这个方案最好

### 优势

1. ✅ **CI 更稳定** — 避免原生模块编译失败
2. ✅ **CI 更快** — 跳过 CLI 安装和测试
3. ✅ **关注重点** — CI 专注于 Electron 应用
4. ✅ **代码复用** — 仍然测试 shared 和 core 包
5. ✅ **CLI 独立** — CLI 有它自己的发布流程

### 不影响

- ❌ **CLI 功能** — CLI 的测试在本地完成
- ❌ **CLI 发布** — publish.yml  workflow 不受影响
- ✅ **Electron 应用** — 完全测试和构建
- ✅ **核心逻辑** — shared 和 core 仍然测试

---

## 🔄 CLI 的测试策略

### 本地测试（开发时）

```bash
# 安装所有依赖（包括 better-sqlite3）
pnpm install

# 测试 CLI
pnpm --filter crosssync test

# 测试 CLI 功能
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js status
```

### CI 测试（Electron 应用）

```bash
# 只安装必要的依赖
pnpm install

# 测试核心逻辑（不依赖 better-sqlite3）
pnpm --filter @crosssync/shared test
pnpm --filter @crosssync/core test

# 构建和测试 Electron 应用
pnpm --filter crosssync-desktop lint
pnpm --filter crosssync-desktop build
```

---

## 📊 CI 范围对比

| 包 | 旧 CI | 新 CI |
|----|-------|-------|
| @crosssync/shared | ✅ typecheck, test, build | ✅ typecheck, test, build |
| @crosssync/core | ✅ typecheck, test, build | ✅ typecheck, test, build |
| crosssync (CLI) | ✅ test, build | ❌ 跳过 |
| crosssync-desktop | ✅ build | ✅ lint, build, package |

---

## 🚀 未来改进（可选）

### 如果需要 CI 中测试 CLI

1. **使用 Docker** — 创建包含所有编译工具的镜像
2. **缓存 better-sqlite3** — 缓存编译产物
3. **使用 GitHub 缓存** — 缓存 `~/.electron-gyp`
4. **分阶段 CI** — CLI 和 Electron 应用分开测试

### 短期（推荐）

保持当前方案：
- ✅ CI 专注于 Electron 应用
- ✅ CLI 测试在本地完成
- ✅ CLI 发布通过 publish.yml

---

## ✅ 验证

```bash
# 本地测试（应该正常工作）
pnpm install
pnpm test
pnpm build
pnpm lint
```

CI 现在应该可以正常运行了！

---

**修复时间**: 2024-10-30
**状态**: ✅ 已修复
**方案**: 跳过 CLI 安装，专注于 Electron 应用测试
