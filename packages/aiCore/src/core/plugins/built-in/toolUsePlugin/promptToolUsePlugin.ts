/**
 * 内置插件：MCP Prompt 模式
 * 为不支持原生 Function Call 的模型提供 prompt 方式的工具调用
 * 内置默认逻辑，支持自定义覆盖
 */
import type { TextStreamPart, ToolSet } from 'ai'

import { definePlugin } from '../../index'
import type { AiPlugin, StreamTextParams, StreamTextResult } from '../../types'
import { getSystemPrompt, getToolUseExamples } from './prompts'
import { StreamEventManager } from './StreamEventManager'
import { type TagConfig, TagExtractor } from './tagExtraction'
import { ToolExecutor } from './ToolExecutor'
import type { PromptToolUseConfig, ToolUseResult } from './type'

/**
 * 工具使用标签配置
 */
const TOOL_USE_TAG_CONFIG: TagConfig = {
  openingTag: '<tool_use>',
  closingTag: '</tool_use>',
  separator: '\n'
}

// 导出默认提示词以保持向后兼容
export { DEFAULT_SYSTEM_PROMPT_EN as DEFAULT_SYSTEM_PROMPT } from './prompts'

/**
 * 构建可用工具部分（提取自 Cherry Studio）
 */
function buildAvailableTools(tools: ToolSet): string | null {
  const availableTools = Object.keys(tools)
  if (availableTools.length === 0) return null
  const result = availableTools
    .map((toolName: string) => {
      const tool = tools[toolName]
      return `
<tool>
  <name>${toolName}</name>
  <description>${tool.description || ''}</description>
  <arguments>
    ${tool.inputSchema ? JSON.stringify(tool.inputSchema) : ''}
  </arguments>
</tool>
`
    })
    .join('\n')
  return `<tools>
${result}
</tools>`
}

/**
 * 默认的系统提示符构建函数（提取自 Cherry Studio）
 * 支持多语言，根据模型自动选择提示词语言
 */
function defaultBuildSystemPrompt(
  userSystemPrompt: string,
  tools: ToolSet,
  mcpMode?: string,
  modelName?: string,
  providerId?: string
): string {
  const availableTools = buildAvailableTools(tools)
  if (availableTools === null) return userSystemPrompt

  // 获取适合模型的系统提示词和示例
  const systemPrompt = getSystemPrompt(modelName, providerId)
  const toolExamples = getToolUseExamples(modelName, providerId)

  if (mcpMode == 'auto') {
    return systemPrompt.replace('{{ TOOLS_INFO }}', '').replace('{{ USER_SYSTEM_PROMPT }}', userSystemPrompt || '')
  }

  const toolsInfo = `
## Tool Use Examples
{{ TOOL_USE_EXAMPLES }}

## Tool Use Available Tools
Above example were using notional tools that might not exist for you. You only have access to these tools:
{{ AVAILABLE_TOOLS }}`
    .replace('{{ TOOL_USE_EXAMPLES }}', toolExamples)
    .replace('{{ AVAILABLE_TOOLS }}', availableTools)

  const fullPrompt = systemPrompt
    .replace('{{ TOOLS_INFO }}', toolsInfo)
    .replace('{{ USER_SYSTEM_PROMPT }}', userSystemPrompt || '')

  return fullPrompt
}

/**
 * 默认工具解析函数（提取自 Cherry Studio）
 * 解析 XML 格式的工具调用
 */
