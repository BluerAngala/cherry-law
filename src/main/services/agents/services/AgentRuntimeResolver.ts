import { loggerService } from '@logger'
import { getProviderAnthropicModelChecker, validateModelId } from '@main/apiServer/utils'
import type { GetAgentSessionResponse } from '@types'

import type { AgentServiceInterface } from '../interfaces/AgentStreamInterface'
import AiCoreAgentService from './AiCoreAgentService'
import ClaudeCodeService from './claudecode'
import OpenCodeService from './opencode'

const logger = loggerService.withContext('AgentRuntimeResolver')

const aiCoreAgentService = AiCoreAgentService.getInstance()
const openCodeService = new OpenCodeService()
const claudeCodeService = new ClaudeCodeService()

const shouldUseClaudeCodeRuntime = async (session: GetAgentSessionResponse): Promise<boolean> => {
  const modelValidation = await validateModelId(session.model)
  if (!modelValidation.valid || !modelValidation.provider || !modelValidation.modelId) {
    logger.warn('Unable to validate model for Claude Code runtime resolution, falling back to AI Core', {
      sessionId: session.id,
      agentType: session.agent_type,
      model: session.model,
      error: modelValidation.error
    })
    return false
  }

  const { provider, modelId } = modelValidation
  if (provider.type === 'anthropic') {
    return true
  }

  if (!provider.anthropicApiHost?.trim()) {
    return false
  }

  const model = provider.models?.find((item) => item.id === modelId)
  if (!model) {
    return false
  }

  const checker = getProviderAnthropicModelChecker(provider.id)
  return checker(model)
}

export const resolveAgentRuntime = async (session: GetAgentSessionResponse): Promise<AgentServiceInterface> => {
  if (session.agent_type === 'opencode') {
    logger.debug('Resolved agent runtime to OpenCode', {
      sessionId: session.id,
      agentType: session.agent_type,
      model: session.model
    })
    return openCodeService
  }

  if (session.agent_type === 'cherry' && (await shouldUseClaudeCodeRuntime(session))) {
    logger.debug('Resolved agent runtime to Claude Code', {
      sessionId: session.id,
      agentType: session.agent_type,
      model: session.model
    })
    return claudeCodeService
  }

  logger.debug('Resolved agent runtime to AI Core', {
    sessionId: session.id,
    agentType: session.agent_type,
    model: session.model
  })
  return aiCoreAgentService
}
