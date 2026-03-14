/**
 * AI 回答质量审查服务
 * 使用快速模型对 AI 回答进行格式和质量的自动审查
 */

import { loggerService } from '@logger'
import store from '@renderer/store'
import type { Assistant, Model } from '@renderer/types'
import type { Response } from '@renderer/types/newMessage'

import AiProviderNew from '../aiCore/index_new'
import { getRotatedApiKey, hasApiKey } from './ApiService'
import { getProviderByModel } from './AssistantService'

const logger = loggerService.withContext('ResponseReviewService')

/**
 * 审查结果
 */
export interface ReviewResult {
  // 总体评分 (0-100)
  overallScore: number
  // 格式正确性评分 (0-100)
  formatScore: number
  // 内容完整性评分 (0-100)
  completenessScore: number
  // 逻辑连贯性评分 (0-100)
  coherenceScore: number
  // 审查评语
  comment: string
  // 是否通过审查
  passed: boolean
  // 改进建议
  suggestions: string[]
  // 使用的审查模型
  reviewModel?: string
  // 审查耗时 (ms)
  reviewTime?: number
}

/**
 * 审查请求参数
 */
export interface ReviewRequest {
  // 用户问题
  userQuery: string
  // AI 回答内容
  assistantResponse: string
  // 使用的助手配置
  assistant: Assistant
  // 原始响应数据
  response?: Response
  // 审查模型（可选，默认使用全局快速模型）
  reviewModel?: Model
}

/**
 * 审查提示词模板
 */
const REVIEW_PROMPT_TEMPLATE = `你是一位专业的 AI 回答质量审查员。请对以下 AI 助手的回答进行客观、全面的质量评估。

## 重要前提

这个 AI 助手有特定的系统提示词（角色设定和输出要求）。你必须**基于助手的系统提示词**来评判回答是否符合要求，而不是基于一般常识。

{{SYSTEM_PROMPT}}

## 审查维度与权重

### 1. **符合系统提示词要求** (权重: 40%, 0-100分) ⭐ 最重要
   - 回答是否符合助手的角色设定和输出格式要求
   - 回答是否遵循了系统提示词中的指令和约束
   - 如果系统提示词要求特定格式/结构，回答是否满足
   - 不要以"一般应该回答什么"来评判，而是以"系统提示词要求回答什么"来评判

### 2. **内容完整性** (权重: 30%, 0-100分)
   - 是否完整回应了用户问题中的各个要点
   - 是否遗漏了关键信息或步骤
   - 是否提供了足够的细节和解释

### 3. **格式规范性** (权重: 15%, 0-100分)
   - 是否使用了适当的 Markdown 格式
   - 格式是否符合系统提示词的要求
   - 格式错误是否影响内容理解（小错误可忽略）

### 4. **表达清晰度** (权重: 15%, 0-100分)
   - 回答结构是否清晰易懂
   - 论述是否有条理
   - 语言表达是否通顺

## 综合评分计算
overallScore = 符合提示词×0.4 + 完整性×0.3 + 格式×0.15 + 清晰度×0.15

## 评分标准

- 90-100分：优秀，完全符合系统提示词要求，内容完整清晰
- 80-89分：良好，基本符合要求，有轻微改进空间
- 70-79分：一般，基本符合要求，但有明显改进空间
- 60-69分：及格，部分符合要求，需要改进
- 0-59分：不及格，严重偏离系统提示词要求，需要重新生成

## 输出格式

请以 JSON 格式输出审查结果，不要包含任何其他文字：

{
  "formatScore": 数字,
  "completenessScore": 数字,
  "coherenceScore": 数字,
  "overallScore": 数字,
  "passed": true/false,
  "comment": "总体评语，重点说明是否符合系统提示词要求",
  "suggestions": ["具体改进建议1", "具体改进建议2", ...]
}

注意：
- coherenceScore 现在代表"符合系统提示词要求程度"
- 评判时必须考虑系统提示词的约束，不能仅凭常识判断
- 如果系统提示词要求特定的回答方式，即使看起来"奇怪"也是正确的

## 待审查内容

**用户问题：**
{{USER_QUERY}}

**AI 回答：**
{{ASSISTANT_RESPONSE}}

请进行审查并输出 JSON 结果：`

/**
 * 获取审查模型
 * 优先使用助手配置的审查模型，其次使用全局快速模型，最后使用助手当前模型
 */
