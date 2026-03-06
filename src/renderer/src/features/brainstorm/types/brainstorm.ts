/**
 * 头脑风暴功能类型定义
 * 完全独立，不依赖现有 Redux Store
 */

// 智能体角色定义
export interface AgentRole {
  id: string
  name: string
  avatar?: string
  systemPrompt: string
  modelId: string
  order: number
  isDecisionMaker: boolean
  color?: string
}

// 讨论消息类型
export type MessageType = 'analysis' | 'question' | 'suggestion' | 'decision' | 'summary'

// 讨论消息
export interface DiscussionMessage {
  id: string
  roleId: string
  roleName: string
  roleColor?: string
  content: string
  timestamp: number
  type: MessageType
}

// 讨论状态
export type DiscussionStatus = 'idle' | 'discussing' | 'paused' | 'decided'

// 头脑风暴会话
export interface BrainstormSession {
  id: string
  title: string
  problem: string
  roles: AgentRole[]
  messages: DiscussionMessage[]
  status: DiscussionStatus
  createdAt: number
  updatedAt: number
  finalDecision?: string
  maxRounds?: number
  currentRound: number
}

// 创建会话参数
export interface CreateSessionParams {
  title: string
  problem: string
  roles: Omit<AgentRole, 'id'>[]
  maxRounds?: number
}

// 预设角色模板
export interface RolePreset {
  id: string
  name: string
  description: string
  roles: Omit<AgentRole, 'id'>[]
}

// 讨论引擎配置
export interface DiscussionEngineConfig {
  maxRounds: number
  autoMode: boolean
  delayBetweenMessages: number
}

// 头脑风暴状态
export interface BrainstormState {
  sessions: BrainstormSession[]
  currentSessionId: string | null
  isRunning: boolean
  config: DiscussionEngineConfig
}

// Action 类型
export type BrainstormAction =
  | { type: 'CREATE_SESSION'; payload: BrainstormSession }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_CURRENT_SESSION'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: DiscussionMessage } }
  | { type: 'UPDATE_STATUS'; payload: { sessionId: string; status: DiscussionStatus } }
  | { type: 'SET_DECISION'; payload: { sessionId: string; decision: string } }
  | { type: 'SET_IS_RUNNING'; payload: boolean }
  | { type: 'UPDATE_SESSION'; payload: BrainstormSession }
  | { type: 'INCREMENT_ROUND'; payload: string }
  | { type: 'LOAD_SESSIONS'; payload: BrainstormSession[] }
  | { type: 'UPDATE_CONFIG'; payload: Partial<DiscussionEngineConfig> }
