# Main Process Services Knowledge Base

**Generated:** 2025-03-13
**Commit:** 5eaae1101

## OVERVIEW

47 service files implementing Electron main process backend. Singleton pattern is standard.

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Service initialization | `src/main/index.ts` |
| IPC handlers | `src/main/ipc.ts` (100+ handlers) |
| Channel definitions | `packages/shared/IpcChannel.ts` (400+ channels) |
| Preload bridge | `src/preload/index.ts` |

## SERVICE CATEGORIES

| Category | Services |
|----------|----------|
| **Core** | WindowService, LoggerService, ConfigManager, StoreSyncService |
| **AI/ML** | MCPService, AnthropicService, KnowledgeService, PythonService |
| **Data** | FileStorage, CacheService, BackupManager, WebDav, S3Storage |
| **Network** | ApiServerService, ProxyManager, CopilotService |
| **Agents** | `agents/` subdirectory (Drizzle ORM + LibSQL) |

## SINGLETON PATTERN

```typescript
class MyService {
  private static instance: MyService
  private constructor() { /* init */ }
  public static getInstance(): MyService {
    if (!MyService.instance) MyService.instance = new MyService()
    return MyService.instance
  }
}
export const myService = MyService.getInstance()
```

Used by: LoggerService, WindowService, ConfigManager, StoreSyncService, TrayService, ShortcutService, MCPService, etc. (21 services)

## LOGGING

```typescript
import { loggerService } from '@logger'
const logger = loggerService.withContext('ServiceName')
// NEVER use console.log
```

## IPC HANDLER PATTERNS

**Centralized (ipc.ts):**
```typescript
ipcMain.handle(IpcChannel.Domain_Action, async (_, ...args) => {
  return service.method(...args)
})
```

**Self-registering:**
```typescript
public registerIpcHandler(): void {
  ipcMain.handle(IpcChannel.StoreSync_Subscribe, (event) => { ... })
}
```

## INITIALIZATION ORDER

1. LoggerService → ConfigManager
2. WindowService.createMainWindow()
3. new TrayService() → AppMenuService.setupApplicationMenu()
4. nodeTraceService.init() → powerMonitorService.init()
5. registerShortcuts() → registerIpc()
6. localTransferService.startDiscovery()

## SUBSYSTEM DIRECTORIES

| Directory | Purpose |
|-----------|---------|
| `agents/` | Drizzle ORM + LibSQL (SQLite) for agents |
| `mcp/` | MCP OAuth, server log buffer |
| `memory/` | Memory service |
| `ocr/` | OCR providers (Tesseract, PPOCR, OV, System) |
| `lanTransfer/` | LAN file transfer client |
| `remotefile/` | Remote file services (Gemini, Mistral, OpenAI) |

## V2 BLOCKED FILES

These files have feature changes blocked until v2.0.0:
- `ConfigManager.ts`, `StoreSyncService.ts`, `ShortcutService.ts`
- `SelectionService.ts`, `CacheService.ts`, `BackupManager.ts`
- Several `agents/` files

Look for header:
```typescript
/**
 * @deprecated Scheduled for removal in v2.0.0
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING
 */
```

## SERVICE DEPENDENCIES

```
WindowService ← TrayService, ShortcutService, SelectionService
ConfigManager ← StoreSyncService, most services
MCPService ← CacheService, WindowService
```
