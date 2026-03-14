import { loggerService } from '@logger'
import { WEB_SEARCH_SOURCE } from '@renderer/types'
import type { CitationMessageBlock, MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createMainTextBlock } from '@renderer/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('TextCallbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  getState: any
  assistantMsgId: string
  getCitationBlockId: () => string | null
  getCitationBlockIdFromTool: () => string | null
  handleCompactTextComplete?: (text: string, mainTextBlockId: string | null) => Promise<boolean>
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const {
    blockManager,
    getState,
    assistantMsgId,
    getCitationBlockId,
    getCitationBlockIdFromTool,
    handleCompactTextComplete
  } = deps

  // 内部维护的状态
  let mainTextBlockId: string | null = null
  // 累积的文本内容
  let accumulatedContent: string = ''

  return {
    getCurrentMainTextBlockId: () => mainTextBlockId,
    onTextStart: async () => {
      // 重置累积内容
      accumulatedContent = ''
      if (blockManager.hasInitialPlaceholder) {
        const changes = {
          type: MessageBlockType.MAIN_TEXT,
          content: '',
          status: MessageBlockStatus.STREAMING
        }
        mainTextBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
      } else if (!mainTextBlockId) {
        const newBlock = createMainTextBlock(assistantMsgId, '', {
          status: MessageBlockStatus.STREAMING
        })
        mainTextBlockId = newBlock.id
        await blockManager.handleBlockTransition(newBlock, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextChunk: async (text: string) => {
      const citationBlockId = getCitationBlockId() || getCitationBlockIdFromTool()
      const citationBlockSource = citationBlockId
        ? (getState().messageBlocks.entities[citationBlockId] as CitationMessageBlock).response?.source
        : WEB_SEARCH_SOURCE.WEBSEARCH
      if (text) {
        // 累积文本内容，而不是直接覆盖
        accumulatedContent += text
        const blockChanges: Partial<MessageBlock> = {
          content: accumulatedContent,
          status: MessageBlockStatus.STREAMING,
          citationReferences: citationBlockId ? [{ citationBlockId, citationBlockSource }] : []
        }
        blockManager.smartBlockUpdate(mainTextBlockId!, blockChanges, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextComplete: async (finalText: string) => {
      if (mainTextBlockId) {
        // 优先使用累积的内容，因为 TEXT_COMPLETE 传递的 finalText 可能不正确
        // 只有在累积内容为空时才使用 finalText 作为备选
        const finalContent = accumulatedContent || finalText
        const changes = {
          content: finalContent,
          status: MessageBlockStatus.SUCCESS
        }
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
        if (handleCompactTextComplete) {
          await handleCompactTextComplete(finalContent, mainTextBlockId)
        }
        // 重置状态
        mainTextBlockId = null
        accumulatedContent = ''
      } else {
        logger.warn(
          `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
