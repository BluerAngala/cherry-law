# Electron 语音服务实现规范

> 本文档详细描述 Cherry Studio 中语音服务的 Electron 端实现细节。

## 一、主进程服务

### 1.1 类型定义 (src/main/services/speech/types.ts)

```typescript
/**
 * 语音服务类型定义
 */

export interface SpeechConfig {
  enabled: boolean
  serverUrl: string
  serverPort: number
  autoStartServer: boolean

  sampleRate: number
  channels: number

  shortcutToggle: string[]
  shortcutHold: string[]

  outputMode: 'direct' | 'ai-process'

  aiAssistantId?: string
  aiPrompt?: string
}

export type RecordingState = 'idle' | 'recording' | 'processing'

export interface SpeechState {
  enabled: boolean
  serverConnected: boolean
  recordingState: RecordingState
  lastResult: string | null
  error: string | null
}

export interface RecognitionResult {
  text: string
  confidence: number
  duration: number
  timestamp: number
  language: string
}

export interface AudioChunk {
  data: Buffer
  timestamp: number
}

export enum SpeechErrorType {
  SERVER_NOT_RUNNING = 'SERVER_NOT_RUNNING',
  SERVER_CONNECTION_FAILED = 'SERVER_CONNECTION_FAILED',
  MICROPHONE_PERMISSION_DENIED = 'MICROPHONE_PERMISSION_DENIED',
  RECORDING_FAILED = 'RECORDING_FAILED',
  RECOGNITION_FAILED = 'RECOGNITION_FAILED',
  MODEL_NOT_LOADED = 'MODEL_NOT_LOADED',
  GPU_NOT_AVAILABLE = 'GPU_NOT_AVAILABLE'
}

export class SpeechError extends Error {
  constructor(
    public type: SpeechErrorType,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'SpeechError'
  }
}

export interface ServerHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  model_loaded: boolean
  gpu_available: boolean
  device: string
}

export interface TranscribeResponse {
  text: string
  confidence: number
  duration: number
  language: string
  processing_time: number
}
```

### 1.2 SenseVoice HTTP 客户端 (src/main/services/speech/SenseVoiceClient.ts)

```typescript
/**
 * SenseVoice Server HTTP 客户端
 */
import { loggerService } from '@logger'
import type { ServerHealthStatus, TranscribeResponse, SpeechConfig } from './types'
import { SpeechError, SpeechErrorType } from './types'

const logger = loggerService.withContext('SenseVoiceClient')

export class SenseVoiceClient {
  private baseUrl: string
  private timeout: number = 30000
  private retryCount: number = 3
  private retryDelay: number = 1000

  constructor(config: SpeechConfig) {
    this.baseUrl = `${config.serverUrl}:${config.serverPort}`
  }

  updateConfig(config: SpeechConfig) {
    this.baseUrl = `${config.serverUrl}:${config.serverPort}`
  }

  async checkHealth(): Promise<ServerHealthStatus> {
    const url = `${this.baseUrl}/health`

    for (let i = 0; i < this.retryCount; i++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        return await response.json()
      } catch (error) {
        logger.debug(`健康检查失败 (尝试 ${i + 1}/${this.retryCount}):`, error as Error)

        if (i < this.retryCount - 1) {
          await this.delay(this.retryDelay)
        }
      }
    }

    throw new SpeechError(
      SpeechErrorType.SERVER_CONNECTION_FAILED,
      '无法连接到语音服务',
      { url }
    )
  }

  async transcribe(
    audioBuffer: Buffer,
    format: string = 'wav',
    sampleRate: number = 16000,
    language?: string
  ): Promise<TranscribeResponse> {
    const url = `${this.baseUrl}/transcribe`

    try {
      const formData = new FormData()
      const blob = new Blob([audioBuffer], { type: `audio/${format}` })
      formData.append('audio', blob, `audio.${format}`)
      formData.append('format', format)
      formData.append('sample_rate', sampleRate.toString())

      if (language) {
        formData.append('language', language)
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new SpeechError(
          SpeechErrorType.RECOGNITION_FAILED,
          errorData.detail || `识别失败: HTTP ${response.status}`,
          errorData
        )
      }

      return await response.json()
    } catch (error) {
      if (error instanceof SpeechError) {
        throw error
      }

      throw new SpeechError(
        SpeechErrorType.SERVER_CONNECTION_FAILED,
        '语音识别请求失败',
        { originalError: error }
      )
    }
  }

  async getStatus(): Promise<{
    model: string
    device: string
    memory_usage: string | null
    uptime: number
    requests_processed: number
  }> {
    const url = `${this.baseUrl}/status`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`获取状态失败: HTTP ${response.status}`)
    }

    return await response.json()
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### 1.3 音频采集服务 (src/main/services/speech/AudioCaptureService.ts)

```typescript
/**
 * 音频采集服务
 * 
 * 注意：需要安装 node-record-lpcm16 依赖
 * pnpm add node-record-lpcm16
 */
