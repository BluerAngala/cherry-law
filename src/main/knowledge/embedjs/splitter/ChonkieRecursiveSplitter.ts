import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

import { logger as baseLogger } from '../logger'

const logger = baseLogger.withContext('ChonkieRecursiveSplitter')

/**
 * 使用 Chonkie 引擎优化的递归分块器
 * Chonkie 提供了更精准的 Token 计算和更快的切分速度
 */
export class ChonkieRecursiveSplitter extends RecursiveCharacterTextSplitter {
  private chunker: any

  constructor(fields?: any) {
    super(fields)
  }

  async splitText(text: string): Promise<string[]> {
    if (!this.chunker) {
      // 修复兼容性问题：针对纯 ESM 模块使用多种路径探测
      let RecursiveChunker: any
      try {
        // 尝试标准导入
        // @ts-ignore
        const mod = await import('chonkie')
        RecursiveChunker = mod.RecursiveChunker
      } catch (e) {
        try {
          // 尝试指向编译后的直接路径
          // @ts-ignore
          const mod = await import('chonkie/dist/chonkie/index.js')
          RecursiveChunker = mod.RecursiveChunker
        } catch (e2) {
          // 极致容错：如果实在找不到 chonkie，退化到使用父类的原始实现（LangChain）
          logger.warn('无法加载 chonkie 引擎，回退到标准 LangChain 分块')
          return super.splitText(text)
        }
      }

      if (RecursiveChunker) {
        this.chunker = await RecursiveChunker.create({
          chunkSize: this.chunkSize
        })
      }
    }

    if (this.chunker) {
      // 使用 Chonkie 进行切分
      const chunks = await this.chunker.chunk(text)
      return chunks.map((c: any) => c.text)
    }

    return super.splitText(text)
  }
}
