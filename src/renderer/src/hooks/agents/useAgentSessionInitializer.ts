import { loggerService } from '@logger'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useAppDispatch } from '@renderer/store'
import { setActiveSessionIdAction, setActiveTopicOrSessionAction } from '@renderer/store/runtime'
import type { CreateSessionForm } from '@renderer/types'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useAgentClient } from './useAgentClient'

const logger = loggerService.withContext('useAgentSessionInitializer')

/**
 * Hook to automatically initialize and load the latest session for an agent
 * when the agent is activated. This ensures that when switching to an agent,
 * its most recent session is automatically selected.
 */
export const useAgentSessionInitializer = () => {
  const dispatch = useAppDispatch()
  const client = useAgentClient()
  const { chat } = useRuntime()
  const { activeAgentId, activeSessionIdMap } = chat
  const { t } = useTranslation()

  /**
   * Initialize session for the given agent by loading its sessions
   * and setting the latest one as active
   */
  const initializeAgentSession = useCallback(
    async (agentId: string) => {
      if (!agentId) return

      try {
        // Check if this agent already has an active session
        const currentSessionId = activeSessionIdMap[agentId]
        if (currentSessionId) {
          // Session already exists, just switch to session view
          dispatch(setActiveTopicOrSessionAction('session'))
          return
        }

        // Load sessions for this agent
        const response = await client.listSessions(agentId)
        const sessions = response.data

        if (sessions && sessions.length > 0) {
          // Get the latest session (first in the list, assuming they're sorted by updatedAt)
          const latestSession = sessions[0]

          // Set the latest session as active
          dispatch(setActiveSessionIdAction({ agentId, sessionId: latestSession.id }))
          dispatch(setActiveTopicOrSessionAction('session'))
        } else {
          // No sessions exist, create a default one
          logger.info('No sessions found, creating default session', { agentId })

          // We need agent data to create a session
          const agent = await client.getAgent(agentId)

          const sessionForm = {
            ...agent,
            id: undefined,
            name: t('common.unnamed')
          } satisfies CreateSessionForm

          const created = await client.createSession(agentId, sessionForm)

          if (created) {
            dispatch(setActiveSessionIdAction({ agentId, sessionId: created.id }))
            dispatch(setActiveTopicOrSessionAction('session'))
          }
        }
      } catch (error) {
        logger.error('Failed to initialize agent session:', error as Error)
        // Even if loading fails, switch to session view
        dispatch(setActiveTopicOrSessionAction('session'))
      }
    },
    [client, dispatch, activeSessionIdMap, t]
  )

  /**
   * Auto-initialize when activeAgentId changes
   */
  useEffect(() => {
    if (activeAgentId) {
      // Check if we need to initialize this agent's session
      const hasActiveSession = activeSessionIdMap[activeAgentId]
      if (!hasActiveSession) {
        initializeAgentSession(activeAgentId)
      }
    }
  }, [activeAgentId, activeSessionIdMap, initializeAgentSession])

  return {
    initializeAgentSession
  }
}
