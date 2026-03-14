@echo off
setlocal

REM 设置环境变量
set SENSEVOICE_HOST=127.0.0.1
set SENSEVOICE_PORT=18080

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.9+
    exit /b 1
)

REM 检查虚拟环境
if not exist "venv" (
    echo 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
call venv\Scripts\activate.bat

REM 检查依赖
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo 安装依赖...
    pip install -r requirements.txt
)

REM 启动服务
echo 启动 SenseVoice 服务...
python -m sensevoice_server %*

endlocal
