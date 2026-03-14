#!/bin/bash

set -e

echo "========================================="
echo "SenseVoice Server 安装脚本"
echo "========================================="

# 检查 Python 版本
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_VERSION="3.9"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "错误: Python 版本需要 >= 3.9，当前版本: $PYTHON_VERSION"
    exit 1
fi

echo "Python 版本: $PYTHON_VERSION"

# 创建虚拟环境
echo ""
echo "创建虚拟环境..."
python3 -m venv venv
source venv/bin/activate

# 升级 pip
echo ""
echo "升级 pip..."
pip install --upgrade pip

# 检测 CUDA
if command -v nvcc &> /dev/null; then
    CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $5}' | cut -d',' -f1)
    echo ""
    echo "检测到 CUDA 版本: $CUDA_VERSION"
    echo "安装 CUDA 版本依赖..."
    pip install -r requirements-cuda.txt
else
    echo ""
    echo "未检测到 CUDA，安装 CPU 版本..."
    pip install -r requirements.txt
fi

# 下载模型
echo ""
echo "检查模型..."
if [ ! -d "models/sensevoice-small" ]; then
    echo "模型将在首次启动时自动下载"
fi

echo ""
echo "========================================="
echo "安装完成！"
echo ""
echo "启动服务:"
echo "  ./scripts/start.sh"
echo ""
echo "或使用 Python 直接启动:"
echo "  source venv/bin/activate"
echo "  python -m sensevoice_server"
echo "========================================="
