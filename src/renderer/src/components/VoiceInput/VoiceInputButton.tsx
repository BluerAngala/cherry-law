import { AudioOutlined, LoadingOutlined } from '@ant-design/icons'
import { useSpeechRecognition } from '@renderer/hooks/useSpeechRecognition'
import { Button, Tooltip } from 'antd'
import React, { useCallback } from 'react'
import styled from 'styled-components'

import VoiceWaveform from './VoiceWaveform'

interface VoiceInputButtonProps {
  onResult?: (text: string) => void
  disabled?: boolean
  size?: 'small' | 'middle' | 'large'
}

const ButtonContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const StyledButton = styled(Button)<{ $isRecording: boolean }>`
  ${(props) =>
    props.$isRecording &&
    `
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%) !important;
    border-color: #ff6b6b !important;
    color: white !important;
    
    &:hover {
      background: linear-gradient(135deg, #ff5252 0%, #e0455a 100%) !important;
      border-color: #ff5252 !important;
    }
  `}
`

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onResult, disabled, size = 'middle' }) => {
  const { isRecording, isProcessing, toggleRecording, lastResult, enabled, serverConnected } = useSpeechRecognition()

  // Handle result callback
  React.useEffect(() => {
    if (lastResult && onResult) {
      onResult(lastResult)
    }
  }, [lastResult, onResult])

  const handleClick = useCallback(async () => {
    if (!enabled) {
      return
    }
    await toggleRecording()
  }, [enabled, toggleRecording])

  const getTooltipTitle = () => {
    if (!enabled) {
      return '语音识别未启用，请在设置中开启'
    }
    if (!serverConnected) {
      return '语音服务未连接，请检查服务状态'
    }
    if (isRecording) {
      return '点击停止录音'
    }
    if (isProcessing) {
      return '正在识别中...'
    }
    return '点击开始语音输入'
  }

  const getIcon = () => {
    if (isProcessing) {
      return <LoadingOutlined />
    }
    return <AudioOutlined />
  }

  const isDisabled = disabled || !enabled || !serverConnected

  return (
    <ButtonContainer>
      <VoiceWaveform isRecording={isRecording} isProcessing={isProcessing} />
      <Tooltip title={getTooltipTitle()}>
        <StyledButton
          $isRecording={isRecording}
          icon={getIcon()}
          onClick={handleClick}
          disabled={isDisabled}
          size={size}
          type={isRecording ? 'primary' : 'default'}
        />
      </Tooltip>
    </ButtonContainer>
  )
}

export default VoiceInputButton
