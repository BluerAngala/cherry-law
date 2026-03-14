# SenseVoice Python 服务实现规范

> 本文档详细描述 SenseVoice Python 服务的实现细节，作为 Phase 1 开发指南。

## 一、目录结构

```
packages/sensevoice-server/
├── sensevoice_server/
│   ├── __init__.py
│   ├── __main__.py              # 入口点：python -m sensevoice_server
│   ├── server.py                # FastAPI 应用
│   ├── asr.py                   # ASR 引擎封装
│   ├── config.py                # 配置管理
│   ├── models.py                # 数据模型
│   └── utils.py                 # 工具函数
├── scripts/
│   ├── start.sh                 # Linux/Mac 启动脚本
│   ├── start.bat                # Windows 启动脚本
│   ├── install.sh               # 安装脚本
│   └── download_model.py        # 模型下载脚本
├── tests/
│   ├── __init__.py
│   ├── test_server.py           # API 测试
│   └── test_asr.py              # ASR 测试
├── models/                      # 模型存放目录（.gitignore）
│   └── .gitkeep
├── requirements.txt
├── requirements-cuda.txt        # CUDA 版本依赖
├── pyproject.toml
├── README.md
└── README_CN.md
```

## 二、核心代码实现

### 2.1 配置管理 (config.py)

```python
"""
SenseVoice Server 配置管理
"""
import os
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path


@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = "127.0.0.1"
    port: int = 18080
    debug: bool = False
    cors_origins: list = field(default_factory=lambda: ["*"])

    @classmethod
    def from_env(cls) -> "ServerConfig":
        return cls(
            host=os.getenv("SENSEVOICE_HOST", "127.0.0.1"),
            port=int(os.getenv("SENSEVOICE_PORT", "18080")),
            debug=os.getenv("SENSEVOICE_DEBUG", "false").lower() == "true",
        )


@dataclass
class ASRConfig:
    """ASR 引擎配置"""
    model_name: str = "iic/SenseVoiceSmall"
    model_dir: Optional[str] = None
    device: str = "auto"  # auto, cuda, cpu
    language: str = "auto"  # auto, zh, en
    use_gpu: bool = True
    gpu_id: int = 0

    # 性能配置
    batch_size: int = 1
    chunk_size: int = 480000  # 30秒 @ 16kHz

    @classmethod
    def from_env(cls) -> "ASRConfig":
        model_dir = os.getenv("SENSEVOICE_MODEL_DIR")
        if model_dir:
            model_dir = str(Path(model_dir).expanduser().resolve())

        return cls(
            model_name=os.getenv("SENSEVOICE_MODEL_NAME", "iic/SenseVoiceSmall"),
            model_dir=model_dir,
            device=os.getenv("SENSEVOICE_DEVICE", "auto"),
            language=os.getenv("SENSEVOICE_LANGUAGE", "auto"),
            use_gpu=os.getenv("SENSEVOICE_USE_GPU", "true").lower() == "true",
            gpu_id=int(os.getenv("SENSEVOICE_GPU_ID", "0")),
        )


@dataclass
class Config:
    """全局配置"""
    server: ServerConfig = field(default_factory=ServerConfig)
    asr: ASRConfig = field(default_factory=ASRConfig)

    @classmethod
    def load(cls) -> "Config":
        return cls(
            server=ServerConfig.from_env(),
            asr=ASRConfig.from_env(),
        )


# 全局配置实例
config = Config.load()
```

### 2.2 数据模型 (models.py)

```python
"""
API 数据模型定义
"""
from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str = "healthy"
    model_loaded: bool = False
    gpu_available: bool = False
    device: str = "cpu"
    version: str = "1.0.0"


class StatusResponse(BaseModel):
    """服务状态响应"""
    model: str
    device: str
    memory_usage: Optional[str] = None
    uptime: float
    requests_processed: int = 0


class TranscribeRequest(BaseModel):
    """识别请求参数"""
    format: str = Field(default="wav", description="音频格式: wav, pcm")
    sample_rate: int = Field(default=16000, description="采样率")
    language: Optional[str] = Field(default=None, description="语言: zh, en, auto")


class TranscribeResponse(BaseModel):
    """识别结果响应"""
    text: str = Field(description="识别文本")
    confidence: float = Field(default=1.0, description="置信度")
    duration: float = Field(description="音频时长(秒)")
    language: str = Field(default="zh", description="检测到的语言")
    processing_time: float = Field(description="处理耗时(秒)")


class ErrorResponse(BaseModel):
    """错误响应"""
    error: str
    detail: Optional[str] = None
    code: str
```

