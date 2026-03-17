import { loggerService } from '@logger'
import type {
  AssistantSettings,
  CustomTranslateLanguage,
  FetchChatCompletionRequestOptions,
  ReasoningEffortOption,
  TranslateHistory,
  TranslateLanguage,
  TranslateLanguageCode
} from '@renderer/types'
import type { BlockCompleteChunk, Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import { uuid } from '@renderer/utils'
import { readyToAbort } from '@renderer/utils/abortController'
import { trackTokenUsage } from '@renderer/utils/analytics'
import { isAbortError } from '@renderer/utils/error'
import { IpcChannel } from '@shared/IpcChannel'
import { NoOutputGeneratedError } from 'ai'
import { t } from 'i18next'

import { fetchChatCompletion } from './ApiService'
import { getDefaultTranslateAssistant } from './AssistantService'

const logger = loggerService.withContext('TranslateService')

type TranslateOptions = {
  reasoningEffort: ReasoningEffortOption
}

/**
 * 翻译文本到目标语言
 * @param text - 需要翻译的文本内容
 * @param targetLanguage - 目标语言
 * @param onResponse - 流式输出的回调函数，用于实时获取翻译结果
 * @param abortKey - 用于控制 abort 的键
 * @returns 返回翻译后的文本
 * @throws {Error} 翻译中止或失败时抛出异常
 */
export const translateText = async (
  text: string,
  targetLanguage: TranslateLanguage,
  onResponse?: (text: string, isComplete: boolean) => void,
  abortKey?: string,
  options?: TranslateOptions
) => {
  let error
  const assistantSettings: Partial<AssistantSettings> | undefined = options
    ? { reasoning_effort: options?.reasoningEffort }
    : undefined
  const assistant = getDefaultTranslateAssistant(targetLanguage, text, assistantSettings)

  const signal = abortKey ? readyToAbort(abortKey) : undefined

  let translatedText = ''
  let completed = false
  const model = assistant.model
  const onChunk = (chunk: Chunk) => {
    if (chunk.type === ChunkType.TEXT_DELTA) {
      translatedText = chunk.text
    } else if (chunk.type === ChunkType.TEXT_COMPLETE) {
      completed = true
    } else if (chunk.type === ChunkType.BLOCK_COMPLETE) {
      const usage = (chunk as BlockCompleteChunk).response?.usage
      trackTokenUsage({ usage, model })
    } else if (chunk.type === ChunkType.ERROR) {
      error = chunk.error
      if (isAbortError(chunk.error)) {
        completed = true
      }
    }
    onResponse?.(translatedText, completed)
  }

  const requestOptions = {
    signal
  } satisfies FetchChatCompletionRequestOptions

  try {
    await fetchChatCompletion({
      prompt: assistant.content,
      assistant,
      requestOptions,
      onChunkReceived: onChunk
    })
  } catch (e) {
    // dismiss no output generated error. it will be thrown when aborted.
    if (!NoOutputGeneratedError.isInstance(e)) {
      throw e
    }
  }

  if (error !== undefined && !isAbortError(error)) {
    throw error
  }

  const trimmedText = translatedText.trim()

  if (!trimmedText) {
    return Promise.reject(new Error(t('translate.error.empty')))
  }

  return trimmedText
}

/**
 * 添加自定义翻译语言
 * @param value - 语言名称
 * @param emoji - 语言对应的emoji图标
 * @param langCode - 语言代码
 * @returns {Promise<CustomTranslateLanguage>} 返回新添加的自定义语言对象
 * @throws {Error} 当语言已存在或添加失败时抛出错误
 */
export const addCustomLanguage = async (
  value: string,
  emoji: string,
  langCode: string
): Promise<CustomTranslateLanguage> => {
  try {
    const item = {
      id: uuid(),
      value,
      langCode: langCode.toLowerCase(),
      emoji,
      created_at: new Date().toISOString()
    }
    await window.electron.ipcRenderer.invoke(IpcChannel.Translate_AddLanguage, item)
    return item
  } catch (e) {
    logger.error('Failed to add custom language.', e as Error)
    throw e
  }
}

/**
 * 获取所有自定义语言
 * @returns Promise<CustomTranslateLanguage[]> 返回所有自定义语言列表
 * @throws {Error} 获取自定义语言失败时抛出错误
 */
export const getAllCustomLanguages = async (): Promise<CustomTranslateLanguage[]> => {
  try {
    const languages = await window.electron.ipcRenderer.invoke(IpcChannel.Translate_GetLanguages)
    return languages.map((lang: any) => ({
      id: lang.id,
      value: lang.name || lang.value,
      langCode: lang.langCode,
      emoji: lang.emoji,
      created_at: lang.created_at
    }))
  } catch (e) {
    logger.error('Failed to get all custom languages.', e as Error)
    throw e
  }
}

/**
 * 保存翻译历史记录到数据库
 * @param sourceText - 原文内容
 * @param targetText - 翻译后的内容
 * @param sourceLanguage - 源语言代码
 * @param targetLanguage - 目标语言代码
 * @returns Promise<void>
 */
export const saveTranslateHistory = async (
  sourceText: string,
  targetText: string,
  sourceLanguage: TranslateLanguageCode,
  targetLanguage: TranslateLanguageCode
) => {
  const history = {
    id: uuid(),
    sourceText,
    targetText,
    sourceLanguage,
    targetLanguage,
    created_at: new Date().toISOString()
  }
  await window.electron.ipcRenderer.invoke(IpcChannel.Translate_AddHistory, history)
}

/**
 * 获取所有翻译历史记录
 * @returns Promise<TranslateHistory[]> 返回所有翻译历史记录
 * @throws {Error} 获取翻译历史失败时抛出错误
 */
export const getAllTranslateHistory = async (): Promise<TranslateHistory[]> => {
  try {
    const history = await window.electron.ipcRenderer.invoke(IpcChannel.Translate_GetHistory)
    return history.map((item: any) => ({
      id: item.id,
      sourceText: item.sourceText,
      targetText: item.targetText,
      sourceLanguage: item.sourceLanguage,
      targetLanguage: item.targetLanguage,
      createdAt: item.created_at
    }))
  } catch (e) {
    logger.error('Failed to get all translate history.', e as Error)
    throw e
  }
}

/**
 * 删除指定的翻译历史记录
 * @param id - 要删除的翻译历史记录ID
 * @returns Promise<void>
 */
export const deleteHistory = async (id: string) => {
  try {
    await window.electron.ipcRenderer.invoke(IpcChannel.Translate_DeleteHistory, id)
  } catch (e) {
    logger.error('Failed to delete translate history', e as Error)
    throw e
  }
}

/**
 * 清空所有翻译历史记录
 * @returns Promise<void>
 */
export const clearHistory = async () => {
  try {
    await window.electron.ipcRenderer.invoke(IpcChannel.Translate_ClearHistory)
  } catch (e) {
    logger.error('Failed to clear translate history', e as Error)
    throw e
  }
}

/**
 * 删除指定的自定义语言
 * @param id - 要删除的自定义语言ID
 * @returns Promise<void>
 */
export const deleteCustomLanguage = async (id: string) => {
  try {
    await window.electron.ipcRenderer.invoke(IpcChannel.Translate_DeleteLanguage, id)
  } catch (e) {
    logger.error('Failed to delete custom language', e as Error)
    throw e
  }
}

/**
 * 更新自定义语言
 * @param language - 要更新的语言对象
 * @param value - 新的语言名称
 * @param emoji - 新的emoji
 * @param langCode - 新的语言代码
 * @returns Promise<void>
 * @deprecated 此功能在当前架构下暂不支持，仅保留接口兼容性
 */
export const updateCustomLanguage = async (
  _language: CustomTranslateLanguage,
  _value: string,
  _emoji: string,
  _langCode: string
) => {
  // 在 LibSQL 架构下，更新操作需要先删除再添加
  // 暂时保留此接口以兼容旧代码
  logger.warn('updateCustomLanguage is not fully supported in current architecture')
}

/**
 * 更新翻译历史记录
 * @param id - 历史记录ID
 * @param updates - 更新内容
 * @returns Promise<void>
 * @deprecated 此功能在当前架构下暂不支持，仅保留接口兼容性
 */
export const updateTranslateHistory = async (_id: string, _updates: Partial<TranslateHistory>) => {
  // 在 LibSQL 架构下，更新操作需要重新插入
  // 暂时保留此接口以兼容旧代码
  logger.warn('updateTranslateHistory is not fully supported in current architecture')
}