import { loggerService } from '@logger'
import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { SpeechError, SpeechErrorType } from './types'
import * as fs from 'fs'
import * as path from 'path'

const logger = loggerService.withContext('AudioCaptureService')

export interface AudioCaptureOptions {
  sampleRate: number
  channels: number
  audioType?: 'wav' | 'raw'
}

export class AudioCaptureService {
  private recordingProcess: ChildProcess | null = null
  private audioChunks: Buffer[] = []
  private isRecording: boolean = false
  private options: AudioCaptureOptions

  constructor(options: AudioCaptureOptions) {
    this.options = {
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      ...options
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      logger.warn('录音已在进行中')
      return
    }

    try {
      this.audioChunks = []
      this.isRecording = true

      const isWin = process.platform === 'win32'
      const isMac = process.platform === 'darwin'

      if (isWin) {
        await this.startRecordingWindows()
      } else if (isMac) {
        await this.startRecordingMac()
      } else {
        await this.startRecordingLinux()
      }

      logger.info('开始录音', { options: this.options })
    } catch (error) {
      this.isRecording = false
      throw new SpeechError(
        SpeechErrorType.RECORDING_FAILED,
        '启动录音失败',
        { originalError: error }
      )
    }
  }

  private async startRecordingWindows(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(
        SpeechErrorType.RECORDING_FAILED,
        '未找到 FFmpeg，请安装 FFmpeg'
      )
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
      '-i', 'audio=麦克风',
      '-acodec', 'pcm_s16le',
      '-ar', this.options.sampleRate.toString(),
      '-ac', this.options.channels.toString(),
      '-f', 'wav',
      '-'
    ])

    this.setupProcessHandlers()
  }

  private async startRecordingMac(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(
        SpeechErrorType.RECORDING_FAILED,
        '未找到 FFmpeg，请安装 FFmpeg'
      )
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f', 'avfoundation',
      '-i', ':0',
      '-acodec', 'pcm_s16le',
      '-ar', this.options.sampleRate.toString(),
      '-ac', this.options.channels.toString(),
      '-f', 'wav',
      '-'
    ])

    this.setupProcessHandlers()
  }

  private async startRecordingLinux(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(
        SpeechErrorType.RECORDING_FAILED,
        '未找到 FFmpeg，请安装 FFmpeg'
      )
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f', 'alsa',
      '-i', 'default',
      '-acodec', 'pcm_s16le',
      '-ar', this.options.sampleRate.toString(),
      '-ac', this.options.channels.toString(),
      '-f', 'wav',
      '-'
    ])

    this.setupProcessHandlers()
  }

  private setupProcessHandlers(): void {
    if (!this.recordingProcess) return

    this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
      this.audioChunks.push(chunk)
    })

    this.recordingProcess.stderr?.on('data', (data: Buffer) => {
      logger.debug('FFmpeg stderr:', data.toString())
    })

    this.recordingProcess.on('error', (error) => {
      logger.error('录音进程错误:', error)
      this.isRecording = false
    })

    this.recordingProcess.on('close', (code) => {
      logger.debug('录音进程关闭:', code)
      this.isRecording = false
    })
  }

  async stopRecording(): Promise<Buffer> {
    if (!this.isRecording || !this.recordingProcess) {
      throw new SpeechError(
        SpeechErrorType.RECORDING_FAILED,
        '没有正在进行的录音'
      )
    }

    return new Promise((resolve, reject) => {
      if (!this.recordingProcess) {
        reject(new SpeechError(SpeechErrorType.RECORDING_FAILED, '录音进程不存在'))
        return
      }

      this.recordingProcess.on('close', () => {
        this.isRecording = false
        const audioBuffer = Buffer.concat(this.audioChunks)
        logger.info('录音完成', { size: audioBuffer.length })
        resolve(audioBuffer)
      })

      this.recordingProcess.stdin?.write('q')
      this.recordingProcess.kill('SIGTERM')
    })
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  private getFfmpegPath(): string | null {
    const isDev = !app.isPackaged

    if (isDev) {
      return 'ffmpeg'
    }

    const ffmpegPath = path.join(
      app.getAppPath(),
      'resources',
      'ffmpeg',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    )

    if (fs.existsSync(ffmpegPath)) {
      return ffmpegPath
    }

    return 'ffmpeg'
  }

  destroy(): void {
    if (this.recordingProcess) {
      this.recordingProcess.kill()
      this.recordingProcess = null
    }
    this.audioChunks = []
    this.isRecording = false
  }
}
```

### 1.4 语音服务主控制器 (src/main/services/speech/SpeechService.ts)

```typescript
/**
 * 语音服务主控制器
 */
