/**
 * BrainstormContext - 头脑风暴状态管理
 * 使用 React Context + useReducer，完全独立于 Redux Store
 */

import type { FC, ReactNode } from 'react'
import { createContext, use, useCallback, useMemo, useReducer } from 'react'

import type {
  BrainstormSession,
  BrainstormState,
  CreateSessionParams,
  DiscussionEngineConfig,
  DiscussionMessage,
  DiscussionStatus
} from '../types'
import { generateId } from '../utils/idGenerator'

// 默认配置
const DEFAULT_CONFIG: DiscussionEngineConfig = {
  maxRounds: 3,
  autoMode: true,
  delayBetweenMessages: 1000
}

// 初始状态
const initialState: BrainstormState = {
  sessions: [],
  currentSessionId: null,
  isRunning: false,
  config: DEFAULT_CONFIG
}

// Reducer
function brainstormReducer(state: BrainstormState, action: any): BrainstormState {
  switch (action.type) {
    case 'CREATE_SESSION': {
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
        currentSessionId: action.payload.id
      }
    }

    case 'DELETE_SESSION': {
      const filtered = state.sessions.filter((s) => s.id !== action.payload)
      return {
        ...state,
        sessions: filtered,
        currentSessionId: state.currentSessionId === action.payload ? filtered[0]?.id || null : state.currentSessionId
      }
    }

    case 'SET_CURRENT_SESSION': {
      return {
        ...state,
        currentSessionId: action.payload
      }
    }

    case 'ADD_MESSAGE': {
      const { sessionId, message } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) => {
          if (session.id !== sessionId) return session

          // 检查消息是否已存在，避免重复添加
          const messageExists = session.messages.some((msg) => msg.id === message.id)
          if (messageExists) {
            return session
          }

          return {
            ...session,
            messages: [...session.messages, message],
            updatedAt: Date.now()
          }
        })
      }
    }

    case 'UPDATE_MESSAGE': {
      const { sessionId, messageId, content } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)),
                updatedAt: Date.now()
              }
            : session
        )
      }
    }

    case 'APPEND_MESSAGE_CONTENT': {
      const { sessionId, messageId, chunk } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg
                ),
                updatedAt: Date.now()
              }
            : session
        )
      }
    }

    case 'UPDATE_STATUS': {
      const { sessionId, status } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId ? { ...session, status, updatedAt: Date.now() } : session
        )
      }
    }

    case 'SET_DECISION': {
      const { sessionId, decision } = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                finalDecision: decision,
                status: 'decided' as DiscussionStatus,
                updatedAt: Date.now()
              }
            : session
        )
      }
    }

    case 'SET_IS_RUNNING': {
      return {
        ...state,
        isRunning: action.payload
      }
    }

    case 'UPDATE_SESSION': {
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.payload.id ? { ...session, ...action.payload, updatedAt: Date.now() } : session
        )
      }
    }

    case 'INCREMENT_ROUND': {
      const sessionId = action.payload
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, currentRound: session.currentRound + 1, updatedAt: Date.now() }
            : session
        )
      }
    }

    case 'LOAD_SESSIONS': {
      return {
        ...state,
        sessions: action.payload
      }
    }

    case 'UPDATE_CONFIG': {
      return {
        ...state,
        config: { ...state.config, ...action.payload }
      }
    }

    default:
      return state
  }
}

// Context 类型
interface BrainstormContextType {
  state: BrainstormState
  dispatch: React.Dispatch<any>
  // 便捷方法
  createSession: (params: CreateSessionParams) => BrainstormSession
  deleteSession: (sessionId: string) => void
  setCurrentSession: (sessionId: string | null) => void
  addMessage: (sessionId: string, message: DiscussionMessage) => void
  updateMessage: (sessionId: string, messageId: string, content: string) => void
  appendMessageContent: (sessionId: string, messageId: string, chunk: string) => void
  updateStatus: (sessionId: string, status: DiscussionStatus) => void
  setDecision: (sessionId: string, decision: string) => void
  setIsRunning: (isRunning: boolean) => void
  incrementRound: (sessionId: string) => void
  updateConfig: (config: Partial<DiscussionEngineConfig>) => void
  // 计算属性
  currentSession: BrainstormSession | null
}

const BrainstormContext = createContext<BrainstormContextType | null>(null)

// Provider
export const BrainstormProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(brainstormReducer, initialState)

  // 计算当前会话
  const currentSession = useMemo(() => {
    if (!state.currentSessionId) return null
    return state.sessions.find((s) => s.id === state.currentSessionId) || null
  }, [state.sessions, state.currentSessionId])

  // 便捷方法
  const createSession = useCallback(
    (params: CreateSessionParams): BrainstormSession => {
      const session: BrainstormSession = {
        id: generateId(),
        title: params.title,
        problem: params.problem,
        roles: params.roles.map((role, index) => ({
          ...role,
          id: generateId(),
          order: index
        })),
        messages: [],
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        maxRounds: params.maxRounds || state.config.maxRounds,
        currentRound: 0
      }

      dispatch({ type: 'CREATE_SESSION', payload: session })
      return session
    },
    [state.config.maxRounds]
  )

  const deleteSession = useCallback((sessionId: string) => {
    dispatch({ type: 'DELETE_SESSION', payload: sessionId })
  }, [])

  const setCurrentSession = useCallback((sessionId: string | null) => {
    dispatch({ type: 'SET_CURRENT_SESSION', payload: sessionId })
  }, [])

  const addMessage = useCallback((sessionId: string, message: DiscussionMessage) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { sessionId, message } })
  }, [])

  const updateMessage = useCallback((sessionId: string, messageId: string, content: string) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { sessionId, messageId, content } })
  }, [])

  const appendMessageContent = useCallback((sessionId: string, messageId: string, chunk: string) => {
    dispatch({ type: 'APPEND_MESSAGE_CONTENT', payload: { sessionId, messageId, chunk } })
  }, [])

  const updateStatus = useCallback((sessionId: string, status: DiscussionStatus) => {
    dispatch({ type: 'UPDATE_STATUS', payload: { sessionId, status } })
  }, [])

  const setDecision = useCallback((sessionId: string, decision: string) => {
    dispatch({ type: 'SET_DECISION', payload: { sessionId, decision } })
  }, [])

  const setIsRunning = useCallback((isRunning: boolean) => {
    dispatch({ type: 'SET_IS_RUNNING', payload: isRunning })
  }, [])

  const incrementRound = useCallback((sessionId: string) => {
    dispatch({ type: 'INCREMENT_ROUND', payload: sessionId })
  }, [])

  const updateConfig = useCallback((config: Partial<DiscussionEngineConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: config })
  }, [])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      createSession,
      deleteSession,
      setCurrentSession,
      addMessage,
      updateMessage,
      appendMessageContent,
      updateStatus,
      setDecision,
      setIsRunning,
      incrementRound,
      updateConfig,
      currentSession
    }),
    [
      state,
      dispatch,
      createSession,
      deleteSession,
      setCurrentSession,
      addMessage,
      updateMessage,
      appendMessageContent,
      updateStatus,
      setDecision,
      setIsRunning,
      incrementRound,
      updateConfig,
      currentSession
    ]
  )

  return <BrainstormContext value={value}>{children}</BrainstormContext>
}

// Hook
export function useBrainstorm() {
  const context = use(BrainstormContext)
  if (!context) {
    throw new Error('useBrainstorm must be used within a BrainstormProvider')
  }
  return context
}
