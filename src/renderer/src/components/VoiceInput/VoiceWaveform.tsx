import React from 'react'
import styled, { keyframes } from 'styled-components'

interface VoiceWaveformProps {
  isRecording: boolean
  isProcessing?: boolean
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

const processing = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
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
  border: 2px solid #f0f0f0;
  border-top-color: #ff6b6b;
  border-radius: 50%;
  animation: ${processing} 0.8s linear infinite;
`

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ isRecording, isProcessing }) => {
  if (isProcessing) {
    return (
      <WaveformContainer>
        <ProcessingSpinner />
      </WaveformContainer>
    )
  }

  if (!isRecording) {
    return null
  }

  // Generate bars with different heights and delays for wave effect
  const bars = [
    { height: 12, delay: 0 },
    { height: 20, delay: 0.1 },
    { height: 28, delay: 0.2 },
    { height: 20, delay: 0.3 },
    { height: 12, delay: 0.4 }
  ]

  return (
    <WaveformContainer>
      {bars.map((bar, index) => (
        <Bar key={index} $delay={bar.delay} $height={bar.height} />
      ))}
    </WaveformContainer>
  )
}

export default VoiceWaveform
