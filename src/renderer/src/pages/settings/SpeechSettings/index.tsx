import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSpeechRecognition } from '@renderer/hooks/useSpeechRecognition'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setEnabled, setServerConnected } from '@renderer/store/speech'
import { Alert, Button, Card, Input, Space, Switch, Typography } from 'antd'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const { Title, Text } = Typography

const Container = styled.div`
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
`

const StyledCard = styled(Card)`
  margin-bottom: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

const StatusIndicator = styled.div<{ $connected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${(props) => (props.$connected ? '#52c41a' : '#ff4d4f')};
  font-weight: 500;
`

const ConfigRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
`

const ConfigLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ConfigTitle = styled(Text)`
  font-weight: 500;
  font-size: 14px;
`

const ConfigDescription = styled(Text)`
  font-size: 12px;
  color: #8c8c8c;
`

const SpeechSettings: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { enabled, serverConnected, recordingState, error } = useAppSelector((state) => state.speech)
  const { checkServerHealth, updateConfig } = useSpeechRecognition()

  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:8000')
  const [isChecking, setIsChecking] = useState(false)

  // Check server health on mount
  useEffect(() => {
    checkServerHealth()
  }, [checkServerHealth])

  const handleToggleEnabled = async (checked: boolean) => {
    await updateConfig({ enabled: checked })
    dispatch(setEnabled(checked))
  }

  const handleCheckHealth = async () => {
    setIsChecking(true)
    try {
      const result = await checkServerHealth()
      dispatch(setServerConnected(result.connected))
    } finally {
      setIsChecking(false)
    }
  }

  const handleUpdateServerUrl = async () => {
    await updateConfig({ serverUrl })
    await handleCheckHealth()
  }

  const getRecordingStatusText = () => {
    switch (recordingState) {
      case 'idle':
        return t('speech.status.idle')
      case 'recording':
        return t('speech.status.recording')
      case 'processing':
        return t('speech.status.processing')
      default:
        return t('speech.status.unknown')
    }
  }

  return (
    <Container>
      <Title level={3}>{t('speech.title')}</Title>
      <Text type="secondary">{t('speech.description')}</Text>

      {error && (
        <Alert
          message={t('speech.error.title')}
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginTop: 16, marginBottom: 16 }}
        />
      )}

      <StyledCard title={t('speech.status.title')}>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.status.server_connection')}</ConfigTitle>
            <ConfigDescription>{t('speech.status.server_description')}</ConfigDescription>
          </ConfigLabel>
          <StatusIndicator $connected={serverConnected}>
            {serverConnected ? (
              <>
                <CheckCircleOutlined />
                <span>{t('speech.status.connected')}</span>
              </>
            ) : (
              <>
                <CloseCircleOutlined />
                <span>{t('speech.status.disconnected')}</span>
              </>
            )}
          </StatusIndicator>
        </ConfigRow>

        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.status.recording_status')}</ConfigTitle>
            <ConfigDescription>{t('speech.status.recording_description')}</ConfigDescription>
          </ConfigLabel>
          <Text>{getRecordingStatusText()}</Text>
        </ConfigRow>

        <ConfigRow>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleCheckHealth} loading={isChecking} type="primary">
              {t('speech.status.check_connection')}
            </Button>
          </Space>
        </ConfigRow>
      </StyledCard>

      <StyledCard title={t('speech.general.title')}>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.general.enable')}</ConfigTitle>
            <ConfigDescription>{t('speech.general.enable_description')}</ConfigDescription>
          </ConfigLabel>
          <Switch checked={enabled} onChange={handleToggleEnabled} />
        </ConfigRow>

        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.general.server_url')}</ConfigTitle>
            <ConfigDescription>{t('speech.general.server_url_description')}</ConfigDescription>
          </ConfigLabel>
          <Space.Compact style={{ width: 300 }}>
            <Input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
            />
            <Button type="primary" onClick={handleUpdateServerUrl}>
              {t('common.save')}
            </Button>
          </Space.Compact>
        </ConfigRow>
      </StyledCard>

      <StyledCard title={t('speech.shortcuts.title')}>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.shortcuts.toggle_recording')}</ConfigTitle>
            <ConfigDescription>{t('speech.shortcuts.toggle_recording_description')}</ConfigDescription>
          </ConfigLabel>
          <Text type="secondary">{t('speech.shortcuts.configure_in_shortcuts')}</Text>
        </ConfigRow>
      </StyledCard>

      <StyledCard title={t('speech.about.title')}>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.about.technology')}</ConfigTitle>
            <ConfigDescription>{t('speech.about.technology_description')}</ConfigDescription>
          </ConfigLabel>
        </ConfigRow>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.about.model')}</ConfigTitle>
            <ConfigDescription>SenseVoice Small - Alibaba DAMO Academy</ConfigDescription>
          </ConfigLabel>
        </ConfigRow>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.about.features')}</ConfigTitle>
            <ConfigDescription>{t('speech.about.features_description')}</ConfigDescription>
          </ConfigLabel>
        </ConfigRow>
      </StyledCard>
    </Container>
  )
}

export default SpeechSettings
