/**
 * SenseVoice Server HTTP 客户端
 */
import { loggerService } from '@main/services/LoggerService'

import type { ServerHealthStatus, SpeechConfig, TranscribeResponse } from './types'
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

    throw new SpeechError(SpeechErrorType.SERVER_CONNECTION_FAILED, '无法连接到语音服务', { url })
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
      const blob = new Blob([audioBuffer as unknown as BlobPart], { type: `audio/${format}` })
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

      throw new SpeechError(SpeechErrorType.SERVER_CONNECTION_FAILED, '语音识别请求失败', { originalError: error })
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
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