function getReviewModel(assistant: Assistant, customReviewModel?: Model): Model | null {
  // 1. 如果传入了自定义审查模型，优先使用
  if (customReviewModel) {
    return customReviewModel
  }

  // 2. 使用助手配置的审查模型
  if (assistant.settings?.reviewModel) {
    return assistant.settings.reviewModel
  }

  // 3. 使用全局快速模型
  const state = store.getState()
  const globalQuickModel = state.llm.quickModel
  if (globalQuickModel) {
    return globalQuickModel
  }

  // 4. 降级使用助手当前模型
  if (assistant.model) {
    logger.warn('Using assistant model for review, consider configuring a quick model')
    return assistant.model
  }

  return null
}

/**
 * 审查 AI 回答质量
 * @param request 审查请求
 * @returns 审查结果
 */
export async function reviewResponse(request: ReviewRequest): Promise<ReviewResult | null> {
  const startTime = Date.now()

  try {
    const { userQuery, assistantResponse, assistant, reviewModel: customReviewModel } = request

    // 获取审查模型
    const reviewModel = getReviewModel(assistant, customReviewModel)
    if (!reviewModel) {
      logger.warn('No model available for review')
      return null
    }

    const provider = getProviderByModel(reviewModel)
    if (!hasApiKey(provider)) {
      logger.warn('No API key available for review')
      return null
    }

    // 构建系统提示词部分
    const systemPromptSection = assistant.prompt
      ? `**助手系统提示词（角色设定和输出要求）：**\n${assistant.prompt}\n`
      : '（该助手没有特定的系统提示词，按一般标准评判）'

    // 构建审查提示词
    const reviewPrompt = REVIEW_PROMPT_TEMPLATE.replace('{{SYSTEM_PROMPT}}', systemPromptSection)
      .replace('{{USER_QUERY}}', userQuery)
      .replace('{{ASSISTANT_RESPONSE}}', assistantResponse)

    // 应用 API key rotation
    const providerWithRotatedKey = {
      ...provider,
      apiKey: getRotatedApiKey(provider)
    }

    // 创建 AI Provider
    const ai = new AiProviderNew(reviewModel, providerWithRotatedKey)

    // 调用模型进行审查
    const result = await ai.completions(
      reviewModel.id,
      {
        messages: [
          {
            role: 'user',
            content: reviewPrompt
          }
        ],
        system: '你是一个专业的 AI 回答质量审查员。请严格按照 JSON 格式输出审查结果。',
        temperature: 0.3,
        maxOutputTokens: 2000
      },
      {
        assistant,
        callType: 'review',
        streamOutput: false,
        enableWebSearch: false,
        enableReasoning: false,
        isPromptToolUse: false,
        isSupportedToolUse: false,
        isImageGenerationEndpoint: false,
        enableGenerateImage: false,
        enableUrlContext: false
      }
    )

    // 获取文本内容
    const content = result.getText()
    if (!content) {
      logger.warn('Review model returned empty response')
      return null
    }

    // 解析 JSON 结果
    const reviewResult = parseReviewResult(content)
    if (reviewResult) {
      reviewResult.reviewModel = reviewModel.name
      reviewResult.reviewTime = Date.now() - startTime
    }

    return reviewResult
  } catch (error) {
    logger.error('Error reviewing response:', error as Error)
    return null
  }
}

/**
 * 解析审查结果 JSON
 * @param text 模型返回的文本
 * @returns 解析后的审查结果
 */
function parseReviewResult(text: string): ReviewResult | null {
  try {
    // 尝试提取 JSON 部分
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logger.warn('No JSON found in review response')
      return null
    }

    const jsonStr = jsonMatch[0]
    const parsed = JSON.parse(jsonStr)

    // 验证必要字段
    if (
      typeof parsed.formatScore !== 'number' ||
      typeof parsed.completenessScore !== 'number' ||
      typeof parsed.coherenceScore !== 'number' ||
      typeof parsed.overallScore !== 'number'
    ) {
      logger.warn('Review result missing required score fields')
      return null
    }

    return {
      formatScore: Math.max(0, Math.min(100, Math.round(parsed.formatScore))),
      completenessScore: Math.max(0, Math.min(100, Math.round(parsed.completenessScore))),
      coherenceScore: Math.max(0, Math.min(100, Math.round(parsed.coherenceScore))),
      overallScore: Math.max(0, Math.min(100, Math.round(parsed.overallScore))),
      passed: parsed.passed ?? parsed.overallScore >= 70,
      comment: parsed.comment || '无评语',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    }
  } catch (error) {
    logger.error('Failed to parse review result:', error as Error, { text })
    return null
  }
}

