import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  setEnabled,
  setError,
  setLastResult,
  setRecordingState,
  setServerConnected,
  updateSpeechState
} from '@renderer/store/speech'
import type { RecognitionResult, RecordingState, SpeechConfig } from '@renderer/types/speech'
import { IpcChannel } from '@shared/IpcChannel'
import { useCallback, useEffect } from 'react'

export interface UseSpeechRecognitionReturn {
  enabled: boolean
  serverConnected: boolean
  recordingState: RecordingState
  lastResult: string | null
  error: string | null
  isRecording: boolean
  isProcessing: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<RecognitionResult | null>
  toggleRecording: () => Promise<RecognitionResult | null>
  checkServerHealth: () => Promise<{ connected: boolean; error?: string }>
  updateConfig: (config: Partial<SpeechConfig>) => Promise<void>
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const dispatch = useAppDispatch()
  const { enabled, serverConnected, recordingState, lastResult, error } = useAppSelector((state) => state.speech)

  const isRecording = recordingState === 'recording'
  const isProcessing = recordingState === 'processing'

  // Set up IPC listeners
  useEffect(() => {
    const unsubscribeStatus = window.electron.ipcRenderer.on(IpcChannel.Speech_StatusChanged, (_, state) => {
      dispatch(updateSpeechState(state))
    })

    const unsubscribeRecordingState = window.electron.ipcRenderer.on(
      IpcChannel.Speech_RecordingStateChanged,
      (_, { state }) => {
        dispatch(setRecordingState(state))
      }
    )

    const unsubscribeResult = window.electron.ipcRenderer.on(
      IpcChannel.Speech_RecognitionResult,
      (_, result: RecognitionResult) => {
        dispatch(setLastResult(result.text))
        dispatch(setRecordingState('idle'))
      }
    )

    const unsubscribeError = window.electron.ipcRenderer.on(
      IpcChannel.Speech_RecognitionError,
      (_, { error: errorMessage }) => {
        dispatch(setError(errorMessage))
        dispatch(setRecordingState('idle'))
      }
    )

    // Get initial status
    window.electron.ipcRenderer.invoke(IpcChannel.Speech_GetStatus).then((status) => {
      dispatch(updateSpeechState(status))
    })

    return () => {
      unsubscribeStatus()
      unsubscribeRecordingState()
      unsubscribeResult()
      unsubscribeError()
    }
  }, [dispatch])

  const startRecording = useCallback(async () => {
    try {
      dispatch(setError(null))
      await window.electron.ipcRenderer.invoke(IpcChannel.Speech_StartRecording)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      dispatch(setError(errorMessage))
      throw err
    }
  }, [dispatch])

  const stopRecording = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Speech_StopRecording)
      return result as RecognitionResult | null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      dispatch(setError(errorMessage))
      throw err
    }
  }, [dispatch])

  const toggleRecording = useCallback(async () => {
    try {
      dispatch(setError(null))
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Speech_ToggleRecording)
      return result as RecognitionResult | null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      dispatch(setError(errorMessage))
      throw err
    }
  }, [dispatch])

  const checkServerHealth = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(IpcChannel.Speech_CheckServerHealth)
      dispatch(setServerConnected(result.connected))
      return result as { connected: boolean; error?: string }
    } catch (err) {
      dispatch(setServerConnected(false))
      return { connected: false, error: String(err) }
    }
  }, [dispatch])

  const updateConfig = useCallback(
    async (config: Partial<SpeechConfig>) => {
      await window.electron.ipcRenderer.invoke(IpcChannel.Speech_UpdateConfig, config)
      if (config.enabled !== undefined) {
        dispatch(setEnabled(config.enabled))
      }
    },
    [dispatch]
  )

  return {
    enabled,
    serverConnected,
    recordingState,
    lastResult,
    error,
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    toggleRecording,
    checkServerHealth,
    updateConfig
  }
}
