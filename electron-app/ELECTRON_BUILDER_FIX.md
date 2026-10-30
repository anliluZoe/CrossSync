# electron-builder 配置修复

## ❌ 错误信息

```
Invalid configuration object. electron-builder 24.13.3 has been initialized using a configuration object that does not match the API schema.

- configuration has an unknown property 'product-name'
- configuration.nsis has an unknown property 'one-click'
```

## 🔍 问题原因

electron-builder 24.x 使用 **驼峰命名法 (camelCase)**，而不是 kebab-case。

### 错误配置 ❌

```yaml
app-id: com.crosssync.desktop
product-name: CrossSync Desktop    # ❌ 错误
nsis:
  one-click: false                  # ❌ 错误
```

### 正确配置 ✅

```yaml
app-id: com.crosssync.desktop
productName: CrossSync Desktop     # ✅ 正确
nsis:
  oneClick: false                   # ✅ 正确
```

---

## ✅ 已修复

### 修复 1: `product-name` → `productName`

```diff
- product-name: CrossSync Desktop
+ productName: CrossSync Desktop
```

### 修复 2: `one-click` → `oneClick`

```diff
  nsis:
-   one-click: false
+   oneClick: false
    allowToChangeInstallationDirectory: true
```

---

## 📋 electron-builder 配置规范

### YAML 格式要求

electron-builder 的 YAML 配置使用以下格式：

1. **根级属性**: `camelCase`
2. **嵌套对象**: 正常缩进
3. **数组**: 使用 `-` 列表语法

### 常见配置项

```yaml
# ✅ 正确的格式
appId: com.example.app
productName: My App
copyright: Copyright © 2024
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - package.json
mac:
  category: public.app-category.productivity
  icon: build/icon.icns
  target:
    - target: dmg
    - target: zip
win:
  icon: build/icon.ico
  target:
    - target: nsis
    - target: portable
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
linux:
  category: Utility
  target:
    - target: AppImage
    - target: deb
compression: maximum
```

### 完整配置参考

查看官方文档:
- **配置选项**: https://www.electron.build/configuration/configuration
- **NSIS 配置**: https://www.electron.build/configuration/nsis

---

## 🚀 验证修复

```bash
# 本地测试配置是否有效
cd electron-app
pnpm exec electron-builder --dir

# 如果成功，会看到:
# • building target=dir
# • building from source
# ...
```

---

## 📝 其他常见错误

### 错误: `app-id` 应为 `appId`

```yaml
# ❌ 错误
app-id: com.example.app

# ✅ 正确
appId: com.example.app
```

### 错误: `artifact-name` 应为 `artifactName`

```yaml
# ❌ 错误
artifact-name: MyApp

# ✅ 正确
artifactName: MyApp
```

### 错误: `extra-files` 应为 `extraFiles`

```yaml
# ❌ 错误
extra-files:
  - README.md

# ✅ 正确
extraFiles:
  - README.md
```

---

## 🔧 快速修复技巧

如果你遇到类似的配置错误：

1. **检查错误信息** — electron-builder 会明确指出哪个属性无效
2. **查看官方文档** — 使用文档搜索功能
3. **转换命名法** — kebab-case → camelCase
4. **验证配置** — `pnpm exec electron-builder --dir`

---

## 📊 electron-builder 命名规范总结

| 错误 (kebab-case) | 正确 (camelCase) |
|------------------|------------------|
| `product-name` | `productName` |
| `app-id` | `appId` |
| `artifact-name` | `artifactName` |
| `extra-files` | `extraFiles` |
| `extra-resources` | `extraResources` |
| `build-version` | `buildVersion` |
| `build-number` | `buildNumber` |
| `one-click` | `oneClick` |
| `create-desktop-shortcut` | `createDesktopShortcut` |
| `create-start-menu-shortcut` | `createStartMenuShortcut` |
| `allow-elevation` | `allowElevation` |

---

## ✅ 修复验证

修复后的配置文件：
- ✅ `productName` (不是 `product-name`)
- ✅ `oneClick` (不是 `one-click`)
- ✅ 所有其他配置使用 camelCase

**配置文件**: `electron-app/electron-builder.yml`

---

**修复时间**: 2024-10-30
**状态**: ✅ 已修复
