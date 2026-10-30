#!/bin/bash

echo "========================================"
echo "CrossSync Desktop - 快速启动"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 20+"
    exit 1
fi
echo "✅ Node.js 已安装: $(node --version)"

echo ""
echo "正在安装依赖..."
cd "$(dirname "$0")"
pnpm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装完成"

echo ""
echo "正在启动开发服务器..."
echo "========================================"
echo "🎉 启动 CrossSync Desktop..."
echo "📝 DevTools 将自动打开"
echo "🛑 按 Ctrl+C 停止"
echo "========================================"
echo ""

pnpm dev
