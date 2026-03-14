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


def _decode_webm(audio_bytes: bytes) -> tuple:
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
