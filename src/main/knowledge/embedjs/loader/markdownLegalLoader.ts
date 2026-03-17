import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import type { ChunkingStrategy } from '@types'
import md5 from 'md5'

import { legalCleanString } from '../../utils/text'
import { ChonkieRecursiveSplitter } from '../splitter/ChonkieRecursiveSplitter'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'
import { SemanticLegalSplitter } from '../splitter/SemanticLegalSplitter'

/**
 * 专门为法律文档优化的 Markdown 加载器
 * 它首先尝试基于 Markdown 标题（H1, H2, H3）进行结构化切分，
 * 确保每个章节的上下文完整性。如果章节内容过长，再使用 LegalRecursiveCharacterTextSplitter。
 */
export class MarkdownLegalLoader extends BaseLoader<{ type: 'MarkdownLegalLoader' }> {
  private readonly text: string
  private readonly filePath: string
  private readonly chunkingStrategy: ChunkingStrategy
  private readonly embeddings: any

  constructor({
    text,
    filePath,
    chunkSize,
    chunkOverlap,
    chunkingStrategy,
    embeddings
  }: {
    text: string
    filePath: string
    chunkSize?: number
    chunkOverlap?: number
    chunkingStrategy?: ChunkingStrategy
    embeddings?: any
  }) {
    super(`MarkdownLegalLoader_${md5(text + filePath)}`, { text, filePath }, chunkSize ?? 500, chunkOverlap ?? 50)
    this.text = text
    this.filePath = filePath
    this.chunkingStrategy = chunkingStrategy || 'structural'
    this.embeddings = embeddings
  }

  override async *getUnfilteredChunks() {
    const cleanedText = legalCleanString(this.text)

    // 如果选择的是递归或语义，则跳过结构化逻辑，直接交给 subChunk 处理全文
    if (this.chunkingStrategy !== 'structural') {
      yield* this.subChunk(cleanedText)
      return
    }

    // 1. 基于标题进行初步切分 (H1, H2, H3)
    // 识别如 #, ##, ### 等开头的标题
    const headerRegex = /^#{1,3}\s+.+$/gm
    const headers = cleanedText.match(headerRegex) || []
    const splits = cleanedText.split(headerRegex)

    // 如果没有 Markdown 标题，尝试使用法律条文章节作为标题 (第一章, 第一节)
    if (headers.length === 0) {
      const legalHeaderRegex = /^\s*(第[一二三四五六七八九十]+[章节])\s+.*$/gm
      const legalHeaders = cleanedText.match(legalHeaderRegex) || []
      const legalSplits = cleanedText.split(legalHeaderRegex)

      if (legalHeaders.length > 0) {
        if (legalSplits[0].trim()) {
          yield* this.subChunk(legalSplits[0].trim(), '前言')
        }
        for (let i = 0; i < legalHeaders.length; i++) {
          yield* this.subChunk(legalSplits[i + 1].trim(), legalHeaders[i])
        }
        return
      }

      yield* this.subChunk(cleanedText)
      return
    }

    // 2. 组合标题和内容
    // 第一个 split 是第一个标题之前的文本（可能是前言）
    if (splits[0].trim()) {
      yield* this.subChunk(splits[0].trim(), '前言')
    }

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]
      const content = splits[i + 1] || ''
      yield* this.subChunk(content.trim(), header)
    }
  }

  /**
   * 对章节内容进行二次分块，并注入标题上下文
   */
  private async *subChunk(text: string, headerContext?: string) {
    if (!text.trim()) return

    // 根据策略选择分块器
    let chunker: any
    if (this.chunkingStrategy === 'semantic' && this.embeddings) {
      chunker = new SemanticLegalSplitter({
        embeddings: this.embeddings,
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    } else if (this.chunkingStrategy === 'recursive') {
      chunker = new ChonkieRecursiveSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    } else {
      // 默认（结构化）使用法律递归分块作为二级切分
      chunker = new LegalRecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    }

    const subChunks = await chunker.splitText(text)

    for (const subChunk of subChunks) {
      // 在分块内容前注入标题上下文，帮助检索定位
      const pageContent = headerContext ? `[${headerContext}]\n${subChunk}` : subChunk
      yield {
        pageContent,
        metadata: {
          type: 'MarkdownLegalLoader' as const,
          source: this.filePath,
          header: headerContext,
          strategy: this.chunkingStrategy
        }
      }
    }
  }
}
