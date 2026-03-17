import { BaseLoader } from '@cherrystudio/embedjs-interfaces'
import { cleanString } from '@cherrystudio/embedjs-utils'
import type { ChunkingStrategy } from '@types'
import md5 from 'md5'

import { legalCleanString } from '../../utils/text'
import { ChonkieRecursiveSplitter } from '../splitter/ChonkieRecursiveSplitter'
import { LegalRecursiveCharacterTextSplitter } from '../splitter/LegalRecursiveCharacterTextSplitter'
import { SemanticLegalSplitter } from '../splitter/SemanticLegalSplitter'

export class NoteLoader extends BaseLoader<{ type: 'NoteLoader' }> {
  private readonly text: string
  private readonly sourceUrl?: string
  private readonly chunkingStrategy: ChunkingStrategy
  private readonly embeddings: any

  constructor({
    text,
    sourceUrl,
    chunkSize,
    chunkOverlap,
    chunkingStrategy,
    embeddings
  }: {
    text: string
    sourceUrl?: string
    chunkSize?: number
    chunkOverlap?: number
    chunkingStrategy?: ChunkingStrategy
    embeddings?: any
  }) {
    super(`NoteLoader_${md5(text + (sourceUrl || ''))}`, { text, sourceUrl }, chunkSize ?? 2000, chunkOverlap ?? 0)
    this.text = text
    this.sourceUrl = sourceUrl
    this.chunkingStrategy = chunkingStrategy || 'recursive'
    this.embeddings = embeddings
  }

  override async *getUnfilteredChunks() {
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
      chunker = new LegalRecursiveCharacterTextSplitter({
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap
      })
    }

    const chunks = await chunker.splitText(legalCleanString(cleanString(this.text)))

    for (const chunk of chunks) {
      yield {
        pageContent: chunk,
        metadata: {
          type: 'NoteLoader' as const,
          source: this.sourceUrl || 'note',
          strategy: this.chunkingStrategy
        }
      }
    }
  }
}
