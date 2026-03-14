/**
 * 全局语音录音 Hook
 * 支持全局录音 UI 和历史记录管理
 */
import { IpcChannel } from '@shared/IpcChannel'
import { useCallback, useEffect, useState } from 'react'

import type { SpeechDeliveryResult, SpeechHistoryItem } from '../types/speech'

export interface UseGlobalSpeechReturn {
  isRecording: boolean
  isProcessing: boolean
  showRecordingUI: boolean
  history: SpeechHistoryItem[]
  lastDeliveryResult: SpeechDeliveryResult | null
  loadHistory: () => Promise<void>
  deleteHistoryItem: (id: string) => Promise<void>
  clearAllHistory: () => Promise<void>
  copyTextToClipboard: (text: string) => Promise<void>
}

export function useGlobalSpeech(): UseGlobalSpeechReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showRecordingUI, setShowRecordingUI] = useState(false)
  const [history, setHistory] = useState<SpeechHistoryItem[]>([])
  const [lastDeliveryResult, setLastDeliveryResult] = useState<SpeechDeliveryResult | null>(null)

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    try {
      const list = await window.electron.ipcRenderer.invoke(IpcChannel.SpeechHistory_GetList)
      setHistory(list)
    } catch (error) {
      console.error('加载录音历史失败:', error)
    }
  }, [])

  // 删除历史记录项
  const deleteHistoryItem = useCallback(
    async (id: string) => {
      try {
        await window.electron.ipcRenderer.invoke(IpcChannel.SpeechHistory_DeleteItem, id)
        await loadHistory()
      } catch (error) {
        console.error('删除录音历史失败:', error)
      }
    },
    [loadHistory]
  )

  // 清空所有历史
  const clearAllHistory = useCallback(async () => {
    try {
      await window.electron.ipcRenderer.invoke(IpcChannel.SpeechHistory_ClearAll)
      await loadHistory()
    } catch (error) {
      console.error('清空录音历史失败:', error)
    }
  }, [loadHistory])

  // 复制文本到剪贴板
  const copyTextToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('复制到剪贴板失败:', error)
    }
  }, [])

  // 监听全局录音事件
  useEffect(() => {
    // 显示录音 UI
    const unsubscribeShowUI = window.electron.ipcRenderer.on(IpcChannel.SpeechGlobal_ShowRecordingUI, () => {
      setShowRecordingUI(true)
      setIsRecording(true)
      setIsProcessing(false)
    })

    // 隐藏录音 UI
    const unsubscribeHideUI = window.electron.ipcRenderer.on(IpcChannel.SpeechGlobal_HideRecordingUI, () => {
      setShowRecordingUI(false)
      setIsRecording(false)
      setIsProcessing(false)
    })

    // 投递结果
    const unsubscribeDeliveryResult = window.electron.ipcRenderer.on(
      IpcChannel.SpeechGlobal_DeliveryResult,
      (_, result: SpeechDeliveryResult) => {
        setLastDeliveryResult(result)
        setIsRecording(false)
        setIsProcessing(false)
        setShowRecordingUI(false)

        // 刷新历史记录
        loadHistory()

        // 如果投递失败，显示提示
        if (!result.delivered) {
          // 可以在这里触发通知
          console.warn('语音投递失败:', result.error)
        }
      }
    )

    // 初始加载历史
    loadHistory()

    return () => {
      unsubscribeShowUI()
      unsubscribeHideUI()
      unsubscribeDeliveryResult()
    }
  }, [loadHistory])

  return {
    isRecording,
    isProcessing,
    showRecordingUI,
    history,
    lastDeliveryResult,
    loadHistory,
    deleteHistoryItem,
    clearAllHistory,
    copyTextToClipboard
  }
}
