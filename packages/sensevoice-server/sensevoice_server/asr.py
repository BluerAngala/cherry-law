"""
ASR 引擎封装 - SenseVoice Small (ONNX Runtime 版本)
"""
import time
import logging
from typing import Optional, Tuple
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


class ASRError(Exception):
    """ASR 错误"""
    pass


class ASREngine:
    """
    SenseVoice ASR 引擎 - ONNX Runtime 版本

    支持:
    - 中英文混合识别
    - 自动标点
    """

    def __init__(self, config: "ASRConfig"):
        self.config = config
        self.session = None
        self.tokenizer = None
        self._initialized = False
        self._init_error: Optional[str] = None

    def _load_model(self):
        """加载 ONNX 模型"""
        try:
            import onnxruntime as ort

            # 确定模型路径
            if self.config.model_dir:
                model_path = Path(self.config.model_dir) / "model.onnx"
            else:
                # 默认模型路径
                model_path = Path(__file__).parent.parent / "models" / "sensevoice-small" / "model.onnx"

            if not model_path.exists():
                raise ASRError(f"模型文件不存在: {model_path}")

            logger.info(f"正在加载 ONNX 模型: {model_path}")

            # 配置 ONNX Runtime
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            self.session = ort.InferenceSession(str(model_path), providers=providers)

            # 加载 tokenizer
            self._load_tokenizer()

            logger.info("模型加载完成")
            self._initialized = True

        except ImportError as e:
            self._init_error = f"缺少依赖: {e}. 请安装 onnxruntime: pip install onnxruntime"
            logger.error(self._init_error)
            raise ASRError(self._init_error)
        except Exception as e:
            self._init_error = str(e)
            logger.error(f"模型加载失败: {e}")
            raise ASRError(f"模型加载失败: {e}")

    def _load_tokenizer(self):
        """加载 tokenizer"""
        try:
            from tokenizers import Tokenizer

            if self.config.model_dir:
                tokenizer_path = Path(self.config.model_dir) / "tokens.json"
            else:
                tokenizer_path = Path(__file__).parent.parent / "models" / "sensevoice-small" / "tokens.json"

            if tokenizer_path.exists():
                self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
            else:
                logger.warning(f"Tokenizer 文件不存在: {tokenizer_path}，将使用默认处理")
                self.tokenizer = None

        except Exception as e:
            logger.warning(f"加载 tokenizer 失败: {e}")
            self.tokenizer = None

    def _preprocess_audio(self, audio_data: np.ndarray, sample_rate: int) -> np.ndarray:
        """预处理音频数据"""
        import librosa

        # 转为单声道
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)

        # 重采样到 16kHz
        if sample_rate != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=16000)

        # 归一化
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32) / 32768.0

        # 提取特征 (简化版 - 使用 log mel spectrogram)
        mel_spec = librosa.feature.melspectrogram(
            y=audio_data,
            sr=16000,
            n_mels=80,
            n_fft=400,
            hop_length=160,
            win_length=400,
            window='hamming'
        )
        log_mel = librosa.power_to_db(mel_spec, ref=np.max)

        # 转置为 (time, freq)
        features = log_mel.T.astype(np.float32)

        return features

    def initialize(self):
        """初始化引擎"""
        if self._initialized:
            return

        self._load_model()

    def is_ready(self) -> bool:
        """检查是否就绪"""
        return self._initialized and self.session is not None

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
            # 预处理音频
            features = self._preprocess_audio(audio_data, sample_rate)

            # 添加 batch 维度
            features = np.expand_dims(features, axis=0)

            # 获取输入输出名称
            input_name = self.session.get_inputs()[0].name

            # 运行推理
            outputs = self.session.run(None, {input_name: features})

            # 解析输出 (简化处理)
            # 实际应根据模型输出格式解码
            text = self._decode_output(outputs[0])

            processing_time = time.time() - start_time
            logger.debug(f"识别完成: {text[:50]}... ({processing_time:.2f}s)")

            return text, 1.0, language or "zh"

        except Exception as e:
            logger.error(f"识别失败: {e}")
            raise ASRError(f"识别失败: {e}")

    def _decode_output(self, output: np.ndarray) -> str:
        """解码模型输出"""
        # 简化版解码 - 实际应根据模型输出格式实现
        # 这里假设输出是 token IDs
        if self.tokenizer:
            # 使用 tokenizer 解码
            token_ids = output.argmax(axis=-1).flatten().tolist()
            # 过滤特殊 token
            token_ids = [t for t in token_ids if t > 0]
            text = self.tokenizer.decode(token_ids)
        else:
            # 默认处理
            text = "[识别结果]"

        return text

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
        info = {"device": "cpu"}

        if self.session:
            providers = self.session.get_providers()
            info["device"] = ", ".join(providers)
            info["gpu_available"] = "CUDAExecutionProvider" in providers

        return info
