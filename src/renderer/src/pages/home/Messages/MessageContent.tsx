import { getModelUniqId } from '@renderer/services/ModelService'
import type { MentionedAssistant, Message } from '@renderer/types/newMessage'
import { Flex } from 'antd'
import { first, isEmpty } from 'lodash'
import React from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import MessageBlockRenderer from './Blocks'
interface Props {
  message: Message
}

const MessageContent: React.FC<Props> = ({ message }) => {
  const isAssistantMessage = message.role === 'assistant'
  const mentionedAssistants = message.mentionedAssistants
  const hasMentionedAssistants = !isEmpty(mentionedAssistants)

  return (
    <>
      {!isEmpty(message.mentions) && (
        <Flex gap="8px" wrap style={{ marginBottom: '10px' }}>
          {message.mentions?.map((model) => (
            <MentionTag key={getModelUniqId(model)}>{'@' + model.name}</MentionTag>
          ))}
        </Flex>
      )}
      {isAssistantMessage && hasMentionedAssistants && (
        <AssistantInfoBar assistant={mentionedAssistants![0]} position="start" />
      )}
      <MessageBlockRenderer blocks={message.blocks} message={message} />
      {isAssistantMessage && hasMentionedAssistants && (
        <AssistantInfoBar assistant={mentionedAssistants![0]} position="end" />
      )}
    </>
  )
}

const AssistantInfoBar: React.FC<{
  assistant: MentionedAssistant
  position: 'start' | 'end'
}> = ({ assistant, position }) => {
  const { t } = useTranslation()

  return (
    <AssistantInfoContainer $position={position}>
      <AssistantIcon>{assistant.emoji || first(assistant.name)}</AssistantIcon>
      <AssistantName>{assistant.name}</AssistantName>
      <AssistantLabel>
        {position === 'start' ? t('chat.assistant.reply_start') : t('chat.assistant.reply_end')}
      </AssistantLabel>
    </AssistantInfoContainer>
  )
}

const MentionTag = styled.span`
  color: var(--color-link);
`

const AssistantInfoContainer = styled.div<{ $position: 'start' | 'end' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin: ${(props) => (props.$position === 'start' ? '0 0 12px 0' : '12px 0 0 0')};
  background: var(--color-background-soft);
  border-radius: 6px;
  border-left: 3px solid var(--color-primary);
  font-size: 13px;
  color: var(--color-text-2);
`

const AssistantIcon = styled.span`
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-background);
  border-radius: 4px;
`

const AssistantName = styled.span`
  font-weight: 500;
  color: var(--color-text-1);
`

const AssistantLabel = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
  margin-left: auto;
`

// const SearchingText = styled.div`
//   font-size: 14px;
//   line-height: 1.6;
//   text-decoration: none;
//   color: var(--color-text-1);
// `

export default React.memo(MessageContent)
