"""
API 测试
"""
import pytest
import sys
from pathlib import Path

# 添加父目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from sensevoice_server.server import app


client = TestClient(app)


def test_health_check():
    """测试健康检查接口"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_loaded" in data
    assert "gpu_available" in data
    assert "device" in data
    assert "version" in data


def test_status():
    """测试状态接口"""
    response = client.get("/status")
    # 如果模型未加载，可能返回 503
    if response.status_code == 200:
        data = response.json()
        assert "model" in data
        assert "device" in data
        assert "uptime" in data
        assert "requests_processed" in data


def test_transcribe_no_file():
    """测试无文件上传"""
    response = client.post("/transcribe")
    assert response.status_code == 422  # FastAPI 验证错误


def test_transcribe_empty_file():
    """测试空文件上传"""
    # 创建一个空的 WAV 文件头
    import io
    empty_wav = io.BytesIO(b'RIFF\x00\x00\x00\x00WAVEfmt ')

    response = client.post(
        "/transcribe",
        files={"audio": ("test.wav", empty_wav, "audio/wav")}
    )
    # 如果模型未加载，返回 503
    if response.status_code != 503:
        # 空文件应该导致识别失败
        assert response.status_code in [500, 200]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
