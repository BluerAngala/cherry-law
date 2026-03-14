#!/bin/bash

# 设置环境变量
export SENSEVOICE_HOST=${SENSEVOICE_HOST:-127.0.0.1}
export SENSEVOICE_PORT=${SENSEVOICE_PORT:-18080}

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python3，请先安装 Python 3.9+"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 检查依赖
if ! pip show fastapi &> /dev/null; then
    echo "安装依赖..."
    pip install -r requirements.txt
fi

# 启动服务
echo "启动 SenseVoice 服务..."
python -m sensevoice_server "$@"