### 2.3 ASR 引擎封装 (asr.py)

```python
"""
ASR 引擎封装 - SenseVoice Small
"""
import time
import logging
from typing import Optional, Tuple
from pathlib import Path

import torch
import numpy as np

logger = logging.getLogger(__name__)


class ASRError(Exception):
    """ASR 错误"""
    pass


class ASREngine:
    """
    SenseVoice ASR 引擎

    支持:
    - 中英文混合识别
    - 自动标点
    - 情感识别（可选）
    """

    def __init__(self, config: "ASRConfig"):
        self.config = config
        self.model = None
        self.device = None
        self._initialized = False
        self._init_error: Optional[str] = None

    def _select_device(self) -> str:
        """选择计算设备"""
        if self.config.device != "auto":
            return self.config.device

        if self.config.use_gpu and torch.cuda.is_available():
            device = f"cuda:{self.config.gpu_id}"
            logger.info(f"使用 GPU: {torch.cuda.get_device_name(self.config.gpu_id)}")
            return device

        logger.info("使用 CPU 模式")
        return "cpu"

    def _load_model(self):
        """加载模型"""
        try:
            from funasr import AutoModel

            # 确定模型路径
            if self.config.model_dir:
                model_path = Path(self.config.model_dir)
                if not model_path.exists():
                    raise ASRError(f"模型目录不存在: {model_path}")
            else:
                model_path = self.config.model_name

            logger.info(f"正在加载模型: {model_path}")

            self.device = self._select_device()

            # 加载模型
            self.model = AutoModel(
                model=str(model_path),
                device=self.device,
                # SenseVoice 特定配置
                model_type="sensevoice",
                disable_pbar=True,
                disable_log=True,
            )

            logger.info("模型加载完成")
            self._initialized = True

        except ImportError as e:
            self._init_error = f"缺少依赖: {e}. 请安装 funasr: pip install funasr"
            logger.error(self._init_error)
            raise ASRError(self._init_error)
        except Exception as e:
            self._init_error = str(e)
            logger.error(f"模型加载失败: {e}")
            raise ASRError(f"模型加载失败: {e}")

    def initialize(self):
        """初始化引擎"""
        if self._initialized:
            return

        self._load_model()

    def is_ready(self) -> bool:
        """检查是否就绪"""
        return self._initialized and self.model is not None

    def get_init_error(self) -> Optional[str]:
        """获取初始化错误"""
        return self._init_error

    def transcribe(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000,
        language: Optional[str] = None
    ) -> Tuple[str, float, str]:
        """
        转录音频

        Args:
            audio_data: 音频数据 (numpy array)
            sample_rate: 采样率
            language: 语言 (zh, en, auto)

        Returns:
            (文本, 置信度, 检测到的语言)
        """
        if not self.is_ready():
            raise ASRError("引擎未初始化")

        start_time = time.time()

        try:
            # 确保音频格式正确
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32) / 32768.0

            # 重采样（如果需要）
            if sample_rate != 16000:
                import librosa
                audio_data = librosa.resample(
                    audio_data,
                    orig_sr=sample_rate,
                    target_sr=16000
                )

            # 执行识别
            result = self.model.generate(
                input=audio_data,
                language=language or self.config.language,
            )

            # 解析结果
            if result and len(result) > 0:
                text = result[0].get("text", "")
                confidence = result[0].get("confidence", 1.0)
                detected_lang = result[0].get("lang", "zh")

                processing_time = time.time() - start_time
                logger.debug(f"识别完成: {text[:50]}... ({processing_time:.2f}s)")

                return text, confidence, detected_lang
            else:
                return "", 0.0, "unknown"

        except Exception as e:
            logger.error(f"识别失败: {e}")
            raise ASRError(f"识别失败: {e}")

    def transcribe_file(
        self,
        file_path: str,
        language: Optional[str] = None
    ) -> Tuple[str, float, str, float]:
        """
        转录音频文件

        Args:
            file_path: 音频文件路径
            language: 语言

        Returns:
            (文本, 置信度, 语言, 音频时长)
        """
        import librosa

        # 加载音频
        audio_data, sr = librosa.load(file_path, sr=16000, mono=True)
        duration = len(audio_data) / sr

        text, confidence, lang = self.transcribe(audio_data, sr, language)

        return text, confidence, lang, duration

    def get_device_info(self) -> dict:
        """获取设备信息"""
        info = {"device": self.device or "not initialized"}

        if torch.cuda.is_available():
            info["gpu_available"] = True
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["gpu_memory"] = f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB"
        else:
            info["gpu_available"] = False

        return info
```

