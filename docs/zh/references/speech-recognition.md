# 语音识别功能开发文档

> 本文档描述如何在 Cherry Studio 中集成 SenseVoice Small 本地语音识别功能，实现快捷语音助手。

## 一、功能概述

### 1.1 核心功能

- **离线语音识别**：基于 SenseVoice Small 模型，完全本地运行
- **全局快捷键触发**：支持两种录音模式
  - 点击模式：按下快捷键开始录音，再次按下停止
  - 按住模式：按住快捷键录音，松开自动停止
- **识别结果处理**：两种输出模式
  - 直接输出：识别结果直接输出到剪贴板或输入框
  - AI 处理：识别结果发送给 AI 助手进行二次加工

### 1.2 设计原则

- **独立性**：语音服务作为独立模块，不影响现有功能
- **可选性**：用户可选择是否启用语音功能
- **容错性**：Python 服务崩溃不影响 Cherry Studio 主程序
- **渐进式**：支持从简单到复杂的逐步实现

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cherry Studio (Electron)                      │
├─────────────────────────────────────────────────────────────────────┤
│  主进程 (Main Process)                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ SpeechService   │  │AudioCapture     │  │ SenseVoiceClient    │  │
│  │ - 录音状态管理   │  │Service          │  │ - HTTP 通信         │  │
│  │ - 快捷键处理    │  │- 音频采集       │  │ - 健康检查          │  │
│  │ - 结果分发      │  │- 音频编码       │  │- 自动重连           │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           └────────────────────┼──────────────────────┘              │
│                                │                                     │
│                    ┌───────────▼───────────┐                         │
│                    │   IPC Channel         │                         │
│                    │   (speech:*)          │                         │
│                    └───────────┬───────────┘                         │
├────────────────────────────────┼────────────────────────────────────┤
│  渲染进程 (Renderer Process)   │                                     │
│  ┌─────────────────┐  ┌───────▼──────────┐  ┌─────────────────────┐  │
│  │ useSpeech       │  │ SpeechStore      │  │ VoiceInputButton    │  │
│  │ Recognition     │  │ - 状态管理       │  │ - UI 组件           │  │
│  │ - React Hook    │  │- 录音状态        │  │- 录音动画           │  │
│  └─────────────────┘  │- 识别结果        │  │- 状态指示           │  │
│                       └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ HTTP :127.0.0.1:8000
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SenseVoice Server (独立 Python 进程)               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FastAPI Server                                                │  │
│  │  - POST /transcribe    语音识别接口                            │  │
│  │  - GET  /health        健康检查                                │  │
│  │  - GET  /status        服务状态                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  FunASR + SenseVoice Small                                     │  │
│  │  - 支持中英文混合识别                                           │  │
│  │  - 支持自动标点                                                 │  │
│  │  - 支持 GPU/CPU 模式                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责

| 模块                 | 位置     | 职责                                                     |
| -------------------- | -------- | -------------------------------------------------------- |
| SpeechService        | 主进程   | 语音服务主控制器，管理录音状态、处理快捷键、分发识别结果 |
| AudioCaptureService  | 主进程   | 音频采集，使用 Node.js 原生模块录音                      |
| SenseVoiceClient     | 主进程   | HTTP 客户端，与 Python 服务通信                          |
| SpeechStore          | 渲染进程 | Redux store，管理语音相关状态                            |
| useSpeechRecognition | 渲染进程 | React Hook，提供语音识别功能接口                         |
| VoiceInputButton     | 渲染进程 | UI 组件，显示录音按钮和状态                              |

## 三、文件结构

### 3.1 新增文件