/**
 * 获取评分等级
 * @param score 评分 (0-100)
 * @returns 评分等级
 */
export function getScoreLevel(score: number): {
  level: 'excellent' | 'good' | 'average' | 'poor' | 'fail'
  label: string
  color: string
} {
  if (score >= 90) {
    return { level: 'excellent', label: '优秀', color: '#52c41a' }
  }
  if (score >= 80) {
    return { level: 'good', label: '良好', color: '#73d13d' }
  }
  if (score >= 70) {
    return { level: 'average', label: '一般', color: '#faad14' }
  }
  if (score >= 60) {
    return { level: 'poor', label: '及格', color: '#ff7a45' }
  }
  return { level: 'fail', label: '需改进', color: '#ff4d4f' }
}

/**
 * 检查是否需要重新生成
 * @param reviewResult 审查结果
 * @returns 是否需要重新生成
 */
export function shouldRegenerate(reviewResult: ReviewResult): boolean {
  return !reviewResult.passed || reviewResult.overallScore < 70
}

/**
 * 构建重新生成的提示词
 * @param originalQuery 原始问题
 * @param reviewResult 审查结果
 * @param userFeedback 用户额外反馈（可选）
 * @returns 改进后的提示词
 */
export function buildRegenerationPrompt(
  originalQuery: string,
  reviewResult: ReviewResult,
  userFeedback?: string
): string {
  const suggestions = reviewResult.suggestions.join('\n- ')

  let prompt = `请重新回答以下问题，注意改进以下方面：

**原始问题：**
${originalQuery}

**需要改进的地方：**
- ${suggestions}

**审查评语：**
${reviewResult.comment}`

  // 添加用户额外反馈
  if (userFeedback && userFeedback.trim()) {
    prompt += `\n\n**用户额外反馈：**\n${userFeedback.trim()}`
  }

  // 添加评分信息，帮助模型了解改进优先级
  prompt += `\n\n**评分详情（供参考）：**
- 格式正确性：${reviewResult.formatScore}/100
- 内容完整性：${reviewResult.completenessScore}/100
- 逻辑连贯性：${reviewResult.coherenceScore}/100
- 综合评分：${reviewResult.overallScore}/100`

  prompt += `\n\n请提供一个改进后的回答，确保格式正确、内容完整、逻辑清晰。重点关注评分较低的方面。`

  return prompt
}

/**
 * 检查重新生成是否可能导致质量下降
 * @param previousResult 之前的审查结果
 * @param currentResult 当前的审查结果
 * @returns 质量是否下降
 */
export function checkQualityRegression(previousResult: ReviewResult, currentResult: ReviewResult): boolean {
  // 如果综合评分下降超过 10 分，认为质量下降
  if (currentResult.overallScore < previousResult.overallScore - 10) {
    return true
  }

  // 如果某个维度评分下降超过 20 分，认为质量下降
  if (
    currentResult.formatScore < previousResult.formatScore - 20 ||
    currentResult.completenessScore < previousResult.completenessScore - 20 ||
    currentResult.coherenceScore < previousResult.coherenceScore - 20
  ) {
    return true
  }

  return false
}

/**
 * 比较两个审查结果，返回改进总结
 * @param previousResult 之前的审查结果
 * @param currentResult 当前的审查结果
 * @returns 改进总结
 */
export function compareReviewResults(
  previousResult: ReviewResult,
  currentResult: ReviewResult
): {
  improved: boolean
  summary: string
  scoreChange: number
} {
  const scoreChange = currentResult.overallScore - previousResult.overallScore
  const improved = scoreChange > 0

  let summary = ''
  if (scoreChange > 10) {
    summary = '回答质量有明显提升'
  } else if (scoreChange > 0) {
    summary = '回答质量略有改善'
  } else if (scoreChange === 0) {
    summary = '回答质量保持不变'
  } else if (scoreChange > -10) {
    summary = '回答质量略有下降'
  } else {
    summary = '回答质量明显下降，建议查看原回答'
  }

  return { improved, summary, scoreChange }
}