function defaultParseToolUse(content: string, tools: ToolSet): { results: ToolUseResult[]; content: string } {
  if (!content || !tools || Object.keys(tools).length === 0) {
    return { results: [], content: content }
  }

  // 支持两种格式：
  // 1. 完整的 <tool_use></tool_use> 标签包围的内容
  // 2. 只有内部内容（从 TagExtractor 提取出来的）

  let contentToProcess = content
  // 如果内容不包含 <tool_use> 标签，说明是从 TagExtractor 提取的内部内容，需要包装
  if (!content.includes('<tool_use>')) {
    contentToProcess = `<tool_use>\n${content}\n</tool_use>`
  }

  const toolUsePattern =
    /<tool_use>([\s\S]*?)<name>([\s\S]*?)<\/name>([\s\S]*?)<arguments>([\s\S]*?)<\/arguments>([\s\S]*?)<\/tool_use>/g
  const results: ToolUseResult[] = []
  let match
  let idx = 0

  // Find all tool use blocks
  while ((match = toolUsePattern.exec(contentToProcess)) !== null) {
    const fullMatch = match[0]
    let toolName = match[2].trim()
    switch (toolName.toLowerCase()) {
      case 'search':
        toolName = 'mcp__CherryHub__search'
        break
      case 'exec':
        toolName = 'mcp__CherryHub__exec'
        break
      default:
        break
    }
    const toolArgs = match[4].trim()

    // Try to parse the arguments as JSON
    let parsedArgs
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch (error) {
      // If parsing fails, use the string as is
      parsedArgs = toolArgs
    }

    // Find the corresponding tool
    const tool = tools[toolName]
    if (!tool) {
      console.warn(`Tool "${toolName}" not found in available tools`)
      continue
    }

    // Add to results array
    results.push({
      id: `${toolName}-${idx++}`, // Unique ID for each tool use
      toolName: toolName,
      arguments: parsedArgs,
      status: 'pending'
    })
    contentToProcess = contentToProcess.replace(fullMatch, '')
  }
  return { results, content: contentToProcess }
}