import { loggerService } from '@logger'
import { ipcMain, BrowserWindow } from 'electron'
import { SpeechIpcChannel } from '@shared/IpcChannel'
import type { SpeechConfig, SpeechState, RecordingState, RecognitionResult } from './types'
import { SpeechError, SpeechErrorType } from './types'
import { SenseVoiceClient } from './SenseVoiceClient'
import { AudioCaptureService } from './AudioCaptureService'

const logger = loggerService.withContext('SpeechService')

const DEFAULT_CONFIG: SpeechConfig = {
  enabled: false,
  serverUrl: 'http://127.0.0.1',
  serverPort: 18080,
  autoStartServer: false,
  sampleRate: 16000,
  channels: 1,
  shortcutToggle: ['CommandOrControl', 'Shift', 'V'],
  shortcutHold: ['CommandOrControl', 'Shift', 'B'],
  outputMode: 'direct',
  aiPrompt: '请帮我整理以下语音识别内容，使其更加通顺：'
}

export class SpeechService {
  private static instance: SpeechService | null = null

  private config: SpeechConfig
  private state: SpeechState
  private client: SenseVoiceClient
  private audioCapture: AudioCaptureService | null = null
  private mainWindow: BrowserWindow | null = null

  private healthCheckInterval: NodeJS.Timeout | null = null
  private recordingStartTime: number = 0

  private constructor() {
    this.config = { ...DEFAULT_CONFIG }
    this.state = {
      enabled: false,
      serverConnected: false,
      recordingState: 'idle',
      lastResult: null,
      error: null
    }
    this.client = new SenseVoiceClient(this.config)
    this.setupIpcHandlers()
  }

