/**
 * 消息重新生成服务
 * 处理基于审查反馈的消息重新生成
 */

import { loggerService } from '@logger'
import { getTopicById } from '@renderer/hooks/useTopic'
import { getAssistantById } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { ReviewResult } from '@renderer/services/ResponseReviewService'
import store from '@renderer/store'
import { removeOneBlock } from '@renderer/store/messageBlock'
import { newMessagesActions } from '@renderer/store/newMessage'

const logger = loggerService.withContext('RegenerateService')

interface RegenerateOptions {
  messageId: string
  topicId: string
  assistantId: string
  regenerationPrompt: string
  originalQuery: string
  feedback?: string
  reviewResult?: ReviewResult
}

// 重新生成历史记录，用于防止质量下降
const regenerationHistory = new Map<string, ReviewResult>()

/**
 * 初始化重新生成服务
 * 监听重新生成事件
 */
export function initRegenerateService(): void {
  window.addEventListener('cherry:regenerate-message', ((event: CustomEvent<RegenerateOptions>) => {
    const { detail } = event
    handleRegenerate(detail)
  }) as EventListener)

  logger.info('RegenerateService initialized')
}

/**
 * 处理重新生成请求
 */
async function handleRegenerate(options: RegenerateOptions): Promise<void> {
  try {
    const { messageId, topicId, assistantId, regenerationPrompt, originalQuery, feedback, reviewResult } = options

    logger.info('Handling regenerate request', { messageId, topicId })

    const assistant = getAssistantById(assistantId)
    const topic = await getTopicById(topicId)

    if (!assistant || !topic) {
      logger.error('Assistant or topic not found', { assistantId, topicId })
      return
    }

    // 保存原始审查结果用于后续对比
    if (reviewResult) {
      regenerationHistory.set(messageId, reviewResult)
      // 保存到 localStorage 以便持久化
      saveRegenerationHistory(messageId, reviewResult)
    }

    // 删除当前消息（保留用户问题）
    await deleteAssistantMessage(messageId, topicId)

    // 触发新的消息生成
    EventEmitter.emit(EVENT_NAMES.SEND_MESSAGE, {
      topicId,
      assistant,
      message: {
        role: 'user',
        content: regenerationPrompt
      },
      isRegeneration: true,
      originalQuery,
      feedback,
      originalMessageId: messageId // 传递原消息ID用于关联历史
    })

    logger.info('Regenerate request processed', { messageId, topicId })
  } catch (error) {
    logger.error('Error handling regenerate:', error as Error)
  }
}

/**
 * 删除助手消息及其相关块
 */
async function deleteAssistantMessage(messageId: string, topicId: string): Promise<void> {
  try {
    const state = store.getState()
    const message = state.messages.entities[messageId]

    if (!message) {
      logger.warn('Message not found for deletion', { messageId })
      return
    }

    // 删除消息的所有块
    for (const blockId of message.blocks) {
      store.dispatch(removeOneBlock(blockId))
    }

    // 删除消息
    store.dispatch(
      newMessagesActions.removeMessage({
        topicId,
        messageId
      })
    )

    logger.info('Assistant message deleted', { messageId })
  } catch (error) {
    logger.error('Error deleting assistant message:', error as Error)
  }
}

/**
 * 保存重新生成历史到 localStorage
 */
function saveRegenerationHistory(messageId: string, reviewResult: ReviewResult): void {
  try {
    const key = `regeneration_history_${messageId}`
    const data = {
      reviewResult,
      timestamp: Date.now()
    }
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    logger.error('Error saving regeneration history:', error as Error)
  }
}

/**
 * 获取重新生成历史
 */
export function getRegenerationHistory(messageId: string): ReviewResult | null {
  try {
    // 先检查内存缓存
    if (regenerationHistory.has(messageId)) {
      return regenerationHistory.get(messageId)!
    }

    // 再检查 localStorage
    const key = `regeneration_history_${messageId}`
    const data = localStorage.getItem(key)
    if (data) {
      const parsed = JSON.parse(data)
      return parsed.reviewResult as ReviewResult
    }
  } catch (error) {
    logger.error('Error getting regeneration history:', error as Error)
  }
  return null
}

/**
 * 清理重新生成历史
 */
export function clearRegenerationHistory(messageId?: string): void {
  try {
    if (messageId) {
      regenerationHistory.delete(messageId)
      localStorage.removeItem(`regeneration_history_${messageId}`)
    } else {
      // 清理所有历史（保留最近7天的）
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('regeneration_history_')) {
          const data = localStorage.getItem(key)
          if (data) {
            const parsed = JSON.parse(data)
            if (parsed.timestamp < sevenDaysAgo) {
              localStorage.removeItem(key)
            }
          }
        }
      }
      regenerationHistory.clear()
    }
  } catch (error) {
    logger.error('Error clearing regeneration history:', error as Error)
  }
}

/**
 * 获取重新生成次数
 */
export function getRegenerationCount(messageId: string): number {
  try {
    const key = `regeneration_count_${messageId}`
    const count = localStorage.getItem(key)
    return count ? parseInt(count, 10) : 0
  } catch (error) {
    logger.error('Error getting regeneration count:', error as Error)
    return 0
  }
}

/**
 * 增加重新生成次数
 */
export function incrementRegenerationCount(messageId: string): void {
  try {
    const key = `regeneration_count_${messageId}`
    const currentCount = getRegenerationCount(messageId)
    localStorage.setItem(key, (currentCount + 1).toString())
  } catch (error) {
    logger.error('Error incrementing regeneration count:', error as Error)
  }
}

/**
 * 检查是否应该允许重新生成
 * 防止无限重新生成
 */
export function shouldAllowRegeneration(messageId: string): {
  allowed: boolean
  reason?: string
} {
  const count = getRegenerationCount(messageId)

  if (count >= 3) {
    return {
      allowed: false,
      reason: '已达到最大重新生成次数（3次），建议手动修改提示词或更换模型'
    }
  }

  return { allowed: true }
}
