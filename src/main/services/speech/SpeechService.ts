/**
 * 语音服务主控制器
 */
import { loggerService } from '@main/services/LoggerService'
import { IpcChannel } from '@shared/IpcChannel'
import { type BrowserWindow, ipcMain } from 'electron'

import { AudioCaptureService } from './AudioCaptureService'
import { SenseVoiceClient } from './SenseVoiceClient'
import type { RecognitionResult, SpeechConfig, SpeechState } from './types'
import { SpeechError, SpeechErrorType } from './types'

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

  private setupIpcHandlers() {
    ipcMain.handle(IpcChannel.Speech_GetStatus, () => this.getStatus())
    ipcMain.handle(IpcChannel.Speech_GetConfig, () => this.getConfig())
    ipcMain.handle(IpcChannel.Speech_UpdateConfig, (_, config: Partial<SpeechConfig>) => this.updateConfig(config))
    ipcMain.handle(IpcChannel.Speech_StartRecording, () => this.startRecording())
    ipcMain.handle(IpcChannel.Speech_StopRecording, () => this.stopRecording())
    ipcMain.handle(IpcChannel.Speech_ToggleRecording, () => this.toggleRecording())
    ipcMain.handle(IpcChannel.Speech_CheckServerHealth, () => this.checkServerHealth())
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
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
      throw new SpeechError(SpeechErrorType.SERVER_NOT_RUNNING, '语音服务未连接，请先启动服务')
    }

    try {
      this.updateState({ recordingState: 'recording' })

      await this.audioCapture?.startRecording()

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

      const audioBuffer = await this.audioCapture?.stopRecording()

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '录音数据为空')
      }

      const result = await this.client.transcribe(audioBuffer, 'wav', this.config.sampleRate)

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

      this.sendToRenderer(IpcChannel.Speech_RecognitionResult, recognitionResult)

      logger.info('识别完成', { text: result.text.substring(0, 50) })

      return recognitionResult
    } catch (error) {
      this.updateState({ recordingState: 'idle' })

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.sendToRenderer(IpcChannel.Speech_RecognitionError, { error: errorMessage })
      logger.error('识别失败:', new Error(errorMessage))

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
    this.sendToRenderer(IpcChannel.Speech_StatusChanged, this.state)
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
