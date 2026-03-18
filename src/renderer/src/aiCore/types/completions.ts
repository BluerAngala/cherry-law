import type { Chunk } from '@renderer/types/chunk'
import type { SdkRawChunk, SdkRawOutput } from '@renderer/types/sdk'
import type { LanguageModelUsage } from 'ai'

export interface CompletionsResult {
  rawOutput?: SdkRawOutput
  stream?: ReadableStream<SdkRawChunk> | ReadableStream<Chunk> | AsyncIterable<Chunk>
  controller?: AbortController
  usage?: LanguageModelUsage

  getText: () => string
}
