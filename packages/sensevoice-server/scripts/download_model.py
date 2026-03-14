#!/usr/bin/env python3
"""
SenseVoice 模型下载脚本
"""
import os
import sys
from pathlib import Path


def download_with_modelscope():
    """使用 ModelScope 下载模型"""
    try:
        from modelscope import snapshot_download

        print("使用 ModelScope 下载 SenseVoice Small 模型...")
        model_dir = snapshot_download(
            "iic/SenseVoiceSmall",
            local_dir="./models/sensevoice-small"
        )
        print(f"模型下载完成: {model_dir}")
        return True
    except Exception as e:
        print(f"ModelScope 下载失败: {e}")
        return False


def download_with_huggingface():
    """使用 HuggingFace 下载模型"""
    try:
        from huggingface_hub import snapshot_download

        print("使用 HuggingFace 下载 SenseVoice Small 模型...")
        model_dir = snapshot_download(
            "FunAudioLLM/SenseVoiceSmall",
            local_dir="./models/sensevoice-small"
        )
        print(f"模型下载完成: {model_dir}")
        return True
    except Exception as e:
        print(f"HuggingFace 下载失败: {e}")
        return False


def main():
    # 创建模型目录
    models_dir = Path("./models")
    models_dir.mkdir(exist_ok=True)

    # 检查模型是否已存在
    model_path = models_dir / "sensevoice-small"
    if model_path.exists():
        print(f"模型已存在: {model_path}")
        response = input("是否重新下载? (y/N): ")
        if response.lower() != 'y':
            print("跳过下载")
            return

    # 尝试下载
    print("========================================")
    print("SenseVoice Small 模型下载")
    print("========================================")

    # 优先使用 ModelScope（国内更快）
    if download_with_modelscope():
        return

    # 备选 HuggingFace
    print("\n尝试使用 HuggingFace 下载...")
    if download_with_huggingface():
        return

    print("\n错误: 模型下载失败")
    print("请检查网络连接，或手动下载模型:")
    print("  ModelScope: https://modelscope.cn/models/iic/SenseVoiceSmall")
    print("  HuggingFace: https://huggingface.co/FunAudioLLM/SenseVoiceSmall")
    sys.exit(1)


if __name__ == "__main__":
    main()
