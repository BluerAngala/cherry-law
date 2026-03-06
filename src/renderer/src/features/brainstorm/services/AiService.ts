import { loggerService } from '@logger'
import ModernAiProvider from '@renderer/aiCore/index_new'
import { getRotatedApiKey } from '@renderer/services/ApiService'
import { getDefaultAssistant, getProviderByModel } from '@renderer/services/AssistantService'
import type { Model, Provider } from '@renderer/types'
import { ChunkType } from '@renderer/types/chunk'

const logger = loggerService.withContext('BrainstormAiService')

/**
 * 确保 Provider 拥有有效的 API Key
 */
function ensureProviderWithKey(model: Model, provider?: Provider): Provider {
  // 如果没有提供 provider，或者 provider 缺少 apiKey 且不是系统免 Key Provider
  // 我们尝试从 store 中获取该 model 对应的最新 provider 配置
  const baseProvider =
    !provider || (!provider.apiKey && provider.id !== 'cherryai') ? getProviderByModel(model) : provider

  // 应用 API Key 轮转和凭证获取
  return {
    ...baseProvider,
    apiKey: getRotatedApiKey(baseProvider)
  }
}

export interface AiCallOptions {
  model: Model
  provider: Provider
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  onChunk?: (chunk: string) => void
  abortController?: AbortController
}

export interface AiCallResult {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 调用 AI 生成文本
 * 使用 Cherry Studio 现有的 AI 调用机制
 */
export async function callAI(options: AiCallOptions): Promise<AiCallResult> {
  const {
    model,
    provider: initialProvider,
    systemPrompt,
    userPrompt,
    temperature,
    maxTokens,
    abortController
  } = options

  try {
    const provider = ensureProviderWithKey(model, initialProvider)
    logger.info(`Calling AI model: ${model.name || model.id} using provider: ${provider.name}`)

    const aiProvider = new ModernAiProvider(model, provider)
    const assistant = getDefaultAssistant()

    const result = await aiProvider.completions(
      model.id,
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature,
        maxOutputTokens: maxTokens,
        abortSignal: abortController?.signal
      },
      {
        assistant,
        callType: 'brainstorm',
        streamOutput: false,
        enableReasoning: false,
        isPromptToolUse: false,
        isSupportedToolUse: false,
        isImageGenerationEndpoint: false,
        enableWebSearch: false,
        enableGenerateImage: false,
        enableUrlContext: false
      }
    )

    const content = result.getText()
    logger.info(`AI response received, length: ${content.length}`)

    return {
      content,
      usage: {
        promptTokens: result.usage?.inputTokens || 0,
        completionTokens: result.usage?.outputTokens || 0,
        totalTokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
      }
    }
  } catch (error) {
    logger.error('AI call failed:', error as Error)
    throw new Error(`AI 调用失败: ${(error as Error).message}`)
  }
}

/**
 * 流式调用 AI
 */
export async function streamAI(options: AiCallOptions): Promise<AiCallResult> {
  const {
    model,
    provider: initialProvider,
    systemPrompt,
    userPrompt,
    temperature,
    maxTokens,
    onChunk,
    abortController
  } = options

  try {
    const provider = ensureProviderWithKey(model, initialProvider)
    logger.info(`Streaming AI model: ${model.name || model.id} using provider: ${provider.name}`)

    const aiProvider = new ModernAiProvider(model, provider)
    const assistant = getDefaultAssistant()

    const result = await aiProvider.completions(
      model.id,
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature,
        maxOutputTokens: maxTokens,
        abortSignal: abortController?.signal
      },
      {
        assistant,
        callType: 'brainstorm',
        streamOutput: true,
        onChunk: (chunk) => {
          if (chunk.type === ChunkType.TEXT_DELTA) {
            onChunk?.(chunk.text)
          } else if (chunk.type === ChunkType.THINKING_DELTA) {
            // 如果模型返回思考过程，我们也可以传递给 UI (可选)
            // 这里我们目前只在 brainstorm 模式下关心文本内容
            // 但如果不处理 ERROR，错误就会被吞掉
          } else if (chunk.type === ChunkType.ERROR) {
            logger.error('Stream error chunk received:', chunk.error)
            throw chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error))
          }
        },
        enableReasoning: true, // 开启思考过程支持，避免某些模型因为只有思考没文本而报错
        isPromptToolUse: false,
        isSupportedToolUse: false,
        isImageGenerationEndpoint: false,
        enableWebSearch: false,
        enableGenerateImage: false,
        enableUrlContext: false
      }
    )

    const content = result.getText()
    logger.info(`AI stream completed, length: ${content.length}`)

    return {
      content,
      usage: {
        promptTokens: result.usage?.inputTokens || 0,
        completionTokens: result.usage?.outputTokens || 0,
        totalTokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
      }
    }
  } catch (error) {
    logger.error('AI stream failed:', error as Error)
    throw new Error(`AI 流式调用失败: ${(error as Error).message}`)
  }
}
