import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import { eq } from 'drizzle-orm'
import { ipcMain } from 'electron'

import { DatabaseManager } from './agents/database/DatabaseManager'
import {
  type InsertTranslateHistoryRow,
  type InsertTranslateLanguageRow,
  translateHistoryTable,
  translateLanguagesTable
} from './agents/database/schema/translate.schema'

const logger = loggerService.withContext('TranslateService')

export class TranslateService {
  private static instance: TranslateService

  private constructor() {}

  public static getInstance(): TranslateService {
    if (!TranslateService.instance) {
      TranslateService.instance = new TranslateService()
    }
    return TranslateService.instance
  }

  public registerIpcHandlers(): void {
    // Get all translate history
    ipcMain.handle(IpcChannel.Translate_GetHistory, async () => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        const history = await db.select().from(translateHistoryTable)
        return history
      } catch (error) {
        logger.error('Failed to get translate history:', error as Error)
        throw error
      }
    })

    // Add translate history
    ipcMain.handle(IpcChannel.Translate_AddHistory, async (_event, data: InsertTranslateHistoryRow) => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        await db.insert(translateHistoryTable).values(data)
        return { success: true }
      } catch (error) {
        logger.error('Failed to add translate history:', error as Error)
        throw error
      }
    })

    // Delete translate history
    ipcMain.handle(IpcChannel.Translate_DeleteHistory, async (_event, id: string) => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        await db.delete(translateHistoryTable).where(eq(translateHistoryTable.id, id))
        return { success: true }
      } catch (error) {
        logger.error('Failed to delete translate history:', error as Error)
        throw error
      }
    })

    // Clear all translate history
    ipcMain.handle(IpcChannel.Translate_ClearHistory, async () => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        await db.delete(translateHistoryTable)
        return { success: true }
      } catch (error) {
        logger.error('Failed to clear translate history:', error as Error)
        throw error
      }
    })

    // Get all custom translate languages
    ipcMain.handle(IpcChannel.Translate_GetLanguages, async () => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        const languages = await db.select().from(translateLanguagesTable)
        return languages
      } catch (error) {
        logger.error('Failed to get translate languages:', error as Error)
        throw error
      }
    })

    // Add custom translate language
    ipcMain.handle(IpcChannel.Translate_AddLanguage, async (_event, data: InsertTranslateLanguageRow) => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        await db.insert(translateLanguagesTable).values(data)
        return { success: true }
      } catch (error) {
        logger.error('Failed to add translate language:', error as Error)
        throw error
      }
    })

    // Delete custom translate language
    ipcMain.handle(IpcChannel.Translate_DeleteLanguage, async (_event, id: string) => {
      try {
        const dbManager = await DatabaseManager.getInstance()
        const db = dbManager.getDatabase()
        await db.delete(translateLanguagesTable).where(eq(translateLanguagesTable.id, id))
        return { success: true }
      } catch (error) {
        logger.error('Failed to delete translate language:', error as Error)
        throw error
      }
    })

    logger.info('TranslateService IPC handlers registered')
  }
}

export const translateService = TranslateService.getInstance()
