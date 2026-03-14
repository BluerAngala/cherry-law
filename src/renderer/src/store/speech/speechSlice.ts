import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
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
    },
    setLastResult: (state, action: PayloadAction<string | null>) => {
      state.lastResult = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    setIsProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload
    },
    updateSpeechState: (state, action: PayloadAction<Partial<SpeechState>>) => {
      return { ...state, ...action.payload }
    },
    resetSpeechState: () => initialState
  }
})

export const {
  setEnabled,
  setServerConnected,
  setRecordingState,
  setLastResult,
  setError,
  setIsProcessing,
  updateSpeechState,
  resetSpeechState
} = speechSlice.actions

export default speechSlice.reducer
