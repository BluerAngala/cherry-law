import type { FileMetadata, FileType } from '@renderer/types'
import { FILE_TYPE } from '@renderer/types'
import { audioExts, documentExts, GB, imageExts, KB, MB, textExts, videoExts } from '@shared/config/constant'

// Simple MIME type to extension mapping for browser environment
// This replaces the mime-types library which requires Node.js path module
const mimeToExtMap: Record<string, string> = {
  // Text
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/typescript': 'ts',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'text/xml': 'xml',
  'text/yaml': 'yaml',
  'text/json': 'json',
  // Images
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/x-icon': 'ico',
  // Videos
  'video/mp4': 'mp4',
  'video/avi': 'avi',
  'video/quicktime': 'mov',
  'video/x-ms-wmv': 'wmv',
  'video/x-flv': 'flv',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/mpeg': 'mpeg',
  // Audio
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  // Documents
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  // Archives
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'application/gzip': 'gz',
  'application/x-tar': 'tar',
  // Code
  'application/json': 'json',
  'application/xml': 'xml',
  'application/javascript': 'js',
  'application/typescript': 'ts'
}

/**
 * Get file extension from MIME type
 * @param mimeType - MIME type string
 * @returns Extension without dot, or null if not found
 */
function getExtensionFromMime(mimeType: string): string | null {
  return mimeToExtMap[mimeType.toLowerCase()] || null
}

/**
 * 从文件路径中提取目录路径。
 * @param {string} filePath 文件路径
 * @returns {string} 目录路径
 */
export function getFileDirectory(filePath: string): string {
  const parts = filePath.split('/')
  return parts.slice(0, -1).join('/')
}

/**
 * 从文件路径中提取文件扩展名。
 * @param {string} filePath 文件路径
 * @returns {string} 文件扩展名（小写），如果没有则返回 '.'
 */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split('.')
  if (parts.length > 1) {
    const extension = parts.slice(-1)[0].toLowerCase()
    return '.' + extension
  }
  return '.'
}

/**
 * 从文件路径中移除文件扩展名。
 * @param {string} filePath 文件路径
 * @returns {string} 移除扩展名后的文件路径
 */
export function removeFileExtension(filePath: string): string {
  const parts = filePath.split('.')
  if (parts.length > 1) {
    return parts.slice(0, -1).join('.')
  }
  return filePath
}

/**
 * 格式化文件大小，根据大小返回以 MB 或 KB 为单位的字符串。
 * @param {number} size 文件大小（字节）
 * @returns {string} 格式化后的文件大小字符串
 */
export function formatFileSize(size: number): string {
  if (size >= GB) {
    return (size / GB).toFixed(1) + ' GB'
  }

  if (size >= MB) {
    return (size / MB).toFixed(1) + ' MB'
  }

  if (size >= KB) {
    return (size / KB).toFixed(0) + ' KB'
  }

  return (size / KB).toFixed(2) + ' KB'
}

/**
 * 从文件名中移除特殊字符：
 * - 替换非法字符为下划线
 * - 替换换行符为空格。
 * @param {string} str 输入字符串
 * @returns {string} 处理后的文件名字符串
 */
export function removeSpecialCharactersForFileName(str: string): string {
  return str
    .replace(/[<>:"/\\|?*.]/g, '_')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

/**
 * 检查文件是否为支持的类型。
 * 支持的文件类型包括:
 * 1. 文件扩展名在supportExts集合中的文件
 * 2. 文本文件
 * @param {string} filePath 文件路径
 * @param {Set<string>} supportExts 支持的文件扩展名集合
 * @returns {Promise<boolean>} 如果文件类型受支持返回true，否则返回false
 */
export async function isSupportedFile(filePath: string, supportExts: Set<string>): Promise<boolean> {
  try {
    if (supportExts.has(getFileExtension(filePath))) {
      return true
    }

    if (await window.api.file.isTextFile(filePath)) {
      return true
    }

    return false
  } catch (error) {
    return false
  }
}

export async function isTextFile(filePath: string): Promise<boolean> {
  const set = new Set(textExts)
  return isSupportedFile(filePath, set)
}

export async function filterSupportedFiles(files: FileMetadata[], supportExts: string[]): Promise<FileMetadata[]> {
  const extensionSet = new Set(supportExts)
  const validationResults = await Promise.all(
    files.map(async (file) => ({
      file,
      isValid: await isSupportedFile(file.path, extensionSet)
    }))
  )
  return validationResults.filter((result) => result.isValid).map((result) => result.file)
}

export const mime2type = (mimeStr: string): FileType => {
  const mimeType = mimeStr.toLowerCase()
  const ext = getExtensionFromMime(mimeType)
  if (ext) {
    const extWithDot = '.' + ext
    if (textExts.includes(extWithDot)) {
      return FILE_TYPE.TEXT
    } else if (imageExts.includes(extWithDot)) {
      return FILE_TYPE.IMAGE
    } else if (documentExts.includes(extWithDot)) {
      return FILE_TYPE.DOCUMENT
    } else if (audioExts.includes(extWithDot)) {
      return FILE_TYPE.AUDIO
    } else if (videoExts.includes(extWithDot)) {
      return FILE_TYPE.VIDEO
    }
  }
  return FILE_TYPE.OTHER
}

export function parseFileTypes(str: string): FileType | null {
  if (Object.values(FILE_TYPE).some((type) => type === str)) {
    return str as FileType
  }
  return null
}
