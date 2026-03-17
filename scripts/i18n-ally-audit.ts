import fs from 'fs'
import path from 'path'

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
interface JsonObject {
  [key: string]: JsonValue
}
interface JsonArray extends Array<JsonValue> {}

type DuplicateInfo = {
  path: string
  key: string
  line: number
  column: number
}

type LocaleAuditResult = {
  filePath: string
  sorted: boolean
  duplicates: DuplicateInfo[]
  updated: boolean
}

const rootDir = path.resolve(__dirname, '..')
const localesDir = path.join(rootDir, 'src/renderer/src/i18n/locales')
const translateDir = path.join(rootDir, 'src/renderer/src/i18n/translate')
const sourceDir = path.join(rootDir, 'src/renderer/src')
const baseLocaleFile = path.join(localesDir, 'en-us.json')

function lexicalSort(a: string, b: string): number {
  if (a > b) return 1
  if (a < b) return -1
  return 0
}

function sortedObjectByKeys<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortedObjectByKeys(item)) as T
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const sortedEntries = Object.entries(value).sort(([a], [b]) => lexicalSort(a, b))
  const sorted: JsonObject = {}
  for (const [key, child] of sortedEntries) {
    sorted[key] = sortedObjectByKeys(child)
  }
  return sorted as T
}

function computeLineColumn(text: string, index: number) {
  let line = 1
  let column = 1
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line += 1
      column = 1
      continue
    }
    column += 1
  }
  return { line, column }
}

function detectDuplicateKeys(text: string): DuplicateInfo[] {
  const duplicates: DuplicateInfo[] = []
  const stack: Array<{ type: 'object' | 'array'; keys?: Set<string>; path: string[] }> = []
  let i = 0

  const skipWhitespace = () => {
    while (i < text.length && /\s/.test(text[i])) {
      i += 1
    }
  }

  const parseString = () => {
    const start = i
    i += 1
    let value = ''
    while (i < text.length) {
      const ch = text[i]
      if (ch === '\\') {
        const next = text[i + 1]
        if (next === undefined) break
        value += ch + next
        i += 2
        continue
      }
      if (ch === '"') {
        i += 1
        return { value, end: i, start }
      }
      value += ch
      i += 1
    }
    return { value, end: i, start }
  }

  while (i < text.length) {
    skipWhitespace()
    const ch = text[i]
    if (!ch) break

    if (ch === '{') {
      const parent = stack[stack.length - 1]
      const nextPath = parent?.path ? [...parent.path] : []
      stack.push({ type: 'object', keys: new Set<string>(), path: nextPath })
      i += 1
      continue
    }

    if (ch === '[') {
      const parent = stack[stack.length - 1]
      const nextPath = parent?.path ? [...parent.path] : []
      stack.push({ type: 'array', path: nextPath })
      i += 1
      continue
    }

    if (ch === '}' || ch === ']') {
      stack.pop()
      i += 1
      continue
    }

    if (ch === '"') {
      const parsed = parseString()
      skipWhitespace()
      const current = stack[stack.length - 1]
      if (current?.type === 'object' && text[i] === ':') {
        const key = JSON.parse(`"${parsed.value}"`) as string
        if (current.keys?.has(key)) {
          const location = computeLineColumn(text, parsed.start)
          duplicates.push({
            path: current.path.length > 0 ? current.path.join('.') : '(root)',
            key,
            line: location.line,
            column: location.column
          })
        } else {
          current.keys?.add(key)
        }
        current.path = [...current.path.slice(0, -1), key]
      }
      continue
    }

    if (ch === ',') {
      const current = stack[stack.length - 1]
      if (current?.path.length) {
        current.path = current.path.slice(0, -1)
      }
      i += 1
      continue
    }

    i += 1
  }

  return duplicates
}

