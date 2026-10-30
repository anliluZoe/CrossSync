@echo off
echo ========================================
echo CrossSync Desktop - 快速启动
echo ========================================
echo.

echo [1/3] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js 20+
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

echo.
echo [2/3] 安装依赖...
cd /d "%~dp0"
call pnpm install
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

echo.
echo [3/3] 启动开发服务器...
echo.
echo ========================================
echo 🎉 正在启动 CrossSync Desktop...
echo 📝 DevTools 将自动打开
echo 🛑 按 Ctrl+C 停止
echo ========================================
echo.

call pnpm dev

pause