export const createPromptToolUsePlugin = (
  config: PromptToolUseConfig = {}
): AiPlugin<StreamTextParams, StreamTextResult> => {
  const {
    enabled = true,
    buildSystemPrompt = defaultBuildSystemPrompt,
    parseToolUse = defaultParseToolUse,
    mcpMode,
    modelName,
    providerId
  } = config

  return definePlugin<StreamTextParams, StreamTextResult>({
    name: 'built-in:prompt-tool-use',
    transformParams: (params, context) => {
      if (!enabled || !params.tools || typeof params.tools !== 'object') {
        return params
      }

      // 分离 provider 和其他类型的工具
      const providerDefinedTools: ToolSet = {}
      const promptTools: ToolSet = {}

      for (const [toolName, tool] of Object.entries(params.tools as ToolSet)) {
        if (tool.type === 'provider') {
          // provider 类型的工具保留在 tools 参数中
          providerDefinedTools[toolName] = tool
        } else {
          // 其他工具转换为 prompt 模式
          promptTools[toolName] = tool
        }
      }

      // 只有当有非 provider 工具时才保存到 context
      if (Object.keys(promptTools).length > 0) {
        context.mcpTools = promptTools
      }

      // 递归调用时，不重新构建 system prompt，避免重复追加工具定义
      if (context.isRecursiveCall) {
        const transformedParams = {
          ...params,
          tools: Object.keys(providerDefinedTools).length > 0 ? providerDefinedTools : undefined
        }
        context.originalParams = transformedParams
        return transformedParams
      }

      // 构建系统提示符（只包含非 provider 工具）
      const userSystemPrompt = typeof params.system === 'string' ? params.system : ''
      const systemPrompt = buildSystemPrompt(userSystemPrompt, promptTools, mcpMode, modelName, providerId)

      // 保留 provide tools，移除其他 tools
      const transformedParams = {
        ...params,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        tools: Object.keys(providerDefinedTools).length > 0 ? providerDefinedTools : undefined
      }
      context.originalParams = transformedParams
      return transformedParams
    },
    transformStream: (params, context) => () => {
      let textBuffer = ''
      // let stepId = ''

      // 如果没有需要 prompt 模式处理的工具，直接返回原始流
      if (!context.mcpTools) {
        return new TransformStream()
      }

      // 从 context 中获取或初始化 usage 累加器
      if (!context.accumulatedUsage) {
        context.accumulatedUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0
        }
      }

      // 创建工具执行器、流事件管理器和标签提取器
      // 使用最大重试次数 2 来防止死循环
      const toolExecutor = new ToolExecutor(2)
      const streamEventManager = new StreamEventManager()
      const tagExtractor = new TagExtractor(TOOL_USE_TAG_CONFIG)

      // 创建 AbortController 用于取消工具执行
      const abortController = new AbortController()

      // 监听原始 params 的 abortSignal，如果外部中止，也中止工具执行
      const originalSignal = (params as any).abortSignal as AbortSignal | undefined
      if (originalSignal) {
        const handleExternalAbort = () => {
          abortController.abort()
        }
        if (originalSignal.aborted) {
          handleExternalAbort()
        } else {
          originalSignal.addEventListener('abort', handleExternalAbort, { once: true })
        }
      }

      // 设置 context.stopStream 以便外部可以取消工具执行
      const originalStopStream = context.stopStream
      context.stopStream = () => {
        abortController.abort()
        originalStopStream?.()
      }

      // 在context中初始化工具执行状态，避免递归调用时状态丢失
      if (!context.hasExecutedToolsInCurrentStep) {
        context.hasExecutedToolsInCurrentStep = false
      }

      // 用于hold text-start事件，直到确认有非工具标签内容
      let pendingTextStart: TextStreamPart<TOOLS> | null = null
      let hasStartedText = false

      type TOOLS = NonNullable<typeof context.mcpTools>
      return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
        async transform(
          chunk: TextStreamPart<TOOLS>,
          controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>
        ) {
          // Hold住text-start事件，直到确认有非工具标签内容
          if ((chunk as any).type === 'text-start') {
            pendingTextStart = chunk
            return
          }

          // text-delta阶段：收集文本内容并过滤工具标签
          if (chunk.type === 'text-delta') {
            textBuffer += chunk.text || ''
            // stepId = chunk.id || ''

            // 使用TagExtractor过滤工具标签，只传递非标签内容到UI层
            const extractionResults = tagExtractor.processText(chunk.text || '')

            for (const result of extractionResults) {
              // 只传递非标签内容到UI层
              if (!result.isTagContent && result.content) {
                // 如果还没有发送text-start且有pending的text-start，先发送它
                if (!hasStartedText && pendingTextStart) {
                  controller.enqueue(pendingTextStart)
                  hasStartedText = true
                  pendingTextStart = null
                }

                const filteredChunk = {
                  ...chunk,
                  text: result.content
                }
                controller.enqueue(filteredChunk)
              }
            }
            return
          }

          if (chunk.type === 'text-end') {
            // 只有当已经发送了text-start时才发送text-end
            if (hasStartedText) {
              controller.enqueue(chunk)
            }
            return
          }

          if (chunk.type === 'finish-step') {
            // 统一在finish-step阶段检查并执行工具调用
            const tools = context.mcpTools
            if (tools && Object.keys(tools).length > 0 && !context.hasExecutedToolsInCurrentStep) {
              // 解析完整的textBuffer来检测工具调用
              const { results: parsedTools } = parseToolUse(textBuffer, tools)
              const validToolUses = parsedTools.filter((t) => t.status === 'pending')

              if (validToolUses.length > 0) {
                context.hasExecutedToolsInCurrentStep = true

                // 执行工具调用（不需要手动发送 start-step，外部流已经处理）
                // 传递 abortSignal 以支持取消
                const executedResults = await toolExecutor.executeTools(
                  validToolUses,
                  tools,
                  controller,
                  abortController.signal
                )

                // 发送步骤完成事件，使用 tool-calls 作为 finishReason
                streamEventManager.sendStepFinishEvent(controller, chunk, context, 'tool-calls')

                // 处理递归调用
                const toolResultsText = toolExecutor.formatToolResults(executedResults)
                const recursiveParams = streamEventManager.buildRecursiveParams(
                  context,
                  textBuffer,
                  toolResultsText,
                  tools
                )

                await streamEventManager.handleRecursiveCall(controller, recursiveParams, context)
                return
              }
            }

            // 如果没有执行工具调用，累加 usage 后透传 finish-step 事件
            if (chunk.usage && context.accumulatedUsage) {
              streamEventManager.accumulateUsage(context.accumulatedUsage, chunk.usage)
            }
            controller.enqueue(chunk)

            // 清理状态
            textBuffer = ''
            return
          }

          // 处理 finish 类型，使用累加后的 totalUsage
          if (chunk.type === 'finish') {
            controller.enqueue({
              ...chunk,
              totalUsage: context.accumulatedUsage
            })
            return
          }

          // 对于其他类型的事件，直接传递（不包括text-start，已在上面处理）
          if ((chunk as any).type !== 'text-start') {
            controller.enqueue(chunk)
          }
        },

        flush() {
          // 清理pending状态
          pendingTextStart = null
          hasStartedText = false
        }
      })
    }
  })
}
