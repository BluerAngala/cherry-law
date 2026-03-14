/**
 * 录音历史记录服务
 * 管理录音历史记录的存储和检索
 */
import { loggerService } from '@main/services/LoggerService'
import { IpcChannel } from '@shared/IpcChannel'
import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

import type { SpeechHistoryItem } from './types'

const logger = loggerService.withContext('SpeechHistoryService')

const HISTORY_DIR = 'speech_history'
const HISTORY_FILE = 'history.json'
const MAX_HISTORY_ITEMS = 100

export class SpeechHistoryService {
  private static instance: SpeechHistoryService | null = null
  private historyDir: string
  private historyFile: string
  private history: SpeechHistoryItem[] = []

  private constructor() {
    this.historyDir = join(app.getPath('userData'), HISTORY_DIR)
    this.historyFile = join(this.historyDir, HISTORY_FILE)
    this.ensureDirectory()
    this.loadHistory()
    this.setupIpcHandlers()
  }

  static getInstance(): SpeechHistoryService {
    if (!SpeechHistoryService.instance) {
      SpeechHistoryService.instance = new SpeechHistoryService()
    }
    return SpeechHistoryService.instance
  }

  private ensureDirectory(): void {
    if (!existsSync(this.historyDir)) {
      mkdirSync(this.historyDir, { recursive: true })
      logger.info('创建录音历史目录', { path: this.historyDir })
    }
  }

  private loadHistory(): void {
    try {
      if (existsSync(this.historyFile)) {
        const data = readFileSync(this.historyFile, 'utf-8')
        this.history = JSON.parse(data)
        logger.info('加载录音历史', { count: this.history.length })
      } else {
        this.history = []
        logger.info('录音历史文件不存在，创建新历史')
      }
    } catch (error) {
      logger.error('加载录音历史失败', error as Error)
      this.history = []
    }
  }

  private saveHistory(): void {
    try {
      writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2))
    } catch (error) {
      logger.error('保存录音历史失败', error as Error)
    }
  }

  private setupIpcHandlers(): void {
    ipcMain.handle(IpcChannel.SpeechHistory_GetList, () => this.getList())
    ipcMain.handle(IpcChannel.SpeechHistory_GetItem, (_, id: string) => this.getItem(id))
    ipcMain.handle(IpcChannel.SpeechHistory_DeleteItem, (_, id: string) => this.deleteItem(id))
    ipcMain.handle(IpcChannel.SpeechHistory_ClearAll, () => this.clearAll())
  }

  /**
   * 添加历史记录
   */
  addHistory(item: Omit<SpeechHistoryItem, 'id'>): SpeechHistoryItem {
    const historyItem: SpeechHistoryItem = {
      ...item,
      id: uuidv4()
    }

    this.history.unshift(historyItem)

    // 限制历史记录数量
    if (this.history.length > MAX_HISTORY_ITEMS) {
      const removed = this.history.splice(MAX_HISTORY_ITEMS)
      // 清理音频文件
      removed.forEach((item) => {
        if (item.audioPath && existsSync(item.audioPath)) {
          try {
            unlinkSync(item.audioPath)
          } catch (error) {
            logger.error('删除音频文件失败', error as Error)
          }
        }
      })
    }

    this.saveHistory()
    logger.info('添加录音历史', { id: historyItem.id, text: historyItem.text.substring(0, 50) })

    return historyItem
  }

  /**
   * 获取历史列表
   */
  getList(): SpeechHistoryItem[] {
    return [...this.history]
  }

  /**
   * 获取单个历史记录
   */
  getItem(id: string): SpeechHistoryItem | null {
    return this.history.find((item) => item.id === id) || null
  }

  /**
   * 删除历史记录
   */
  deleteItem(id: string): boolean {
    const index = this.history.findIndex((item) => item.id === id)
    if (index === -1) return false

    const item = this.history[index]

    // 删除音频文件
    if (item.audioPath && existsSync(item.audioPath)) {
      try {
        unlinkSync(item.audioPath)
      } catch (error) {
        logger.error('删除音频文件失败', error as Error)
      }
    }

    this.history.splice(index, 1)
    this.saveHistory()
    logger.info('删除录音历史', { id })

    return true
  }

  /**
   * 清空所有历史
   */
  clearAll(): void {
    // 删除所有音频文件
    this.history.forEach((item) => {
      if (item.audioPath && existsSync(item.audioPath)) {
        try {
          unlinkSync(item.audioPath)
        } catch (error) {
          logger.error('删除音频文件失败', error as Error)
        }
      }
    })

    this.history = []
    this.saveHistory()
    logger.info('清空所有录音历史')
  }

  /**
   * 更新历史记录
   */
  updateItem(id: string, updates: Partial<SpeechHistoryItem>): boolean {
    const index = this.history.findIndex((item) => item.id === id)
    if (index === -1) return false

    this.history[index] = { ...this.history[index], ...updates }
    this.saveHistory()
    return true
  }

  /**
   * 获取音频文件保存路径
   */
  getAudioFilePath(): string {
    return join(this.historyDir, `audio_${Date.now()}.wav`)
  }

  /**
   * 清理未关联的音频文件
   */
  cleanupOrphanedAudio(): void {
    try {
      const audioFiles = new Set(this.history.map((item) => item.audioPath).filter(Boolean))
      const files = readdirSync(this.historyDir)

      files.forEach((file) => {
        if (file.startsWith('audio_') && file.endsWith('.wav')) {
          const filePath = join(this.historyDir, file)
          if (!audioFiles.has(filePath)) {
            try {
              unlinkSync(filePath)
              logger.info('清理孤立音频文件', { file })
            } catch (error) {
              logger.error('清理音频文件失败', error as Error)
            }
          }
        }
      })
    } catch (error) {
      logger.error('清理音频文件失败', error as Error)
    }
  }
}

export const speechHistoryService = SpeechHistoryService.getInstance()
