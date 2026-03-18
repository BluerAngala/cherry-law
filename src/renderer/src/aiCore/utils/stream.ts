export function isAsyncIterable<T = unknown>(obj: unknown): obj is AsyncIterable<T> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as Record<symbol, unknown>)[Symbol.asyncIterator] === 'function'
  )
}
