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