```
src/
├── main/
│   ├── services/
│   │   ├── speech/
│   │   │   ├── SpeechService.ts          # 语音服务主控制器
│   │   │   ├── AudioCaptureService.ts    # 音频采集服务
│   │   │   ├── SenseVoiceClient.ts       # HTTP 客户端
│   │   │   ├── types.ts                  # 类型定义
│   │   │   └── index.ts                  # 导出入口
│   │   └── ...
│   ├── configs/
│   │   ├── SpeechConfig.ts               # 语音配置
│   │   └── ...
│   └── ...
├── renderer/
│   └── src/
│       ├── store/
│       │   ├── speech/
│       │   │   ├── speechSlice.ts        # Redux slice
│       │   │   └── index.ts
│       │   └── ...
│       ├── hooks/
│       │   ├── useSpeechRecognition.ts   # React Hook
│       │   └── ...
│       ├── components/
│       │   ├── VoiceInput/
│       │   │   ├── VoiceInputButton.tsx  # 录音按钮组件
│       │   │   ├── VoiceInputOverlay.tsx # 录音浮层
│       │   │   ├── VoiceWaveform.tsx     # 波形动画
│       │   │   └── index.ts
│       │   └── ...
│       ├── pages/settings/
│       │   ├── SpeechSettings/
│       │   │   ├── SpeechSettings.tsx    # 设置页面
│       │   │   └── index.ts
│       │   └── ...
│       └── i18n/
│           └── locales/
│               ├── zh-CN/
│               │   └── speech.json       # 中文翻译
│               └── en-US/
│                   └── speech.json       # 英文翻译
└── packages/
    └── sensevoice-server/                # Python 服务（独立）
        ├── sensevoice_server/
        │   ├── __init__.py
        │   ├── server.py                 # FastAPI 服务
        │   ├── asr.py                    # ASR 引擎封装
        │   └── config.py                 # 配置
        ├── scripts/
        │   ├── start.sh                  # 启动脚本
        │   └── install.sh                # 安装脚本
        ├── requirements.txt
        ├── pyproject.toml
        └── README.md
```

### 3.2 修改文件

```
src/
├── main/
│   ├── services/
│   │   ├── ShortcutService.ts            # 添加语音快捷键
│   │   └── index.ts                      # 导出 SpeechService
│   ├── ipc.ts                            # 添加 IPC 处理
│   └── index.ts                          # 初始化语音服务
├── renderer/
│   └── src/
│       ├── store/
│       │   ├── index.ts                  # 添加 speech reducer
│       │   └── shortcuts.ts              # 添加语音快捷键配置
│       ├── windows/mini/
│       │   └── home/
│       │       └── HomeWindow.tsx        # 集成语音按钮
│       └── i18n/
│           └── index.ts                  # 加载 speech 翻译
├── packages/
│   └── shared/
│       ├── IpcChannel.ts                 # 添加语音 IPC 通道
│       └── config/
│           └── types.ts                  # 添加语音配置类型
└── package.json                          # 添加启动 Python 服务脚本
```

## 四、接口设计

### 4.1 IPC 通道定义

```typescript
// packages/shared/IpcChannel.ts

export const SpeechIpcChannel = {
  // 服务状态
  Speech_GetStatus: "speech:get-status",
  Speech_StatusChanged: "speech:status-changed",

  // 录音控制
  Speech_StartRecording: "speech:start-recording",
  Speech_StopRecording: "speech:stop-recording",
  Speech_ToggleRecording: "speech:toggle-recording",
  Speech_RecordingStateChanged: "speech:recording-state-changed",

  // 识别结果
  Speech_RecognitionResult: "speech:recognition-result",
  Speech_RecognitionError: "speech:recognition-error",

  // 配置
  Speech_UpdateConfig: "speech:update-config",
  Speech_GetConfig: "speech:get-config",

  // 服务管理
  Speech_StartServer: "speech:start-server",
  Speech_StopServer: "speech:stop-server",
  Speech_CheckServerHealth: "speech:check-server-health",
} as const;
```

### 4.2 类型定义

```typescript
// src/main/services/speech/types.ts

export interface SpeechConfig {
  enabled: boolean;
  serverUrl: string;
  serverPort: number;
  autoStartServer: boolean;

  // 录音配置
  sampleRate: number;
  channels: number;

  // 快捷键配置
  shortcutToggle: string[];
  shortcutHold: string[];

  // 输出模式
  outputMode: "direct" | "ai-process";

  // AI 处理配置
  aiAssistantId?: string;
  aiPrompt?: string;
}

export type RecordingState = "idle" | "recording" | "processing";

export interface SpeechState {
  enabled: boolean;
  serverConnected: boolean;
  recordingState: RecordingState;
  lastResult: string | null;
  error: string | null;
}

export interface RecognitionResult {
  text: string;
  confidence: number;
  duration: number;
  timestamp: number;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
}
```

### 4.3 Python 服务 API

```yaml
# SenseVoice Server API

# 健康检查
GET /health
Response:
  {
    "status": "healthy",
    "model_loaded": true,
    "gpu_available": true
  }

# 语音识别
POST /transcribe
Request:
  Content-Type: multipart/form-data
  audio: binary (WAV/PCM)
  format: "wav" | "pcm"
  sample_rate: 16000

Response:
  {
    "text": "识别的文本内容",
    "confidence": 0.95,
    "duration": 2.5,
    "language": "zh"
  }

# 服务状态
GET /status
Response:
  {
    "model": "sensevoice-small",
    "device": "cuda",
    "memory_usage": "2.1GB",
    "uptime": 3600
  }
```

