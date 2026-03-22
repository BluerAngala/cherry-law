import { loggerService } from '@logger'
import type { AgentPersistedMessage, GetAgentSessionResponse } from '@types'
import { EventEmitter } from 'events'

import type {
  AgentServiceInterface,
  AgentStream,
  AgentStreamEvent,
  AgentThinkingOptions
} from '../interfaces/AgentStreamInterface'

const logger = loggerService.withContext('AiCoreAgentService')

class AiCoreAgentStream extends EventEmitter implements AgentStream {
  declare emit: (event: 'data', data: AgentStreamEvent) => boolean
  declare on: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
  declare once: (event: 'data', listener: (data: AgentStreamEvent) => void) => this
}

export class AiCoreAgentService implements AgentServiceInterface {
  private static instance: AiCoreAgentService | null = null

  static getInstance(): AiCoreAgentService {
    if (!AiCoreAgentService.instance) {
      AiCoreAgentService.instance = new AiCoreAgentService()
    }
    return AiCoreAgentService.instance
  }

  async invoke(
    prompt: string,
    session: GetAgentSessionResponse,
    abortController: AbortController,
    _lastAgentSessionId?: string,
    _thinkingOptions?: AgentThinkingOptions
  ): Promise<AgentStream> {
    const aiStream = new AiCoreAgentStream()

    try {
      logger.info('Starting AI Core agent invocation', {
        sessionId: session.id,
        model: session.model,
        promptLength: prompt.length
      })

      const { OpenAI } = await import('@cherrystudio/ai-core')
      const { validateModelId } = await import('@main/apiServer/utils')

      const modelValidation = await validateModelId(session.model)
      if (!modelValidation.valid) {
        throw new Error(`Model validation failed: ${modelValidation.error?.message || 'Unknown error'}`)
      }

      const provider = modelValidation.provider!
      const modelId = modelValidation.modelId!
      const client = new OpenAI({
        baseURL: provider.apiHost,
        apiKey: provider.apiKey
      })

      const messages = await this.buildMessageHistory(session.id, prompt)
      this.streamChat(client, modelId, messages, session, aiStream, abortController)
    } catch (error) {
      logger.error('Failed to invoke AI Core agent', error as Error)
      setImmediate(() => {
        aiStream.emit('data', {
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error))
        })
      })
    }

    return aiStream
  }

  private async buildMessageHistory(
    sessionId: string,
    currentPrompt: string
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const { sessionMessageService } = await import('../index')
    const { messages } = await sessionMessageService.listSessionMessages(sessionId, { limit: 20 })

    const historyMessages = messages
      .map((message) => {
        const content = this.extractMessageText(message.content)
        if (!content) {
          return null
        }

        return {
          role: message.role === 'user' ? 'user' : 'assistant',
          content
        }
      })
      .filter((message): message is { role: 'user' | 'assistant'; content: string } => message !== null)

    historyMessages.push({
      role: 'user',
      content: currentPrompt
    })

    return historyMessages
  }

  private extractMessageText(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    const persistedMessage = content as AgentPersistedMessage | undefined
    if (persistedMessage?.blocks && Array.isArray(persistedMessage.blocks)) {
      const text = persistedMessage.blocks
        .filter((block): block is AgentPersistedMessage['blocks'][number] & { content: string } => {
          return block?.type === 'main_text' && typeof (block as { content?: unknown }).content === 'string'
        })
        .map((block) => block.content)
        .join('\n')
        .trim()

      if (text) {
        return text
      }
    }

    if (persistedMessage?.message) {
      return JSON.stringify(persistedMessage.message)
    }

    if (content == null) {
      return ''
    }

    return JSON.stringify(content)
  }

  private async streamChat(
    client: any,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    session: GetAgentSessionResponse,
    aiStream: AiCoreAgentStream,
    abortController: AbortController
  ): Promise<void> {
    const messageId = `aicore_${Date.now()}`

    try {
      logger.debug('Starting stream chat', { modelId, messageCount: messages.length })

      const stream = await client.chat.completions.create({
        model: modelId,
        messages,
        stream: true,
        temperature: session.configuration?.temperature ?? 0.7,
        max_tokens: session.configuration?.max_tokens
      })

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          aiStream.emit('data', { type: 'cancelled' })
          return
        }

        const content = chunk.choices?.[0]?.delta?.content
        if (content) {
          aiStream.emit('data', {
            type: 'chunk',
            chunk: {
              type: 'text-delta',
              id: messageId,
              text: content
            }
          })
        }
      }

      aiStream.emit('data', { type: 'complete' })
      logger.info('Stream chat completed', { sessionId: session.id })
    } catch (error) {
      logger.error('Error in stream chat', error as Error)
      aiStream.emit('data', {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  dispose(): void {
    logger.info('AiCoreAgentService disposed')
  }
}

export default AiCoreAgentService
