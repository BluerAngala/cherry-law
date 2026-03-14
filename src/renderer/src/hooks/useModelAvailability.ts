import { useAppSelector } from '@renderer/store'
import { isEmpty } from 'lodash'
import { useMemo } from 'react'

export function useModelAvailability() {
  const providers = useAppSelector((state) => state.llm.providers)
  const defaultModel = useAppSelector((state) => state.llm.defaultModel)

  const isModelAvailable = useMemo(() => {
    // 检查是否有启用的 Provider 且具有 API Key 或不需要 API Key
    const activeProviders = providers.filter((p) => p.enabled)

    if (activeProviders.length === 0) return false

    // 检查是否至少有一个启用的 Provider 配置了模型和 Key
    const hasConfiguredProvider = activeProviders.some((p) => {
      // 本地模型或已有 Key 的云端模型
      const isLocal = ['ollama', 'lmstudio', 'gpustack'].includes(p.id)
      const hasKey = !isEmpty(p.apiKey)
      const hasModels = p.models && p.models.length > 0

      return (isLocal || hasKey) && hasModels
    })

    if (!hasConfiguredProvider) return false

    // 检查默认模型是否有效
    if (!defaultModel || !defaultModel.id) return false

    return true
  }, [providers, defaultModel])

  return {
    isModelAvailable
  }
}
