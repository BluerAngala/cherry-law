/**
 * 全局语音录音悬浮组件
 * 显示录音中状态和波形动画
 */
import { AudioOutlined, LoadingOutlined } from '@ant-design/icons'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styled, { keyframes } from 'styled-components'

import { useGlobalSpeech } from '../../hooks/useGlobalSpeech'

interface GlobalSpeechRecorderProps {
  position?: 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right'
}

const pulse = keyframes`
  0%, 100% {
    transform: scaleY(0.5);
    opacity: 0.5;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
`

const recordingPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.4);
  }
  50% {
    box-shadow: 0 0 0 15px rgba(255, 107, 107, 0);
  }
`

const slideIn = keyframes`
  from {
    transform: translate(-50%, -100%);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
`

const Container = styled.div<{ $position: string }>`
  position: fixed;
  ${(props) => {
    switch (props.$position) {
      case 'top-center':
        return `
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
        `
      case 'top-right':
        return `
          top: 80px;
          right: 20px;
        `
      case 'bottom-center':
        return `
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
        `
      case 'bottom-right':
        return `
          bottom: 80px;
          right: 20px;
        `
      default:
        return `
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
        `
    }
  }}
  z-index: 9999;
  animation: ${slideIn} 0.3s ease-out;
`

const RecorderCard = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
`

const IconWrapper = styled.div<{ $isRecording: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) =>
    props.$isRecording
      ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)'
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
  color: white;
  font-size: 20px;
  animation: ${(props) => (props.$isRecording ? recordingPulse : 'none')} 1.5s ease-in-out infinite;
  transition: all 0.3s ease;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 8px;
`

const Subtitle = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
`

const WaveformContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 32px;
  padding: 0 8px;
`

const Bar = styled.div<{ $delay: number; $height: number }>`
  width: 3px;
  height: ${(props) => props.$height}px;
  background: linear-gradient(180deg, #ff6b6b 0%, #ee5a6f 100%);
  border-radius: 2px;
  animation: ${pulse} 0.8s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
  transform-origin: center;
`

const ProcessingSpinner = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`

const Timer = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-family: monospace;
  min-width: 50px;
  text-align: right;
`

const bars = [
  { height: 12, delay: 0 },
  { height: 20, delay: 0.1 },
  { height: 28, delay: 0.2 },
  { height: 20, delay: 0.3 },
  { height: 12, delay: 0.4 }
]

export const GlobalSpeechRecorder: React.FC<GlobalSpeechRecorderProps> = ({ position = 'top-center' }) => {
  const { showRecordingUI, isRecording, isProcessing } = useGlobalSpeech()
  const [recordingTime, setRecordingTime] = useState(0)

  // 录音计时器
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isRecording && showRecordingUI) {
      setRecordingTime(0)
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } else {
      setRecordingTime(0)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isRecording, showRecordingUI])

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!showRecordingUI && !isProcessing) {
    return null
  }

  const content = (
    <Container $position={position}>
      <RecorderCard>
        <IconWrapper $isRecording={isRecording && !isProcessing}>
          {isProcessing ? <LoadingOutlined /> : <AudioOutlined />}
        </IconWrapper>

        <Content>
          <Title>
            {isProcessing ? '正在识别...' : '正在录音'}
            {!isProcessing && <Timer>{formatTime(recordingTime)}</Timer>}
          </Title>
          <Subtitle>{isProcessing ? '请稍候，正在转换语音为文字' : '再次按下快捷键结束录音'}</Subtitle>
        </Content>

        {isRecording && !isProcessing && (
          <WaveformContainer>
            {bars.map((bar, index) => (
              <Bar key={index} $delay={bar.delay} $height={bar.height} />
            ))}
          </WaveformContainer>
        )}

        {isProcessing && <ProcessingSpinner />}
      </RecorderCard>
    </Container>
  )

  return createPortal(content, document.body)
}

export default GlobalSpeechRecorder
