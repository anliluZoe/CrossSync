# electron-builder 配置修复

## ❌ 错误信息

```
Invalid configuration object. electron-builder 24.13.3 has been initialized using a configuration object that does not match the API schema.

- configuration has an unknown property 'app-id'
- configuration has an unknown property 'product-name'
- configuration.nsis has an unknown property 'one-click'
```

## 🔍 问题原因

electron-builder 24.x 使用 **驼峰命名法 (camelCase)**，而不是 kebab-case（短横线命名）。

electron-builder 使用 JSON Schema 进行配置验证，所有配置项必须使用精确的驼峰命名。

### 错误配置 ❌

```yaml
app-id: com.crosssync.desktop          # ❌ 错误
product-name: CrossSync Desktop        # ❌ 错误
nsis:
  one-click: false                      # ❌ 错误
```

### 正确配置 ✅

```yaml
appId: com.crosssync.desktop           # ✅ 正确
productName: CrossSync Desktop         # ✅ 正确
nsis:
  oneClick: false                       # ✅ 正确
```

---

## ✅ 已修复的所有问题

### 修复 1: `app-id` → `appId`

```diff
- app-id: com.crosssync.desktop
+ appId: com.crosssync.desktop
```

### 修复 2: `product-name` → `productName`

```diff
- product-name: CrossSync Desktop
+ productName: CrossSync Desktop
```

### 修复 3: `one-click` → `oneClick`

```diff
  nsis:
-   one-click: false
+   oneClick: false
    allowToChangeInstallationDirectory: true
```

---

## 📋 electron-builder 配置规范

### 完整的正确配置

```yaml
# ✅ 正确的格式
appId: com.crosssync.desktop                    # 应用 ID
productName: CrossSync Desktop                 # 产品名称
copyright: Copyright © 2024 CrossSync Team     # 版权信息

directories:
  output: release/${os}-${arch}                # 输出目录
  buildResources: build                        # 构建资源目录

files:
  - dist-electron/**/*                         # 主进程文件
  - dist/**/*                                  # 渲染进程文件
  - package.json                               # 包配置
  - node_modules/**/*                          # 依赖（生产环境）

mac:
  category: public.app-category.productivity   # macOS 分类
  icon: build/icon.icns                        # macOS 图标
  target:
    - target: dmg                              # DMG 安装包
    - target: zip                              # ZIP 压缩包

win:
  icon: build/icon.ico                         # Windows 图标
  target:
    - target: nsis                             # NSIS 安装程序
    - target: portable                         # 便携版

linux:
  category: Utility                            # Linux 分类
  icon: build/icon.png                         # Linux 图标
  target:
    - target: AppImage                         # AppImage
    - target: deb                              # Debian 包

nsis:
  oneClick: false                              # 是否一键安装
  allowToChangeInstallationDirectory: true     # 允许选择安装目录

compression: maximum                           # 压缩级别
```

### electron-builder 命名规范

electron-builder 使用 **camelCase（驼峰命名法）**，所有配置项必须使用精确的驼峰格式。

**常见配置项对照表**:

| ❌ 错误 (kebab-case) | ✅ 正确 (camelCase) |
|---------------------|---------------------|
| `app-id` | `appId` |
| `product-name` | `productName` |
| `artifact-name` | `artifactName` |
| `extra-files` | `extraFiles` |
| `extra-resources` | `extraResources` |
| `build-version` | `buildVersion` |
| `build-number` | `buildNumber` |
| `one-click` | `oneClick` |
| `create-desktop-shortcut` | `createDesktopShortcut` |
| `create-start-menu-shortcut` | `createStartMenuShortcut` |
| `allow-elevation` | `allowElevation` |
| `csc-key-password` | `cscKeyPassword` |
| `csc-link` | `cscLink` |

---

## 🔧 快速修复技巧

### 遇到配置错误的通用解法

1. **阅读错误信息** — electron-builder 会明确指出哪个属性无效
2. **查看官方文档** — https://www.electron.build/configuration/configuration
3. **转换命名法** — kebab-case → camelCase
4. **验证配置** — `pnpm exec electron-builder --dir`

### 本地验证配置

```bash
cd electron-app
pnpm exec electron-builder --dir
```

如果配置正确，会看到类似输出：
```
• building target=dir
• building from source
• packaging
• building standalone
```

---

## 🎯 常见错误场景

### 场景 1: 复制示例配置

许多网上教程使用旧的 kebab-case 格式，直接复制会导致错误。

**解决**: 始终参考官方文档，使用 camelCase。

### 场景 2: 拼写错误

```yaml
# ❌ 拼写错误
appId: com.example.app
productnName: My App  # 少了一个 'a'

# ✅ 正确
appId: com.example.app
productName: My App
```

### 场景 3: 配置项位置错误

某些配置项只能在特定位置使用，例如 `title` 只能在 `dmg` 配置中。

```yaml
# ❌ 错误：title 不在 dmg 中
title: My App
dmg:
  format: UDZO

# ✅ 正确
dmg:
  title: My App
  format: UDZO
```

---

## 📚 参考资源

- **配置文档**: https://www.electron.build/configuration/configuration
- **NSIS 配置**: https://www.electron.build/configuration/nsis
- **配置验证**: https://www.electron.build/configuration/validators

---

## ✅ 修复验证

修复后的 `electron-builder.yml`：

- ✅ `appId` (不是 `app-id`)
- ✅ `productName` (不是 `product-name`)
- ✅ `oneClick` (不是 `one-click`)
- ✅ `allowToChangeInstallationDirectory` (不是 `allow-to-change-installation-directory`)
- ✅ 所有其他配置使用 camelCase

**配置文件**: `electron-app/electron-builder.yml`

---

**修复时间**: 2024-10-30
**状态**: ✅ 已完全修复
**测试**: ✅ 配置验证通过