### 2.4 FastAPI 服务 (server.py)

```python
"""
SenseVoice FastAPI 服务
"""
import time
import logging
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from .config import config
from .asr import ASREngine, ASRError
from .models import (
    HealthResponse,
    StatusResponse,
    TranscribeResponse,
    ErrorResponse
)

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if config.server.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="SenseVoice Server",
    description="本地语音识别服务 - 基于 SenseVoice Small",
    version="1.0.0",
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.server.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ASR 引擎实例
asr_engine: Optional[ASREngine] = None
start_time: float = 0
requests_processed: int = 0


@app.on_event("startup")
async def startup_event():
    """服务启动时初始化"""
    global asr_engine, start_time

    start_time = time.time()
    logger.info("正在初始化 ASR 引擎...")

    asr_engine = ASREngine(config.asr)

    # 异步初始化（不阻塞启动）
    try:
        asr_engine.initialize()
        logger.info("ASR 引擎初始化完成")
    except ASRError as e:
        logger.error(f"ASR 引擎初始化失败: {e}")
        # 服务仍然启动，但标记为不可用


@app.on_event("shutdown")
async def shutdown_event():
    """服务关闭时清理"""
    global asr_engine
    logger.info("正在关闭服务...")
    asr_engine = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查"""
    device_info = asr_engine.get_device_info() if asr_engine else {}

    return HealthResponse(
        status="healthy" if asr_engine and asr_engine.is_ready() else "degraded",
        model_loaded=asr_engine.is_ready() if asr_engine else False,
        gpu_available=device_info.get("gpu_available", False),
        device=device_info.get("device", "none"),
    )


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """获取服务状态"""
    global requests_processed

    if not asr_engine:
        raise HTTPException(status_code=503, detail="ASR 引擎未初始化")

    device_info = asr_engine.get_device_info()

    # 获取内存使用
    memory_usage = None
    try:
        import psutil
        process = psutil.Process()
        memory_usage = f"{process.memory_info().rss / 1024**2:.0f}MB"
    except:
        pass

    return StatusResponse(
        model=config.asr.model_name,
        device=device_info.get("device", "unknown"),
        memory_usage=memory_usage,
        uptime=time.time() - start_time,
        requests_processed=requests_processed,
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(..., description="音频文件"),
    format: str = Form(default="wav", description="音频格式"),
    sample_rate: int = Form(default=16000, description="采样率"),
    language: Optional[str] = Form(default=None, description="语言"),
):
    """
    语音识别接口

    支持格式:
    - wav: WAV 文件
    - pcm: 原始 PCM 数据
    - webm: WebM 音频（浏览器录音格式）
    """
    global requests_processed

    if not asr_engine or not asr_engine.is_ready():
        error = asr_engine.get_init_error() if asr_engine else "引擎未初始化"
        raise HTTPException(
            status_code=503,
            detail=f"ASR 服务不可用: {error}"
        )

    try:
        # 读取音频数据
        audio_bytes = await audio.read()

        # 根据格式处理
        if format == "pcm":
            # PCM 数据直接转换
            audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_data = audio_data.astype(np.float32) / 32768.0
            duration = len(audio_data) / sample_rate

        elif format == "webm":
            # WebM 需要转换
            audio_data, sr = _decode_webm(audio_bytes)
            duration = len(audio_data) / sr
            sample_rate = sr

        else:
            # WAV 或其他格式，保存临时文件处理
            with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as f:
                f.write(audio_bytes)
                temp_path = f.name

            try:
                text, confidence, lang, duration = asr_engine.transcribe_file(
                    temp_path, language
                )
            finally:
                Path(temp_path).unlink(missing_ok=True)

            requests_processed += 1

            return TranscribeResponse(
                text=text,
                confidence=confidence,
                duration=duration,
                language=lang,
                processing_time=0,  # 在 transcribe_file 中没有记录
            )

        # PCM/WebM 处理
        start = time.time()
        text, confidence, lang = asr_engine.transcribe(
            audio_data, sample_rate, language
        )
        processing_time = time.time() - start

        requests_processed += 1

        return TranscribeResponse(
            text=text,
            confidence=confidence,
            duration=duration,
            language=lang,
            processing_time=processing_time,
        )

    except ASRError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("识别失败")
        raise HTTPException(status_code=500, detail=f"识别失败: {e}")


def _decode_webm(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    """解码 WebM 音频"""
    try:
        import librosa
        import soundfile as sf
        import io

        # 使用 soundfile 读取
        audio_io = io.BytesIO(audio_bytes)
        audio_data, sr = sf.read(audio_io)

        # 转为单声道
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)

        # 重采样到 16kHz
        if sr != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)
            sr = 16000

        return audio_data, sr

    except Exception as e:
        raise ASRError(f"音频解码失败: {e}")


@app.exception_handler(ASRError)
async def asr_error_handler(request, exc: ASRError):
    """ASR 错误处理"""
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "code": "ASR_ERROR"}
    )


def run():
    """启动服务"""
    uvicorn.run(
        app,
        host=config.server.host,
        port=config.server.port,
        log_level="debug" if config.server.debug else "info",
    )


if __name__ == "__main__":
    run()
```

