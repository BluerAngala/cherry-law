import type { Model } from '@renderer/types'
import { isSystemProviderId, type SystemProviderId } from '@renderer/types'
import { getLowerBaseModelName, isUserSelectedModelType } from '@renderer/utils'

import { isEmbeddingModel, isRerankModel } from './embedding'
import { isDeepSeekHybridInferenceModel } from './reasoning'
import { isTextToImageModel } from './vision'

// Tool calling models
export const FUNCTION_CALLING_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4',
  'gpt-4.5',
  'gpt-oss(?:-[\\w-]+)',
  'gpt-5(?:-[0-9-]+)?',
  'o(1|3|4)(?:-[\\w-]+)?',
  'claude',
  'qwen',
  'qwen3',
  'hunyuan',
  'deepseek',
  'glm-4(?:-[\\w-]+)?',
  'glm-4.5(?:-[\\w-]+)?',
  'glm-4.7(?:-[\\w-]+)?',
  'glm-5(?:-[\\w-]+)?',
  'learnlm(?:-[\\w-]+)?',
  'gemini(?:-[\\w-]+)?', // 提前排除了gemini的嵌入模型
  'grok-3(?:-[\\w-]+)?',
  'doubao-seed-1[.-][68](?:-[\\w-]+)?',
  'doubao-seed-2[.-]0(?:-[\\w-]+)?',
  'doubao-seed-code(?:-[\\w-]+)?',
  'kimi-k2(?:-[\\w-]+)?',
  'ling-\\w+(?:-[\\w-]+)?',
  'ring-\\w+(?:-[\\w-]+)?',
  'minimax-m2(?:.1)?',
  'mimo-v2-flash'
] as const

const FUNCTION_CALLING_EXCLUDED_MODELS = [
  'aqa(?:-[\\w-]+)?',
  'imagen(?:-[\\w-]+)?',
  'o1-mini',
  'o1-preview',
  'AIDC-AI/Marco-o1',
  'gemini-1(?:\\.[\\w-]+)?',
  'qwen-mt(?:-[\\w-]+)?',
  'gpt-5-chat(?:-[\\w-]+)?',
  'glm-4\\.5v',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3(?:\\.\\d+)?-pro-image(?:-[\\w-]+)?',
  'deepseek-v3.2-speciale'
]

export const FUNCTION_CALLING_REGEX = new RegExp(
  `\\b(?!(?:${FUNCTION_CALLING_EXCLUDED_MODELS.join('|')})\\b)(?:${FUNCTION_CALLING_MODELS.join('|')})\\b`,
  'i'
)

/**
 * 不支持原生 Function Calling 的 Provider 列表
 * 这些 Provider 即使模型名称匹配，也强制使用 Prompt 模式
 */
export const PROVIDERS_WITHOUT_FUNCTION_CALLING: SystemProviderId[] = [
  'silicon', // 硅基流动 - 虽然模型支持，但 API 适配不完全
  'ocoolai', // 类似的第三方聚合平台
  'ppio', // PPIO
  'alayanew', // 阿拉云
  'dmxapi', // DMXAPI
  'burncloud', // 燃烧云
  'tokenflux', // TokenFlux
  'lanyun', // 蓝耘
  'ph8', // PH8
  'sophnet', // SophNet
  'new-api', // New API 类平台
  'gpustack', // GPUStack
  'longcat', // LongCat
  'aionly', // AI Only
  'xirang', // 息壤
  'infini', // 无问芯穹
  'modelscope' // 魔搭社区
]

/**
 * 检测 Provider 是否支持原生 Function Calling
 * @param providerId Provider ID
 * @returns 是否支持
 */
export function isProviderSupportFunctionCalling(providerId: string): boolean {
  if (!isSystemProviderId(providerId)) {
    // 自定义 Provider 默认不支持，使用 Prompt 模式更安全
    return false
  }
  return !PROVIDERS_WITHOUT_FUNCTION_CALLING.includes(providerId)
}

export function isFunctionCallingModel(model?: Model): boolean {
  if (!model || isEmbeddingModel(model) || isRerankModel(model) || isTextToImageModel(model)) {
    return false
  }

  const modelId = getLowerBaseModelName(model.id)

  if (isUserSelectedModelType(model, 'function_calling') !== undefined) {
    return isUserSelectedModelType(model, 'function_calling')!
  }

  // 首先检查 Provider 是否支持 Function Calling
  if (!isProviderSupportFunctionCalling(model.provider)) {
    return false
  }

  if (model.provider === 'doubao' || modelId.includes('doubao')) {
    return FUNCTION_CALLING_REGEX.test(modelId) || FUNCTION_CALLING_REGEX.test(model.name)
  }

  // 2025/08/26 百炼与火山引擎均不支持 v3.1 函数调用
  // 先默认支持
  if (isDeepSeekHybridInferenceModel(model)) {
    if (isSystemProviderId(model.provider)) {
      switch (model.provider) {
        case 'dashscope':
        case 'doubao':
          // case 'nvidia': // nvidia api 太烂了 测不了能不能用 先假设能用
          return false
      }
    }
    return true
  }

  return FUNCTION_CALLING_REGEX.test(modelId)
}