## 五、实现步骤

### Phase 1: Python 服务搭建（独立）

**目标**：创建可独立运行的 SenseVoice 服务

**步骤**：

1. 创建 `packages/sensevoice-server/` 目录结构
2. 编写 FastAPI 服务代码
3. 封装 FunASR + SenseVoice 模型加载
4. 编写安装和启动脚本
5. 测试 API 接口

**验收标准**：

- [ ] 服务可通过 `python -m sensevoice_server` 启动
- [ ] `/health` 接口返回正常
- [ ] `/transcribe` 接口能正确识别测试音频

### Phase 2: 主进程服务实现

**目标**：在 Electron 主进程实现语音服务

**步骤**：

1. 创建 `SpeechService` 基础框架
2. 实现 `SenseVoiceClient` HTTP 客户端
3. 实现 `AudioCaptureService` 音频采集
4. 添加 IPC 处理器
5. 实现服务状态管理

**验收标准**：

- [ ] 能检测 Python 服务是否运行
- [ ] 能采集麦克风音频
- [ ] 能发送音频到 Python 服务并获取结果

### Phase 3: 快捷键集成

**目标**：实现全局快捷键触发录音

**步骤**：

1. 在 `ShortcutService` 添加语音快捷键
2. 实现点击模式（toggle）
3. 实现按住模式（hold）- 需要 `uiohook-napi`
4. 添加快捷键配置到设置

**验收标准**：

- [ ] 点击快捷键能开始/停止录音
- [ ] 按住快捷键能录音，松开停止
- [ ] 快捷键可在设置中自定义

### Phase 4: UI 集成

**目标**：在 MiniWindow 添加语音输入按钮

**步骤**：

1. 创建 `VoiceInputButton` 组件
2. 创建 `VoiceWaveform` 波形动画
3. 创建 `useSpeechRecognition` Hook
4. 集成到 MiniWindow
5. 添加设置页面

**验收标准**：

- [ ] MiniWindow 显示语音按钮
- [ ] 点击按钮能录音
- [ ] 显示录音状态动画
- [ ] 识别结果显示在输入框

### Phase 5: AI 处理模式

**目标**：实现识别结果发送给 AI 助手

**步骤**：

1. 添加输出模式选择 UI
2. 实现 AI 处理逻辑
3. 复用现有消息发送流程
4. 添加自定义 prompt 支持

**验收标准**：

- [ ] 可选择直接输出或 AI 处理
- [ ] AI 处理模式能发送识别结果给助手
- [ ] 支持自定义处理 prompt

## 六、依赖项

### 6.1 Node.js 依赖

```json
{
  "dependencies": {
    "node-record-lpcm16": "^1.0.0",
    "uiohook-napi": "^1.0.0"
  }
}
```

### 6.2 Python 依赖

```txt
# requirements.txt
fastapi>=0.104.0
uvicorn>=0.24.0
funasr>=1.0.0
torch>=2.0.0
torchaudio>=2.0.0
modelscope>=1.10.0
numpy>=1.24.0
pydub>=0.25.0
python-multipart>=0.0.6
```

## 七、配置项

### 7.1 默认配置

```typescript
// src/main/configs/SpeechConfig.ts

export const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  enabled: false,
  serverUrl: "http://127.0.0.1",
  serverPort: 18080,
  autoStartServer: false,

  sampleRate: 16000,
  channels: 1,

  shortcutToggle: ["CommandOrControl", "Shift", "V"],
  shortcutHold: ["CommandOrControl", "Shift", "B"],

  outputMode: "direct",

  aiPrompt: "请帮我整理以下语音识别内容，使其更加通顺：",
};
```

### 7.2 用户设置 UI

```
语音设置
├── 启用语音识别 [开关]
├── 服务状态
│   ├── 连接状态：已连接/未连接
│   ├── 启动服务 [按钮]
│   └── 检查健康 [按钮]
├── 快捷键
│   ├── 点击录音：[CommandOrControl + Shift + V]
│   └── 按住录音：[CommandOrControl + Shift + B]
├── 输出模式
│   ├── ○ 直接输出
│   └── ● AI 处理
│       ├── 助手选择：[下拉选择]
│       └── 处理提示词：[文本框]
└── 高级设置
    ├── 服务器地址：[输入框]
    ├── 采样率：[下拉选择]
    └── 自动启动服务 [开关]
```

