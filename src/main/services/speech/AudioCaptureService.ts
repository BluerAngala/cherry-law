/**
 * 音频采集服务
 *
 * 使用 FFmpeg 进行跨平台音频采集
 */
import { loggerService } from '@main/services/LoggerService'
import { type ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

import { SpeechError, SpeechErrorType } from './types'

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
      throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '启动录音失败', { originalError: error })
    }
  }

  private async startRecordingWindows(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '未找到 FFmpeg，请安装 FFmpeg')
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f',
      'dshow',
      '-i',
      'audio=麦克风',
      '-acodec',
      'pcm_s16le',
      '-ar',
      this.options.sampleRate.toString(),
      '-ac',
      this.options.channels.toString(),
      '-f',
      'wav',
      '-'
    ])

    this.setupProcessHandlers()
  }

  private async startRecordingMac(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '未找到 FFmpeg，请安装 FFmpeg')
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f',
      'avfoundation',
      '-i',
      ':0',
      '-acodec',
      'pcm_s16le',
      '-ar',
      this.options.sampleRate.toString(),
      '-ac',
      this.options.channels.toString(),
      '-f',
      'wav',
      '-'
    ])

    this.setupProcessHandlers()
  }

  private async startRecordingLinux(): Promise<void> {
    const ffmpegPath = this.getFfmpegPath()

    if (!ffmpegPath) {
      throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '未找到 FFmpeg，请安装 FFmpeg')
    }

    this.recordingProcess = spawn(ffmpegPath, [
      '-f',
      'alsa',
      '-i',
      'default',
      '-acodec',
      'pcm_s16le',
      '-ar',
      this.options.sampleRate.toString(),
      '-ac',
      this.options.channels.toString(),
      '-f',
      'wav',
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
      logger.debug('FFmpeg stderr:', { data: data.toString() })
    })

    this.recordingProcess.on('error', (error) => {
      logger.error('录音进程错误:', error)
      this.isRecording = false
    })

    this.recordingProcess.on('close', (code) => {
      logger.debug('录音进程关闭:', { code })
      this.isRecording = false
    })
  }

  async stopRecording(): Promise<Buffer> {
    if (!this.isRecording || !this.recordingProcess) {
      throw new SpeechError(SpeechErrorType.RECORDING_FAILED, '没有正在进行的录音')
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
