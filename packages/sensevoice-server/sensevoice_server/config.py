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