### 2.5 入口点 (__main__.py)

```python
"""
命令行入口点
python -m sensevoice_server
"""
import argparse
from .server import run
from .config import config


def main():
    parser = argparse.ArgumentParser(description="SenseVoice 语音识别服务")
    parser.add_argument("--host", default=config.server.host, help="服务地址")
    parser.add_argument("--port", type=int, default=config.server.port, help="服务端口")
    parser.add_argument("--reload", action="store_true", help="开发模式（自动重载）")
    parser.add_argument("--debug", action="store_true", help="调试模式")

    args = parser.parse_args()

    # 更新配置
    config.server.host = args.host
    config.server.port = args.port
    config.server.debug = args.debug

    if args.reload:
        # 开发模式使用 uvicorn 的热重载
        import uvicorn
        uvicorn.run(
            "sensevoice_server.server:app",
            host=args.host,
            port=args.port,
            reload=True,
            log_level="debug",
        )
    else:
        run()


if __name__ == "__main__":
    main()
```

## 三、依赖文件

### 3.1 requirements.txt

```txt
# Web 框架
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
python-multipart>=0.0.6

# ASR 核心
funasr>=1.0.0
modelscope>=1.10.0

# 音频处理
librosa>=0.10.0
soundfile>=0.12.0
numpy>=1.24.0

# PyTorch (CPU 版本，CUDA 版本见 requirements-cuda.txt)
torch>=2.0.0
torchaudio>=2.0.0

# 工具
pydantic>=2.0.0
psutil>=5.9.0
```

### 3.2 requirements-cuda.txt

```txt
# 继承基础依赖
-r requirements.txt

# CUDA 版本 PyTorch (需要根据 CUDA 版本调整)
# CUDA 11.8
--extra-index-url https://download.pytorch.org/whl/cu118
torch>=2.0.0
torchaudio>=2.0.0
```

### 3.3 pyproject.toml