  static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService()
    }
    return SpeechService.instance
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  private setupIpcHandlers() {
    ipcMain.handle(SpeechIpcChannel.Speech_GetStatus, () => this.getStatus())
    ipcMain.handle(SpeechIpcChannel.Speech_GetConfig, () => this.getConfig())
    ipcMain.handle(SpeechIpcChannel.Speech_UpdateConfig, (_, config: Partial<SpeechConfig>) =>
      this.updateConfig(config)
    )
    ipcMain.handle(SpeechIpcChannel.Speech_StartRecording, () => this.startRecording())
    ipcMain.handle(SpeechIpcChannel.Speech_StopRecording, () => this.stopRecording())
    ipcMain.handle(SpeechIpcChannel.Speech_ToggleRecording, () => this.toggleRecording())
    ipcMain.handle(SpeechIpcChannel.Speech_CheckServerHealth, () => this.checkServerHealth())
  }

  async initialize(): Promise<void> {
    logger.info('初始化语音服务')

    this.audioCapture = new AudioCaptureService({
      sampleRate: this.config.sampleRate,
      channels: this.config.channels
    })

    if (this.config.enabled) {
      this.startHealthCheck()
    }
  }

  async checkServerHealth(): Promise<{ connected: boolean; error?: string }> {
    try {
      const health = await this.client.checkHealth()
      const connected = health.status === 'healthy' && health.model_loaded

      this.updateState({ serverConnected: connected })

      return { connected }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.updateState({ serverConnected: false })

      return { connected: false, error: errorMessage }
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.checkServerHealth()

    this.healthCheckInterval = setInterval(() => {
      this.checkServerHealth()
    }, 30000)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  async startRecording(): Promise<void> {
    if (this.state.recordingState !== 'idle') {
      logger.warn('录音已在进行中')
      return
    }

    if (!this.state.serverConnected) {
      throw new SpeechError(
        SpeechErrorType.SERVER_NOT_RUNNING,
        '语音服务未连接，请先启动服务'
      )
    }

    try {
      this.updateState({ recordingState: 'recording' })
      this.recordingStartTime = Date.now()

      await this.audioCapture?.startRecording()

      this.sendToRenderer(SpeechIpcChannel.Speech_RecordingStateChanged, {
        state: 'recording',
        timestamp: this.recordingStartTime
      })

      logger.info('开始录音')
    } catch (error) {
      this.updateState({ recordingState: 'idle' })
      throw error
    }
  }

  async stopRecording(): Promise<RecognitionResult | null> {
    if (this.state.recordingState !== 'recording') {
      logger.warn('没有正在进行的录音')
      return null
    }

    try {
      this.updateState({ recordingState: 'processing' })
      this.sendToRenderer(SpeechIpcChannel.Speech_RecordingStateChanged, {
        state: 'processing'
      })

      const audioBuffer = await this.audioCapture?.stopRecording()

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new SpeechError(
          SpeechErrorType.RECORDING_FAILED,
          '录音数据为空'
        )
      }

      const result = await this.client.transcribe(
        audioBuffer,
        'wav',
        this.config.sampleRate
      )

      const recognitionResult: RecognitionResult = {
        text: result.text,
        confidence: result.confidence,
        duration: result.duration,
        timestamp: Date.now(),
        language: result.language
      }

      this.updateState({
        recordingState: 'idle',
        lastResult: result.text
      })

      this.sendToRenderer(SpeechIpcChannel.Speech_RecognitionResult, recognitionResult)

      logger.info('识别完成', { text: result.text.substring(0, 50) })

      return recognitionResult
    } catch (error) {
      this.updateState({ recordingState: 'idle' })

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.sendToRenderer(SpeechIpcChannel.Speech_RecognitionError, {
        error: errorMessage
      })

      throw error
    }
  }

  async toggleRecording(): Promise<RecognitionResult | null> {
    if (this.state.recordingState === 'idle') {
      await this.startRecording()
      return null
    } else if (this.state.recordingState === 'recording') {
      return this.stopRecording()
    }
    return null
  }

  getConfig(): SpeechConfig {
    return { ...this.config }
  }

  async updateConfig(config: Partial<SpeechConfig>): Promise<void> {
    this.config = { ...this.config, ...config }
    this.client.updateConfig(this.config)

    if (this.audioCapture) {
      this.audioCapture = new AudioCaptureService({
        sampleRate: this.config.sampleRate,
        channels: this.config.channels
      })
    }

    if (this.config.enabled && !this.healthCheckInterval) {
      this.startHealthCheck()
    } else if (!this.config.enabled && this.healthCheckInterval) {
      this.stopHealthCheck()
    }

    logger.info('配置已更新', config)
  }

  getStatus(): SpeechState {
    return { ...this.state }
  }

  private updateState(partial: Partial<SpeechState>): void {
    this.state = { ...this.state, ...partial }
    this.sendToRenderer(SpeechIpcChannel.Speech_StatusChanged, this.state)
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  destroy(): void {
    this.stopHealthCheck()
    this.audioCapture?.destroy()
    this.audioCapture = null
  }
}

export const speechService = SpeechService.getInstance()
```

### 1.5 导出入口 (src/main/services/speech/index.ts)

```typescript
export { SpeechService, speechService } from './SpeechService'
export { SenseVoiceClient } from './SenseVoiceClient'
export { AudioCaptureService } from './AudioCaptureService'
export * from './types'
```

## 二、IPC 通道定义

### 2.1 添加到 packages/shared/IpcChannel.ts

```typescript
export const SpeechIpcChannel = {
  Speech_GetStatus: 'speech:get-status',
  Speech_StatusChanged: 'speech:status-changed',
  Speech_StartRecording: 'speech:start-recording',
  Speech_StopRecording: 'speech:stop-recording',
  Speech_ToggleRecording: 'speech:toggle-recording',
  Speech_RecordingStateChanged: 'speech:recording-state-changed',
  Speech_RecognitionResult: 'speech:recognition-result',
  Speech_RecognitionError: 'speech:recognition-error',
  Speech_UpdateConfig: 'speech:update-config',
  Speech_GetConfig: 'speech:get-config',
  Speech_StartServer: 'speech:start-server',
  Speech_StopServer: 'speech:stop-server',
  Speech_CheckServerHealth: 'speech:check-server-health'
} as const
```

## 三、渲染进程

### 3.1 Redux Slice (src/renderer/src/store/speech/speechSlice.ts)

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RecordingState } from '@renderer/types/speech'

export interface SpeechState {
  enabled: boolean
  serverConnected: boolean
  recordingState: RecordingState
  lastResult: string | null
  error: string | null
  isProcessing: boolean
}

const initialState: SpeechState = {
  enabled: false,
  serverConnected: false,
  recordingState: 'idle',
  lastResult: null,
  error: null,
  isProcessing: false
}

const speechSlice = createSlice({
  name: 'speech',
  initialState,
  reducers: {
    setEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload
    },
    setServerConnected: (state, action: PayloadAction<boolean>) => {
      state.serverConnected = action.payload
    },
    setRecordingState: (state, action: PayloadAction<RecordingState>) => {
      state.recordingState = action.payload
      state.isProcessing = action.payload === 'processing'
    },
    setLastResult: (state, action: PayloadAction<string>) => {
      state.lastResult = action.payload
      state.error = null
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
    reset: () => initialState
  }
})

export const {
  setEnabled,
  setServerConnected,
  setRecordingState,
  setLastResult,
  setError,
  clearError,
  reset
} = speechSlice.actions

export default speechSlice.reducer
```

### 3.2 React Hook (src/renderer/src/hooks/useSpeechRecognition.ts)

```typescript
import { useEffect, useCallback, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { SpeechIpcChannel } from '@shared/IpcChannel'
import type { RecognitionResult, RecordingState } from '@renderer/types/speech'
import {
  setServerConnected,
  setRecordingState,
  setLastResult,
  setError
} from '@renderer/store/speech/speechSlice'
import { RootState } from '@renderer/store'

export function useSpeechRecognition() {
  const dispatch = useDispatch()
  const speechState = useSelector((state: RootState) => state.speech)

  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const removers: (() => void)[] = []

    const statusRemover = window.electron?.ipcRenderer.on(
      SpeechIpcChannel.Speech_StatusChanged,
      (_, status) => {
        dispatch(setServerConnected(status.serverConnected))
      }
    )
    if (statusRemover) removers.push(statusRemover)

    const stateRemover = window.electron?.ipcRenderer.on(
      SpeechIpcChannel.Speech_RecordingStateChanged,
      (_, data) => {
        dispatch(setRecordingState(data.state as RecordingState))
      }
    )
    if (stateRemover) removers.push(stateRemover)

    const resultRemover = window.electron?.ipcRenderer.on(
      SpeechIpcChannel.Speech_RecognitionResult,
      (_, result: RecognitionResult) => {
        dispatch(setLastResult(result.text))
      }
    )
    if (resultRemover) removers.push(resultRemover)

    const errorRemover = window.electron?.ipcRenderer.on(
      SpeechIpcChannel.Speech_RecognitionError,
      (_, data) => {
        dispatch(setError(data.error))
      }
    )
    if (errorRemover) removers.push(errorRemover)

    setIsInitialized(true)

    return () => {
      removers.forEach(remover => remover())
    }
  }, [dispatch])

  const startRecording = useCallback(async () => {
    try {
      await window.electron?.ipcRenderer.invoke(SpeechIpcChannel.Speech_StartRecording)
    } catch (error) {
      dispatch(setError((error as Error).message))
    }
  }, [dispatch])

  const stopRecording = useCallback(async () => {
    try {
      await window.electron?.ipcRenderer.invoke(SpeechIpcChannel.Speech_StopRecording)
    } catch (error) {
      dispatch(setError((error as Error).message))
    }
  }, [dispatch])

  const toggleRecording = useCallback(async () => {
    try {
      await window.electron?.ipcRenderer.invoke(SpeechIpcChannel.Speech_ToggleRecording)
    } catch (error) {
      dispatch(setError((error as Error).message))
    }
  }, [dispatch])

  const checkServerHealth = useCallback(async () => {
    const result = await window.electron?.ipcRenderer.invoke(SpeechIpcChannel.Speech_CheckServerHealth)
    dispatch(setServerConnected(result?.connected ?? false))
    return result
  }, [dispatch])

  return {
    ...speechState,
    isInitialized,
    startRecording,
    stopRecording,
    toggleRecording,
    checkServerHealth
  }
}
```

### 3.3 语音输入按钮组件 (src/renderer/src/components/VoiceInput/VoiceInputButton.tsx)

```typescript
import { FC, useCallback } from 'react'
import { Button, Tooltip } from 'antd'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import styled, { keyframes } from 'styled-components'
import { useSpeechRecognition } from '@renderer/hooks/useSpeechRecognition'
import { useTranslation } from 'react-i18next'

const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
`

const RecordingButton = styled(Button)<{ $isRecording: boolean }>`
  ${({ $isRecording }) =>
    $isRecording &&
    `
    animation: ${pulse} 1.5s ease-in-out infinite;
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%) !important;
    border-color: #ff6b6b !important;
    
    &:hover {
      background: linear-gradient(135deg, #ff5252 0%, #e53935 100%) !important;
      border-color: #ff5252 !important;
    }
  `}
`

interface VoiceInputButtonProps {
  onResult?: (text: string) => void
  size?: 'small' | 'middle' | 'large'
  disabled?: boolean
}

export const VoiceInputButton: FC<VoiceInputButtonProps> = ({
  onResult,
  size = 'middle',
  disabled = false
}) => {
  const { t } = useTranslation()
  const {
    serverConnected,
    recordingState,
    lastResult,
    error,
    toggleRecording,
    checkServerHealth
  } = useSpeechRecognition()

  const isRecording = recordingState === 'recording'
  const isProcessing = recordingState === 'processing'

  const handleClick = useCallback(async () => {
    if (!serverConnected) {
      const result = await checkServerHealth()
      if (!result?.connected) {
        return
      }
    }

    const result = await toggleRecording()

    if (result?.text && onResult) {
      onResult(result.text)
    }
  }, [serverConnected, checkServerHealth, toggleRecording, onResult])

  const getTooltipText = () => {
    if (!serverConnected) {
      return t('speech.serverNotConnected')
    }
    if (isRecording) {
      return t('speech.stopRecording')
    }
    if (isProcessing) {
      return t('speech.processing')
    }
    return t('speech.startRecording')
  }

  const getIcon = () => {
    if (isProcessing) {
      return <Loader2 size={18} className="animate-spin" />
    }
    if (isRecording) {
      return <MicOff size={18} />
    }
    return <Mic size={18} />
  }

  return (
    <Tooltip title={getTooltipText()}>
      <RecordingButton
        type={isRecording ? 'primary' : 'text'}
        $isRecording={isRecording}
        icon={getIcon()}
        onClick={handleClick}
        loading={isProcessing}
        disabled={disabled || isProcessing}
        size={size}
        danger={isRecording}
      />
    </Tooltip>
  )
}

export default VoiceInputButton
```

## 四、快捷键集成

### 4.1 修改 ShortcutService.ts

```typescript
// 在 getShortcutHandler 函数中添加

case 'voice_record_toggle':
  return () => {
    speechService.toggleRecording()
  }

case 'voice_record_hold_start':
  return () => {
    speechService.startRecording()
  }

case 'voice_record_hold_stop':
  return () => {
    speechService.stopRecording()
  }
```

### 4.2 添加快捷键配置 (src/renderer/src/store/shortcuts.ts)

```typescript
// 在 shortcuts 数组中添加

{
  key: 'voice_record_toggle',
  name: i18n.t('settings.shortcuts.voiceRecordToggle'),
  enabled: true,
  shortcut: ['CommandOrControl', 'Shift', 'V']
},
{
  key: 'voice_record_hold',
  name: i18n.t('settings.shortcuts.voiceRecordHold'),
  enabled: true,
  shortcut: ['CommandOrControl', 'Shift', 'B'],
  holdMode: true
}
```

## 五、初始化集成

### 5.1 修改 src/main/index.ts

```typescript
import { speechService } from './services/speech'

// 在 app.whenReady() 中添加
app.whenReady().then(() => {
  // ... 其他初始化代码

  speechService.setMainWindow(windowService.getMainWindow()!)
  speechService.initialize()
})
```

### 5.2 修改 src/renderer/src/store/index.ts

```typescript
import speechReducer from './speech/speechSlice'

// 在 reducer 中添加
const reducer = {
  // ... 其他 reducers
  speech: speechReducer
}
```

## 六、依赖安装

```bash
# 安装音频处理依赖
pnpm add node-record-lpcm16

# 安装全局按键监听（按住录音模式需要）
pnpm add uiohook-napi
```

## 七、类型声明

### 7.1 添加到 src/renderer/src/types/speech.ts

```typescript
export type RecordingState = 'idle' | 'recording' | 'processing'

export interface RecognitionResult {
  text: string
  confidence: number
  duration: number
  timestamp: number
  language: string
}

export interface SpeechConfig {
  enabled: boolean
  serverUrl: string
  serverPort: number
  autoStartServer: boolean
  sampleRate: number
  channels: number
  shortcutToggle: string[]
  shortcutHold: string[]
  outputMode: 'direct' | 'ai-process'
  aiAssistantId?: string
  aiPrompt?: string
}
```

## 八、i18n 翻译

### 8.1 中文 (src/renderer/src/i18n/locales/zh-CN/speech.json)

```json
{
  "speech": {
    "title": "语音识别",
    "startRecording": "开始录音",
    "stopRecording": "停止录音",
    "processing": "正在识别...",
    "serverNotConnected": "语音服务未连接",
    "serverStarting": "正在启动服务...",
    "serverStatus": "服务状态",
    "connected": "已连接",
    "disconnected": "未连接",
    "settings": {
      "title": "语音设置",
      "enabled": "启用语音识别",
      "serverUrl": "服务地址",
      "serverPort": "服务端口",
      "autoStart": "自动启动服务",
      "outputMode": "输出模式",
      "directOutput": "直接输出",
      "aiProcess": "AI 处理",
      "aiPrompt": "处理提示词"
    },
    "shortcuts": {
      "toggle": "点击录音",
      "hold": "按住录音"
    },
    "errors": {
      "serverNotRunning": "语音服务未运行",
      "microphonePermission": "请授予麦克风权限",
      "recordingFailed": "录音失败",
      "recognitionFailed": "识别失败"
    }
  }
}
```
