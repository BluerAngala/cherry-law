"""
ASR 引擎测试
"""
import pytest
import sys
import numpy as np
from pathlib import Path

# 添加父目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sensevoice_server.config import ASRConfig
from sensevoice_server.asr import ASREngine, ASRError


@pytest.fixture
def asr_config():
    """ASR 配置 fixture"""
    return ASRConfig(
        model_name="iic/SenseVoiceSmall",
        device="cpu",  # 测试使用 CPU
        language="auto"
    )


@pytest.fixture
def asr_engine(asr_config):
    """ASR 引擎 fixture"""
    engine = ASREngine(asr_config)
    return engine


def test_asr_engine_init(asr_engine):
    """测试 ASR 引擎初始化"""
    assert asr_engine is not None
    assert not asr_engine.is_ready()


def test_asr_engine_device_selection(asr_engine):
    """测试设备选择"""
    device = asr_engine._select_device()
    assert device in ["cpu", "cuda:0"]


def test_asr_engine_transcribe_not_initialized(asr_engine):
    """测试未初始化时转录失败"""
    # 创建测试音频数据
    audio_data = np.zeros(16000, dtype=np.float32)

    with pytest.raises(ASRError):
        asr_engine.transcribe(audio_data)


def test_asr_engine_get_device_info(asr_engine):
    """测试获取设备信息"""
    info = asr_engine.get_device_info()
    assert "device" in info
    assert "gpu_available" in info


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
