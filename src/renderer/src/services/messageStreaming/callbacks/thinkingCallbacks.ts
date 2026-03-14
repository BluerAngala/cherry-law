import { loggerService } from '@logger'
import type { MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createThinkingBlock } from '@renderer/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('ThinkingCallbacks')
interface ThinkingCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
}

export const createThinkingCallbacks = (deps: ThinkingCallbacksDependencies) => {
  const { blockManager, assistantMsgId } = deps

  // 内部维护的状态
  let thinkingBlockId: string | null = null
  let thinking_millsec_now: number = 0
  // 累积的思考内容
  let accumulatedThinkingContent: string = ''

  return {
    // 获取当前思考时间（用于停止回复时保留思考时间）
    getCurrentThinkingInfo: () => ({
      blockId: thinkingBlockId,
      millsec: thinking_millsec_now > 0 ? performance.now() - thinking_millsec_now : 0
    }),

    onThinkingStart: async () => {
      // 重置累积内容
      accumulatedThinkingContent = ''
      if (blockManager.hasInitialPlaceholder) {
        const changes: Partial<MessageBlock> = {
          type: MessageBlockType.THINKING,
          content: '',
          status: MessageBlockStatus.STREAMING,
          thinking_millsec: 0
        }
        thinkingBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(thinkingBlockId, changes, MessageBlockType.THINKING, true)
      } else if (!thinkingBlockId) {
        const newBlock = createThinkingBlock(assistantMsgId, '', {
          status: MessageBlockStatus.STREAMING,
          thinking_millsec: 0
        })
        thinkingBlockId = newBlock.id
        await blockManager.handleBlockTransition(newBlock, MessageBlockType.THINKING)
      }
      thinking_millsec_now = performance.now()
    },

    onThinkingChunk: async (text: string) => {
      if (thinkingBlockId) {
        // 累积思考内容，而不是直接覆盖
        accumulatedThinkingContent += text
        const blockChanges: Partial<MessageBlock> = {
          content: accumulatedThinkingContent,
          status: MessageBlockStatus.STREAMING
          // thinking_millsec: performance.now() - thinking_millsec_now
        }
        blockManager.smartBlockUpdate(thinkingBlockId, blockChanges, MessageBlockType.THINKING)
      }
    },

    onThinkingComplete: (finalText: string) => {
      if (thinkingBlockId) {
        const now = performance.now()
        // 优先使用累积的内容，因为 THINKING_COMPLETE 传递的 finalText 可能不正确
        // 只有在累积内容为空时才使用 finalText 作为备选
        const finalContent = accumulatedThinkingContent || finalText
        const changes: Partial<MessageBlock> = {
          content: finalContent,
          status: MessageBlockStatus.SUCCESS,
          thinking_millsec: now - thinking_millsec_now
        }
        blockManager.smartBlockUpdate(thinkingBlockId, changes, MessageBlockType.THINKING, true)
        // 重置状态
        thinkingBlockId = null
        thinking_millsec_now = 0
        accumulatedThinkingContent = ''
      } else {
        logger.warn(
          `[onThinkingComplete] Received thinking.complete but last block was not THINKING (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
