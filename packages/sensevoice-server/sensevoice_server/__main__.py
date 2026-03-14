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
