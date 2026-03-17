# AI Core Services Knowledge Base

**Generated:** 2026-03-17
**Commit:** 5eaae1101

## OVERVIEW

AI SDK abstraction layer built on Vercel AI SDK v5 with plugin system and multi-provider support.

## STRUCTURE

```
src/
├── core/
│   ├── middleware/    # LanguageModelV2Middleware wrapper
│   ├── models/        # Model resolution (isV2Model, isV3Model)
│   ├── options/       # Provider options helpers
│   ├── plugins/       # Plugin system + built-in plugins
│   │   └── built-in/  # webSearch, toolUse, logging, googleTools
│   ├── providers/     # Registry, factory, HubProvider, schemas
│   └── runtime/       # Executor, PluginEngine
└── index.ts           # Public API
```

## PUBLIC API

```typescript
// Runtime
export { createExecutor, createOpenAICompatibleExecutor, generateImage, generateText, streamText }

// Models
export { isV2Model, isV3Model, modelResolver }

// Plugins
export { definePlugin, PluginManager, createContext }
export type { AiPlugin, AiRequestContext, HookResult }

// Options
export { createAnthropicOptions, createGoogleOptions, createOpenAIOptions, mergeProviderOptions }

// Errors
export { AiCoreError, ModelResolutionError, PluginExecutionError, ProviderConfigError }
```

## ADDING PROVIDERS

1. Add schema in `core/providers/schemas.ts`
2. Register via `registerProviderConfig({ id, name, creator })`
3. Creator receives config, returns AI SDK provider instance

## ADDING PLUGINS

```typescript
import { definePlugin } from '@cherrystudio/ai-core'

export const myPlugin = definePlugin({
  name: 'my-plugin',
  enforce: 'pre', // 'pre' | 'post' | undefined
  
  // Hook types: First, Sequential, Parallel, Stream
  transformParams: async (params, context) => params,
  transformResult: async (result, context) => result,
  onRequestStart: async (context) => { /* parallel */ },
  onError: async (context, error) => { /* error handling */ }
})
```

## BUILD & TEST

```bash
pnpm build          # tsdown → dist/ (ESM + CJS)
pnpm test           # Vitest
pnpm typecheck      # tsc
```

## CONVENTIONS

- Path alias: `@` → `./src`
- Test files: `__tests__/` alongside source
- Zod for runtime validation in schemas.ts
- Bilingual JSDoc (Chinese/English) in complex logic

## PLUGIN HOOKS

| Type | Execution | Use For |
|------|-----------|---------|
| First | Sequential, short-circuit | `resolveModel`, `loadTemplate` |
| Sequential | Chain transformation | `transformParams`, `transformResult` |
| Parallel | Concurrent | `onRequestStart`, `onRequestEnd`, `onError` |
| Stream | Transform stream | `transformStream` (AI SDK native) |

## PEER DEPENDENCIES

Consumers must install: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`
