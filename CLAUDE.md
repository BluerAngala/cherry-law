# Cherry Law AI 助手指南

Cherry Law 是基于 Cherry Studio 二次开发的专业法律业务场景 AI 助手。本指南为 AI 编程助手提供核心规范、架构及开发流程指导。

## 1. 核心指导原则 (必须遵守)

- **先提议后执行**：在做出任何更改前，明确计划并等待用户批准。
- **匹配项目风格**：复用现有模式、命名和约定。
- **集中日志与追踪**：通过 `loggerService` 记录日志，严禁使用 `console.log`。
- **规范提交**：使用规范提交消息（如 `feat:`, `fix:`, `refactor:`, `docs:`）并签署提交 (`--signoff`)。
- **交付标准**：仅在成功运行 `pnpm lint`, `pnpm test`, `pnpm format` 后，任务才算完成。

## 2. 开发流程 (Workflows)

- **GitHub 管理**：使用 `gh-create-pr` 和 `gh-create-issue` 技能。
- **PR 评审**：优先通过 `gh pr checks <PR_NUMBER>` 和 `gh run view <RUN_ID> --log-failed` 调查失败，不建议在本地重新运行 CI 检查。

## 3. 关键编码规范 (Conventions)

### TypeScript & 风格

- **严格模式**：使用 `tsgo` 进行类型检查。
- **格式化/Lint**：由 Biome 处理格式化（2 空格，单引号），oxlint + ESLint 处理 Lint。
- **别名映射**：`@main` (src/main/), `@renderer` (src/renderer/src/), `@shared` (packages/shared/), `@logger` (LoggerService)。

### i18n (多语言)

- **强制前缀**：智能体（Agent）相关功能的 key **必须** 以 `agent.` 开头（如 `agent.guide.title`）。
- **工具使用**：运行 `pnpm i18n:check` 验证，`pnpm i18n:sync` 同步缺失键。
- **严禁硬编码**：所有用户可见字符串必须使用 `i18next`。

### UI & 样式

- **Ant Design 5 + TailwindCSS v4**：
  - Tailwind 变量语法：`text-(--color-text)`, `bg-(--color-background)`。
- **Styled-components**：复杂组件扩展，对非 DOM 属性使用瞬时属性 (`$color`)。
- **组件限制**：严禁直接使用 `useSelector`/`useDispatch`，必须使用 `@renderer/hooks/` 中的自定义 hooks。

## 4. 项目架构概览

### 核心包 (`packages/`)

- `aiCore`: AI SDK 提供者抽象，基于 Vercel AI SDK v5。
- `shared`: 跨进程类型、常量、IPC 通道定义。
- `mcp-trace`: MCP 操作追踪核心。

### 核心进程与服务

- **主进程 (`src/main/`)**: 窗口管理 (`WindowService`), MCP 服务 (`MCPService`), 知识库 (`KnowledgeService`), 结构化日志 (`LoggerService`), 数据同步 (`StoreSyncService`)。
- **渲染进程 (`src/renderer/src/`)**: React 19 SPA, 包含页面、Hooks、Store 及多窗口入口。

## 5. 测试与安全

- **测试框架**：使用 Vitest 3。
  - `pnpm test:main` (主进程), `pnpm test:renderer` (渲染进程)。
- **安全准则**：
  - 严禁向渲染进程暴露 Node.js API，必须通过 `preload` 的 `contextBridge`。
  - 在主进程处理器中验证所有 IPC 输入。
  - 使用 `strict-url-sanitise` 清洗所有 URL。

## 6. 开发命令速查

- **环境准备**：`pnpm install` (Node ≥22, pnpm 10.27.0)
- **开发/构建**：`pnpm dev` (开发), `pnpm build` (完整构建)
- **质量检查**：`pnpm build:check` (lint + test), `pnpm lint`, `pnpm format`
- **Agents DB**：`pnpm agents:generate`, `pnpm agents:push`, `pnpm agents:studio`
