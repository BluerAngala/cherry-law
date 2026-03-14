/**
 * 语音服务主控制器
 * 支持全局录音、历史记录和投递到光标所在输入框
 */
import { loggerService } from '@main/services/LoggerService'
import { IpcChannel } from '@shared/IpcChannel'
import { type BrowserWindow, clipboard, ipcMain } from 'electron'
import { writeFileSync } from 'fs'

import { AudioCaptureService } from './AudioCaptureService'
import { SenseVoiceClient } from './SenseVoiceClient'
import { speechHistoryService } from './SpeechHistoryService'
import type { RecognitionResult, SpeechConfig, SpeechHistoryItem, SpeechState } from './types'
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

  /**
   * 全局开始录音（带 UI 提示）
   */
  async startRecordingGlobal(): Promise<void> {
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

      // 显示录音中 UI
      this.broadcastToAllWindows(IpcChannel.SpeechGlobal_ShowRecordingUI, {})

      logger.info('开始全局录音')
    } catch (error) {
      this.updateState({ recordingState: 'idle' })
      this.broadcastToAllWindows(IpcChannel.SpeechGlobal_HideRecordingUI, {})
      throw error
    }
  }

  /**
   * 全局停止录音并处理投递
   */
  async stopRecordingGlobal(): Promise<void> {
    if (this.state.recordingState !== 'recording') {
      logger.warn('没有正在进行的录音')
      return
    }

    try {
      this.updateState({ recordingState: 'processing' })

      const audioBuffer = await this.audioCapture?.stopRecording()

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '录音数据为空')
      }

      const result = await this.client.transcribe(audioBuffer, 'wav', this.config.sampleRate)

      // 保存音频文件
      let audioPath: string | undefined
      try {
        audioPath = speechHistoryService.getAudioFilePath()
        writeFileSync(audioPath, audioBuffer)
      } catch (error) {
        logger.error('保存音频文件失败', error as Error)
        audioPath = undefined
      }

      // 添加到历史记录
      const historyItem = speechHistoryService.addHistory({
        text: result.text,
        audioPath,
        duration: result.duration,
        timestamp: Date.now(),
        language: result.language,
        confidence: result.confidence,
        delivered: false
      })

      // 尝试投递到光标所在输入框
      const deliveryResult = await this.deliverTextToActiveInput(result.text, historyItem)

      // 更新历史记录投递状态
      if (deliveryResult.delivered) {
        speechHistoryService.updateItem(historyItem.id, { delivered: true })
      }

      // 隐藏录音 UI
      this.broadcastToAllWindows(IpcChannel.SpeechGlobal_HideRecordingUI, {})

      // 发送投递结果到所有窗口
      this.broadcastToAllWindows(IpcChannel.SpeechGlobal_DeliveryResult, {
        success: true,
        text: result.text,
        delivered: deliveryResult.delivered,
        error: deliveryResult.error,
        historyItem
      })

      this.updateState({
        recordingState: 'idle',
        lastResult: result.text
      })

      this.sendToRenderer(IpcChannel.Speech_RecognitionResult, {
        text: result.text,
        confidence: result.confidence,
        duration: result.duration,
        timestamp: Date.now(),
        language: result.language
      } as RecognitionResult)

      logger.info('全局录音识别完成', {
        text: result.text.substring(0, 50),
        delivered: deliveryResult.delivered
      })
    } catch (error) {
      this.updateState({ recordingState: 'idle' })
      this.broadcastToAllWindows(IpcChannel.SpeechGlobal_HideRecordingUI, {})

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.sendToRenderer(IpcChannel.Speech_RecognitionError, { error: errorMessage })
      logger.error('全局录音识别失败:', new Error(errorMessage))

      throw error
    }
  }

  /**
   * 投递文本到活动输入框
   * 使用剪贴板 + 模拟按键的方式投递文本
   */
  private async deliverTextToActiveInput(
    text: string,
    _historyItem: SpeechHistoryItem
  ): Promise<{ delivered: boolean; error?: string }> {
    try {
      // 保存当前剪贴板内容
      const originalClipboard = clipboard.readText()

      // 将文本写入剪贴板
      clipboard.writeText(text)

      // 模拟粘贴操作 (Ctrl+V / Cmd+V)
      const isMac = process.platform === 'darwin'

      // 使用 robotjs 或 node-key-sender 模拟按键
      // 这里使用一个简单的延迟，让用户有时间切换窗口
      // 实际投递会在用户按下快捷键后自动执行

      // 延迟 100ms 确保剪贴板写入完成
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 尝试使用 electron 的 native 方法模拟按键
      // 注意：这里我们依赖用户已经通过快捷键触发了录音
      // 所以当前焦点应该在用户想要的输入框中
      // 我们只需要执行粘贴操作

      // 使用 AppleScript (macOS) 或 xdotool (Linux) 或 SendKeys (Windows)
      await this.simulatePasteKey(isMac)

      // 恢复原始剪贴板内容（延迟恢复）
      setTimeout(() => {
        clipboard.writeText(originalClipboard)
      }, 500)

      logger.info('文本已投递到活动输入框', { text: text.substring(0, 50) })
      return { delivered: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('投递文本失败', error as Error)
      return { delivered: false, error: errorMessage }
    }
  }

  /**
   * 模拟粘贴按键
   */
  private async simulatePasteKey(isMac: boolean): Promise<void> {
    const { exec } = require('child_process')
    const util = require('util')
    const execAsync = util.promisify(exec)

    try {
      if (isMac) {
        // macOS: 使用 AppleScript 模拟 Cmd+V
        await execAsync('osascript -e \'tell application "System Events" to keystroke "v" using command down\'')
      } else if (process.platform === 'win32') {
        // Windows: 使用 PowerShell 发送 Ctrl+V
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait("^v")
        `
        await execAsync(`powershell.exe -Command "${script}"`)
      } else {
        // Linux: 使用 xdotool
        await execAsync('xdotool key ctrl+v')
      }
    } catch (error) {
      logger.error('模拟粘贴按键失败', error as Error)
      throw error
    }
  }

  /**
   * 全局切换录音状态
   */
  async toggleRecordingGlobal(): Promise<void> {
    if (this.state.recordingState === 'idle') {
      await this.startRecordingGlobal()
    } else if (this.state.recordingState === 'recording') {
      await this.stopRecordingGlobal()
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

    // 同步更新 state 中的 enabled 状态
    if (config.enabled !== undefined) {
      this.updateState({ enabled: config.enabled })
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

  /**
   * 广播消息到所有窗口
   */
  private broadcastToAllWindows(channel: string, data: any): void {
    const { BrowserWindow } = require('electron')
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((window: BrowserWindow) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data)
      }
    })
  }

  destroy(): void {
    this.stopHealthCheck()
    this.audioCapture?.destroy()
    this.audioCapture = null
  }
}

export const speechService = SpeechService.getInstance()