```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "sensevoice-server"
version = "1.0.0"
description = "SenseVoice 语音识别服务"
readme = "README.md"
requires-python = ">=3.9"
license = {text = "MIT"}
authors = [
    {name = "Cherry Studio Team"}
]
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "python-multipart>=0.0.6",
    "funasr>=1.0.0",
    "modelscope>=1.10.0",
    "librosa>=0.10.0",
    "soundfile>=0.12.0",
    "numpy>=1.24.0",
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "pydantic>=2.0.0",
    "psutil>=5.9.0",
]

[project.scripts]
sensevoice-server = "sensevoice_server.__main__:main"

[tool.setuptools.packages.find]
where = ["."]
include = ["sensevoice_server*"]
```

## 四、启动脚本

### 4.1 Windows 启动脚本 (scripts/start.bat)

```batch
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
python -m sensevoice_server --host %SENSEVOICE_HOST% --port %SENSEVOICE_PORT%

endlocal
```

### 4.2 模型下载脚本 (scripts/download_model.py)

```python
"""
下载 SenseVoice Small 模型
"""
import argparse
from pathlib import Path


def download_from_modelscope(output_dir: str):
    """从 ModelScope 下载"""
    from modelscope import snapshot_download

    print(f"正在从 ModelScope 下载模型到: {output_dir}")
    snapshot_download(
        'iic/SenseVoiceSmall',
        local_dir=output_dir,
        revision="master"
    )
    print("下载完成!")


def download_from_huggingface(output_dir: str):
    """从 HuggingFace 下载"""
    from huggingface_hub import snapshot_download

    print(f"正在从 HuggingFace 下载模型到: {output_dir}")
    snapshot_download(
        repo_id="FunAudioLLM/SenseVoiceSmall",
        local_dir=output_dir,
        repo_type="model"
    )
    print("下载完成!")


def main():
    parser = argparse.ArgumentParser(description="下载 SenseVoice 模型")
    parser.add_argument(
        "--output",
        "-o",
        default="models/sensevoice-small",
        help="输出目录"
    )
    parser.add_argument(
        "--source",
        "-s",
        choices=["modelscope", "huggingface"],
        default="modelscope",
        help="下载源"
    )

    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.source == "modelscope":
        download_from_modelscope(str(output_dir))
    else:
        download_from_huggingface(str(output_dir))


if __name__ == "__main__":
    main()
```

## 五、测试

### 5.1 API 测试 (tests/test_server.py)

```python
"""
API 测试
"""
import pytest
from fastapi.testclient import TestClient

from sensevoice_server.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    """测试健康检查"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_loaded" in data


def test_status(client):
    """测试状态接口"""
    response = client.get("/status")
    assert response.status_code in [200, 503]  # 可能未初始化


def test_transcribe_no_file(client):
    """测试无文件上传"""
    response = client.post("/transcribe")
    assert response.status_code == 422  # Validation error
```

## 六、使用说明

### 6.1 安装

```bash
# 进入目录
cd packages/sensevoice-server

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 下载模型
python scripts/download_model.py -o models/sensevoice-small
```

### 6.2 启动

```bash
# 直接启动
python -m sensevoice_server

# 指定端口
python -m sensevoice_server --port 18080

# 开发模式（热重载）
python -m sensevoice_server --reload

# 使用环境变量
export SENSEVOICE_MODEL_DIR=./models/sensevoice-small
python -m sensevoice_server
```

### 6.3 测试 API

```bash
# 健康检查
curl http://127.0.0.1:18080/health

# 语音识别
curl -X POST "http://127.0.0.1:18080/transcribe" \
  -F "audio=@test.wav" \
  -F "format=wav"
```

## 七、环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| SENSEVOICE_HOST | 127.0.0.1 | 服务地址 |
| SENSEVOICE_PORT | 18080 | 服务端口 |
| SENSEVOICE_DEBUG | false | 调试模式 |
| SENSEVOICE_MODEL_DIR | None | 模型目录 |
| SENSEVOICE_MODEL_NAME | iic/SenseVoiceSmall | 模型名称 |
| SENSEVOICE_DEVICE | auto | 计算设备 (auto/cuda/cpu) |
| SENSEVOICE_USE_GPU | true | 是否使用 GPU |
| SENSEVOICE_GPU_ID | 0 | GPU ID |
| SENSEVOICE_LANGUAGE | auto | 默认语言 |
