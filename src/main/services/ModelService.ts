import OpenAI, { AzureOpenAI } from '@cherrystudio/openai'
import { loggerService } from '@logger'
import type { Model, Provider } from '@types'

const logger = loggerService.withContext('ModelService')

export interface SdkModel {
  id: string
  object?: string
  owned_by?: string
  description?: string
}

function isSupportedModel(model: SdkModel): boolean {
  if (!model.id) {
    return false
  }
  const unsupportedPatterns = [
    /whisper/i,
    /tts/i,
    /dall-e/i,
    /embedding/i,
    /realtime/i,
    /audio/i,
    /babbage/i,
    /davinci/i,
    /gpt-4-turbo-preview/i,
    /gpt-4-1106-preview/i,
    /gpt-4-vision-preview/i,
    /gpt-3.5-turbo-instruct/i,
    /gpt-3.5-turbo-16k/i,
    /gpt-4-32k/i,
    /text-/i,
    /moderation/i
  ]

  return !unsupportedPatterns.some((pattern) => pattern.test(model.id))
}

function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function isOllamaProvider(provider: Provider): boolean {
  return provider.id === 'ollama' || provider.type === 'ollama'
}

function normalizeAzureOpenAIEndpoint(endpoint: string): string {
  return withoutTrailingSlash(endpoint)
}

export class ModelService {
  private static instance: ModelService

  private constructor() {}

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService()
    }
    return ModelService.instance
  }

  private createSdkInstance(provider: Provider): OpenAI | AzureOpenAI {
    const headers: Record<string, string> = {
      ...provider.extra_headers
    }

    if (provider.id === 'azure-openai' || provider.type === 'azure-openai') {
      return new AzureOpenAI({
        apiKey: provider.apiKey,
        apiVersion: provider.apiVersion,
        endpoint: normalizeAzureOpenAIEndpoint(provider.apiHost)
      })
    }

    return new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost,
      defaultHeaders: headers
    })
  }

  async listModels(provider: Provider): Promise<SdkModel[]> {
    try {
      const sdk = this.createSdkInstance(provider)

      if (provider.id === 'openrouter') {
        return await this.listOpenRouterModels(sdk)
      }

      if (provider.id === 'github') {
        return await this.listGithubModels(sdk)
      }

      if (isOllamaProvider(provider)) {
        return await this.listOllamaModels(provider)
      }

      if (provider.id === 'together') {
        return await this.listTogetherModels(sdk)
      }

      const response = await sdk.models.list()
      const models = response.data || []
      models.forEach((model) => {
        model.id = model.id.trim()
      })

      return models.filter(isSupportedModel)
    } catch (error) {
      logger.error('Error listing models:', error as Error)
      return []
    }
  }

  private async listOpenRouterModels(sdk: OpenAI): Promise<SdkModel[]> {
    const embedBaseUrl = 'https://openrouter.ai/api/v1/embeddings'
    const embedSdk = sdk.withOptions({ baseURL: embedBaseUrl })
    const modelPromise = sdk.models.list()
    const embedModelPromise = embedSdk.models.list()
    const [modelResponse, embedModelResponse] = await Promise.all([modelPromise, embedModelPromise])
    const models = [...modelResponse.data, ...embedModelResponse.data]
    const uniqueModels = Array.from(new Map(models.map((model) => [model.id, model])).values())
    return uniqueModels.filter(isSupportedModel)
  }

  private async listGithubModels(sdk: OpenAI): Promise<SdkModel[]> {
    const baseUrl = 'https://models.github.ai/catalog/'
    const newSdk = sdk.withOptions({ baseURL: baseUrl })
    const response = await newSdk.models.list()

    // @ts-ignore key is not typed
    return response?.body
      .map((model: any) => ({
        id: model.id,
        description: model.summary,
        object: 'model',
        owned_by: model.publisher
      }))
      .filter(isSupportedModel)
  }

  private async listOllamaModels(provider: Provider): Promise<SdkModel[]> {
    const baseUrl = withoutTrailingSlash(provider.apiHost)
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '')

    const response = await fetch(`${baseUrl}/api/tags`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...provider.extra_headers
      }
    })

    if (!response.ok) {
      throw new Error(`Ollama server returned ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (!data?.models || !Array.isArray(data.models)) {
      throw new Error('Invalid response from Ollama API: missing models array')
    }

    return data.models.map((model: any) => ({
      id: model.name,
      object: 'model',
      owned_by: 'ollama'
    }))
  }

  private async listTogetherModels(sdk: OpenAI): Promise<SdkModel[]> {
    const response = await sdk.models.list()
    // @ts-ignore key is not typed
    return response?.body.map((model: any) => ({
      id: model.id,
      description: model.display_name,
      object: 'model',
      owned_by: model.organization
    }))
  }

  async getEmbeddingDimensions(provider: Provider, model: Model): Promise<number> {
    let sdk = this.createSdkInstance(provider)

    if (isOllamaProvider(provider)) {
      const embedBaseUrl = `${provider.apiHost.replace(/(\/(api|v1))\/?$/, '')}/v1`
      sdk = sdk.withOptions({ baseURL: embedBaseUrl })
    }

    const data = await sdk.embeddings.create({
      model: model.id,
      input: model?.provider === 'baidu-cloud' ? ['hi'] : 'hi',
      encoding_format: provider.id === 'voyageai' ? undefined : 'float'
    })
    return data.data[0].embedding.length
  }
}

export const modelService = ModelService.getInstance()
