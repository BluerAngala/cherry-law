/**
 * 本地日志工具，解决测试环境下的别名依赖问题
 */
export const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  withContext: (context: string) => ({
    info: (...args: any[]) => console.log(`[INFO][${context}]`, ...args),
    error: (...args: any[]) => console.error(`[ERROR][${context}]`, ...args),
    warn: (...args: any[]) => console.warn(`[WARN][${context}]`, ...args),
    debug: (...args: any[]) => console.log(`[DEBUG][${context}]`, ...args)
  })
}
