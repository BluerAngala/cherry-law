# SenseVoice Server

基于 SenseVoice Small 模型的本地语音识别服务，为 Cherry Studio 提供语音转文字功能。

## 功能特性

- 🎯 **离线识别**：基于 SenseVoice Small 模型，完全本地运行
- 🌐 **多语言支持**：支持中文、英文及中英文混合识别
- ⚡ **高性能**：支持 GPU 加速，CPU 模式也可流畅运行
- 🔧 **易于集成**：提供 HTTP API 接口，易于与 Electron 应用集成
- 📦 **自动下载**：模型自动下载，无需手动配置

## 快速开始

### 安装

```bash
# 运行安装脚本
./scripts/install.sh

# 或手动安装
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 启动服务

```bash
# 使用启动脚本
./scripts/start.sh

# 或使用 Python 直接启动
python -m sensevoice_server

# 指定端口
python -m sensevoice_server --port 18080

# 开发模式（热重载）
python -m sensevoice_server --reload --debug
```

### 下载模型（可选）

模型会在首次启动时自动下载，也可以手动下载：

```bash
python scripts/download_model.py
```

## API 接口

### 健康检查

```bash
GET /health
```

响应：
```json
{
  "status": "healthy",
  "model_loaded": true,
  "gpu_available": false,
  "device": "cpu",
  "version": "1.0.0"
}
```

### 服务状态

```bash
GET /status
```

响应：
```json
{
  "model": "iic/SenseVoiceSmall",
  "device": "cpu",
  "memory_usage": "512MB",
  "uptime": 3600,
  "requests_processed": 100
}
```

### 语音识别

```bash
POST /transcribe
Content-Type: multipart/form-data

参数:
- audio: 音频文件 (WAV/PCM)
- format: 音频格式 (wav, pcm, webm)
- sample_rate: 采样率 (默认 16000)
- language: 语言 (zh, en, auto)
```

示例：
```bash
curl -X POST "http://127.0.0.1:18080/transcribe" \
  -F "audio=@test.wav" \
  -F "format=wav"
```

响应：
```json
{
  "text": "识别的文本内容",
  "confidence": 0.95,
  "duration": 2.5,
  "language": "zh",
  "processing_time": 0.3
}
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SENSEVOICE_HOST` | 服务监听地址 | `127.0.0.1` |
| `SENSEVOICE_PORT` | 服务端口 | `18080` |
| `SENSEVOICE_DEBUG` | 调试模式 | `false` |
| `SENSEVOICE_MODEL_DIR` | 模型目录 | `None` |
| `SENSEVOICE_DEVICE` | 计算设备 (auto/cuda/cpu) | `auto` |
| `SENSEVOICE_USE_GPU` | 是否使用 GPU | `true` |
| `SENSEVOICE_GPU_ID` | GPU ID | `0` |
| `SENSEVOICE_LANGUAGE` | 默认语言 | `auto` |

## 测试

```bash
# 运行测试
pytest tests/ -v

# 测试特定文件
pytest tests/test_server.py -v
```

## 项目结构

```
sensevoice-server/
├── sensevoice_server/    # 主代码包
│   ├── __init__.py
│   ├── __main__.py       # 入口点
│   ├── server.py         # FastAPI 服务
│   ├── asr.py            # ASR 引擎
│   ├── config.py         # 配置管理
│   └── models.py         # 数据模型
├── scripts/              # 脚本
│   ├── start.sh          # 启动脚本
│   ├── start.bat         # Windows 启动脚本
│   ├── install.sh        # 安装脚本
│   └── download_model.py # 模型下载
├── tests/                # 测试
├── models/               # 模型存放目录
├── requirements.txt      # 依赖
├── pyproject.toml        # 项目配置
└── README.md             # 本文档
```

## 依赖

- Python >= 3.9
- PyTorch >= 2.0.0
- FunASR >= 1.0.0
- FastAPI >= 0.104.0

## 许可证

MIT License