## 八、错误处理

### 8.1 错误类型

```typescript
export enum SpeechErrorType {
  SERVER_NOT_RUNNING = "SERVER_NOT_RUNNING",
  SERVER_CONNECTION_FAILED = "SERVER_CONNECTION_FAILED",
  MICROPHONE_PERMISSION_DENIED = "MICROPHONE_PERMISSION_DENIED",
  RECORDING_FAILED = "RECORDING_FAILED",
  RECOGNITION_FAILED = "RECOGNITION_FAILED",
  MODEL_NOT_LOADED = "MODEL_NOT_LOADED",
  GPU_NOT_AVAILABLE = "GPU_NOT_AVAILABLE",
}

export class SpeechError extends Error {
  constructor(
    public type: SpeechErrorType,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = "SpeechError";
  }
}
```

### 8.2 错误处理策略

| 错误类型                     | 处理方式                          |
| ---------------------------- | --------------------------------- |
| SERVER_NOT_RUNNING           | 提示用户启动服务，显示启动按钮    |
| SERVER_CONNECTION_FAILED     | 自动重试 3 次，失败后提示检查服务 |
| MICROPHONE_PERMISSION_DENIED | 引导用户到系统设置授权            |
| RECORDING_FAILED             | 重置录音状态，提示用户重试        |
| RECOGNITION_FAILED           | 显示错误信息，保留录音可重试      |
| MODEL_NOT_LOADED             | 提示等待模型加载完成              |
| GPU_NOT_AVAILABLE            | 提示将使用 CPU 模式（较慢）       |

## 九、测试计划

### 9.1 单元测试

- [ ] `SpeechService` 状态管理测试
- [ ] `SenseVoiceClient` HTTP 请求测试
- [ ] `AudioCaptureService` 音频采集测试
- [ ] `speechSlice` Redux 测试

### 9.2 集成测试

- [ ] 完整录音 → 识别流程测试
- [ ] 快捷键触发测试
- [ ] 服务断连重连测试
- [ ] AI 处理模式测试

### 9.3 E2E 测试

- [ ] MiniWindow 语音输入测试
- [ ] 设置页面配置测试
- [ ] 多语言识别测试

## 十、性能优化

### 10.1 音频处理优化

- 使用 WebWorker 进行音频编码
- 实现音频流式传输，减少延迟
- 支持音频压缩（Opus）

### 10.2 服务优化

- Python 服务预热模型
- 实现连接池复用
- 支持批量识别请求

### 10.3 UI 优化

- 录音动画使用 CSS 动画
- 状态更新使用节流
- 组件懒加载

## 十一、安全考虑

### 11.1 数据安全

- 音频数据仅在本地处理，不上传云端
- 识别结果不自动保存（除非用户主动保存）
- 服务仅监听 localhost

### 11.2 权限管理

- 首次使用请求麦克风权限
- 明确告知用户数据用途
- 提供完全禁用选项

## 十二、后续扩展

### 12.1 短期扩展

- 支持更多语音模型（Whisper、Paraformer）
- 支持实时语音识别（流式）
- 支持语音命令（快捷指令）

### 12.2 长期扩展

- 支持语音合成（TTS）
- 支持多语言实时翻译
- 支持语音情感分析

---

## 附录

### A. SenseVoice 模型下载

```bash
# 使用 modelscope 下载
pip install modelscope
python -c "from modelscope import snapshot_download; snapshot_download('iic/SenseVoiceSmall', local_dir='./models/sensevoice-small')"

# 或使用 huggingface
pip install huggingface_hub
huggingface-cli download FunAudioLLM/SenseVoiceSmall --local-dir ./models/sensevoice-small
```

### B. 开发调试

```bash
# 启动 Python 服务（开发模式）
cd packages/sensevoice-server
python -m sensevoice_server --reload --port 18080

# 启动 Cherry Studio（开发模式）
pnpm dev

# 查看语音服务日志
tail -f logs/speech.log
```

### C. 常见问题

**Q: Python 服务启动失败？**
A: 检查 Python 版本（需要 3.9+）、CUDA 版本、模型是否下载完整

**Q: 录音没有声音？**
A: 检查系统麦克风权限、默认录音设备设置

**Q: 识别结果为空？**
A: 检查音频格式、采样率是否匹配，查看 Python 服务日志