function flattenLeafKeys(obj: JsonObject, parent = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = parent ? `${parent}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const childKeys = flattenLeafKeys(value as JsonObject, fullKey)
      for (const childKey of childKeys) keys.add(childKey)
      continue
    }
    keys.add(fullKey)
  }
  return keys
}

function getLocaleFiles(): string[] {
  const dirs = [localesDir, translateDir]
  const files: string[] = []
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const jsonFiles = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(dir, file))
    files.push(...jsonFiles)
  }
  return files
}

function auditAndFixLocale(filePath: string, shouldFix: boolean): LocaleAuditResult {
  const original = fs.readFileSync(filePath, 'utf-8')
  const duplicates = detectDuplicateKeys(original)
  const parsed = JSON.parse(original) as JsonObject
  const sorted = sortedObjectByKeys(parsed)
  const isSorted = JSON.stringify(parsed) === JSON.stringify(sorted)
  const nextContent = `${JSON.stringify(sorted, null, 2)}\n`
  const shouldWrite = shouldFix && (!isSorted || duplicates.length > 0 || original !== nextContent)
  if (shouldWrite) {
    fs.writeFileSync(filePath, nextContent, 'utf-8')
  }
  return {
    filePath,
    sorted: isSorted,
    duplicates,
    updated: shouldWrite
  }
}

function gatherSourceFiles(dir: string): string[] {
  const result: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entryPath.includes(`${path.sep}i18n${path.sep}`) || entryPath.includes(`${path.sep}dist${path.sep}`)) {
        continue
      }
      result.push(...gatherSourceFiles(entryPath))
      continue
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
    result.push(entryPath)
  }
  return result
}

function collectUsedI18nKeys(): Set<string> {
  const files = gatherSourceFiles(sourceDir)
  const keys = new Set<string>()
  const patterns = [
    /\bt\s*\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g,
    /\bi18n\.t\s*\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g,
    /\bi18nKey\s*=\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g
  ]
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8')
    for (const pattern of patterns) {
      let match: RegExpExecArray | null = pattern.exec(content)
      while (match) {
        keys.add(match[1])
        match = pattern.exec(content)
      }
      pattern.lastIndex = 0
    }
  }
  return keys
}

function printLocaleIssues(result: LocaleAuditResult) {
  const relative = path.relative(rootDir, result.filePath).replaceAll('\\', '/')
  if (!result.sorted) {
    console.log(`UNSORTED ${relative}`)
  }
  for (const duplicate of result.duplicates) {
    console.log(
      `DUPLICATE ${relative}:${duplicate.line}:${duplicate.column} key="${duplicate.key}" path="${duplicate.path}"`
    )
  }
  if (result.updated) {
    console.log(`FIXED ${relative}`)
  }
}

function main() {
  const args = new Set(process.argv.slice(2))
  const shouldFix = args.has('--fix')
  const strictKeys = args.has('--strict-keys')

  if (!fs.existsSync(baseLocaleFile)) {
    throw new Error(`Base locale file not found: ${baseLocaleFile}`)
  }

  const localeFiles = getLocaleFiles()
  const localeResults = localeFiles.map((filePath) => auditAndFixLocale(filePath, shouldFix))

  for (const result of localeResults) {
    printLocaleIssues(result)
  }

  const baseJson = JSON.parse(fs.readFileSync(baseLocaleFile, 'utf-8')) as JsonObject
  const baseLeafKeys = flattenLeafKeys(baseJson)
  const usedKeys = collectUsedI18nKeys()
  const missingKeys = [...usedKeys].filter((key) => !baseLeafKeys.has(key)).sort(lexicalSort)
  const unusedKeys = [...baseLeafKeys].filter((key) => !usedKeys.has(key)).sort(lexicalSort)

  for (const key of missingKeys) {
    console.log(`MISSING_KEY ${key}`)
  }
  for (const key of unusedKeys) {
    console.log(`UNUSED_KEY ${key}`)
  }

  const hasBlockingIssue = localeResults.some((item) => !item.sorted || item.duplicates.length > 0)
  if (hasBlockingIssue && !shouldFix) {
    process.exitCode = 1
    return
  }

  if (strictKeys && missingKeys.length > 0) {
    process.exitCode = 1
    return
  }

  console.log(
    `I18N_AUDIT_OK locales=${localeResults.length} missing=${missingKeys.length} unused=${unusedKeys.length} fix=${shouldFix} strictKeys=${strictKeys}`
  )
}

main()
