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
