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
