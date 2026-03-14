import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  SoundOutlined
} from '@ant-design/icons'
import { isMac, isWin } from '@renderer/config/constant'
import { useShortcuts } from '@renderer/hooks/useShortcuts'
import { useSpeechRecognition } from '@renderer/hooks/useSpeechRecognition'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { updateShortcut } from '@renderer/store/shortcuts'
import { setEnabled, setServerConnected } from '@renderer/store/speech'
import type { Shortcut } from '@renderer/types'
import type { InputRef } from 'antd'
import { Alert, Button, Card, Input, Space, Switch, Tag, Typography } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const { Text } = Typography

const Container = styled.div`
  padding: 20px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-3);
  }
`

const StyledCard = styled(Card)`
  margin-bottom: 12px;
  border-radius: 8px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background);

  .ant-card-body {
    padding: 16px;
  }

  .ant-card-head {
    padding: 0 16px;
    min-height: 44px;
    border-bottom: 0.5px solid var(--color-border);
  }

  .ant-card-head-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-1);
  }
`

const ConfigRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    padding-bottom: 0;
  }
`

const ConfigLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`

const ConfigTitle = styled(Text)`
  font-weight: 500;
  font-size: 14px;
  color: var(--color-text-1);
`

const ConfigDescription = styled(Text)`
  font-size: 12px;
  color: var(--color-text-3);
`

const StatusCard = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${(props) => (props.$connected ? 'var(--color-primary-mute)' : 'rgba(255, 77, 80, 0.1)')};
  border: 1px solid
    ${(props) => (props.$connected ? 'var(--color-primary-soft)' : 'rgba(255, 77, 80, 0.3)')};
  border-radius: 8px;
`

const StatusInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const StatusIconWrapper = styled.div<{ $connected: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => (props.$connected ? 'var(--color-primary)' : 'var(--color-error)')};
  color: white;
  font-size: 16px;
  flex-shrink: 0;
`

const StatusText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const StatusTitle = styled(Text)`
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-1);
`

const StatusDesc = styled(Text)`
  font-size: 12px;
  color: var(--color-text-3);
`

const InfoCard = styled.div`
  padding: 12px 16px;
  background: var(--color-background-soft);
  border: 0.5px solid var(--color-border);
  border-radius: 8px;
  margin-top: 12px;
`

const InfoItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-2);
  line-height: 1.6;

  &:not(:last-child) {
    margin-bottom: 8px;
  }
`

const ShortcutInput = styled(Input)`
  width: 200px;
  text-align: center;
  font-family: monospace;
  cursor: pointer;

  &.recording {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-bg);
  }
`

const ShortcutKeys = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const KeyTag = styled(Tag)`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  margin: 0;
`

const formatShortcutDisplay = (shortcut: string[]): string => {
  if (shortcut.length === 0) return ''

  return shortcut
    .map((key) => {
      switch (key) {
        case 'CommandOrControl':
          return isMac ? '⌘' : 'Ctrl'
        case 'Ctrl':
          return isMac ? '⌃' : 'Ctrl'
        case 'Alt':
          return isMac ? '⌥' : 'Alt'
        case 'AltRight':
          return isMac ? '⌥右' : '右Alt'
        case 'Meta':
          return isMac ? '⌘' : isWin ? 'Win' : 'Super'
        case 'Shift':
          return isMac ? '⇧' : 'Shift'
        case 'Command':
        case 'Cmd':
          return isMac ? '⌘' : 'Ctrl'
        case 'Control':
          return isMac ? '⌃' : 'Ctrl'
        case 'ArrowUp':
          return '↑'
        case 'ArrowDown':
          return '↓'
        case 'ArrowLeft':
          return '←'
        case 'ArrowRight':
          return '→'
        case 'Slash':
          return '/'
        case 'Semicolon':
          return ';'
        case 'BracketLeft':
          return '['
        case 'BracketRight':
          return ']'
        case 'Backslash':
          return '\\'
        case 'Quote':
          return "'"
        case 'Comma':
          return ','
        case 'Minus':
          return '-'
        case 'Equal':
          return '='
        default:
          return key.charAt(0).toUpperCase() + key.slice(1)
      }
    })
    .join(' + ')
}

const SpeechSettings: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { enabled, serverConnected, error } = useAppSelector((state) => state.speech)
  const { checkServerHealth, updateConfig } = useSpeechRecognition()
  const { shortcuts } = useShortcuts()

  const [isChecking, setIsChecking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [currentKeys, setCurrentKeys] = useState<string[]>([])
  const inputRef = useRef<InputRef>(null)

  const speechShortcut = shortcuts.find((s) => s.key === 'speech_toggle')

  // 启用语音助手时自动检测服务器状态
  useEffect(() => {
    if (enabled) {
      setIsChecking(true)
      checkServerHealth().finally(() => setIsChecking(false))
    }
  }, [enabled, checkServerHealth])

  const handleToggleEnabled = async (checked: boolean) => {
    dispatch(setEnabled(checked))
    await updateConfig({ enabled: checked })
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

  const isValidShortcut = (keys: string[]): boolean => {
    const hasModifier = keys.some((key) => ['CommandOrControl', 'Ctrl', 'Alt', 'Meta', 'Shift'].includes(key))
    const hasNonModifier = keys.some(
      (key) => !['CommandOrControl', 'Ctrl', 'Alt', 'Meta', 'Shift', 'AltRight', 'AltLeft'].includes(key)
    )
    const hasFnKey = keys.some((key) => /^F\d+$/.test(key))
    const hasAltRight = keys.includes('AltRight')
    return (hasModifier && hasNonModifier && keys.length >= 2) || hasFnKey || hasAltRight
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isRecording) return

    event.preventDefault()
    event.stopPropagation()

    const { code, key } = event

    // 处理左右Alt键作为独立快捷键的情况
    if (code === 'AltRight') {
      const newKeys = ['AltRight']
      setCurrentKeys(newKeys)
      if (speechShortcut) {
        const updatedShortcut: Shortcut = {
          ...speechShortcut,
          shortcut: newKeys,
          enabled: true
        }
        dispatch(updateShortcut(updatedShortcut))
      }
      setIsRecording(false)
      return
    }

    // 忽略其他单独的功能键
    if (['ControlLeft', 'ControlRight', 'AltLeft', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(code)) {
      return
    }

    let keyName = ''

    // 处理修饰键
    if (event.metaKey && !isMac) {
      keyName = 'Meta'
    } else if (event.ctrlKey) {
      keyName = 'CommandOrControl'
    } else if (event.altKey) {
      keyName = 'Alt'
    } else if (event.shiftKey) {
      keyName = 'Shift'
    }

    // 处理普通键
    let endKey = ''
    switch (code) {
      case 'KeyA':
      case 'KeyB':
      case 'KeyC':
      case 'KeyD':
      case 'KeyE':
      case 'KeyF':
      case 'KeyG':
      case 'KeyH':
      case 'KeyI':
      case 'KeyJ':
      case 'KeyK':
      case 'KeyL':
      case 'KeyM':
      case 'KeyN':
      case 'KeyO':
      case 'KeyP':
      case 'KeyQ':
      case 'KeyR':
      case 'KeyS':
      case 'KeyT':
      case 'KeyU':
      case 'KeyV':
      case 'KeyW':
      case 'KeyX':
      case 'KeyY':
      case 'KeyZ':
        endKey = code.replace('Key', '')
        break
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        endKey = code.replace('Digit', '')
        break
      case 'F1':
      case 'F2':
      case 'F3':
      case 'F4':
      case 'F5':
      case 'F6':
      case 'F7':
      case 'F8':
      case 'F9':
      case 'F10':
      case 'F11':
      case 'F12':
        endKey = code
        break
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Slash':
      case 'Semicolon':
      case 'BracketLeft':
      case 'BracketRight':
      case 'Backslash':
      case 'Quote':
      case 'Comma':
      case 'Minus':
      case 'Equal':
        endKey = code
        break
      case 'Space':
        endKey = 'Space'
        break
      case 'Enter':
        endKey = 'Enter'
        break
      case 'Backspace':
        endKey = 'Backspace'
        break
      case 'Tab':
        endKey = 'Tab'
        break
      default:
        if (key && key.length === 1) {
          endKey = key.toUpperCase()
        }
    }

    if (!endKey) return

    const newKeys = keyName ? [keyName, endKey] : [endKey]
    setCurrentKeys(newKeys)

    if (isValidShortcut(newKeys)) {
      // 保存快捷键
      if (speechShortcut) {
        const updatedShortcut: Shortcut = {
          ...speechShortcut,
          shortcut: newKeys,
          enabled: true
        }
        dispatch(updateShortcut(updatedShortcut))
      }
      setIsRecording(false)
    }
  }

  const handleKeyUp = (event: React.KeyboardEvent) => {
    if (!isRecording) return
    event.preventDefault()
    event.stopPropagation()

    // 如果没有有效的快捷键组合，清空当前按键
    if (currentKeys.length === 0 || !isValidShortcut(currentKeys)) {
      setCurrentKeys([])
      setIsRecording(false)
    }
  }

  const startRecording = () => {
    setIsRecording(true)
    setCurrentKeys([])
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }

  const clearShortcut = () => {
    if (speechShortcut) {
      const updatedShortcut: Shortcut = {
        ...speechShortcut,
        shortcut: [],
        enabled: false
      }
      dispatch(updateShortcut(updatedShortcut))
    }
  }

  return (
    <Container>
      {error && (
        <Alert
          message={t('speech.error.title')}
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
        />
      )}

      {/* 主开关 */}
      <StyledCard>
        <ConfigRow>
          <ConfigLabel>
            <ConfigTitle>{t('speech.general.enable')}</ConfigTitle>
            <ConfigDescription>{t('speech.general.enable_description')}</ConfigDescription>
          </ConfigLabel>
          <Switch checked={enabled} onChange={handleToggleEnabled} size="default" />
        </ConfigRow>
      </StyledCard>

      {/* 启用后显示服务状态 */}
      {enabled && (
        <>
          {/* 服务连接状态 */}
          <StyledCard title={t('speech.status.server_connection')}>
            <StatusCard $connected={serverConnected}>
              <StatusInfo>
                <StatusIconWrapper $connected={serverConnected}>
                  {isChecking ? (
                    <LoadingOutlined spin />
                  ) : serverConnected ? (
                    <CheckCircleOutlined />
                  ) : (
                    <CloseCircleOutlined />
                  )}
                </StatusIconWrapper>
                <StatusText>
                  <StatusTitle>
                    {isChecking
                      ? t('speech.status.checking')
                      : serverConnected
                        ? t('speech.status.connected')
                        : t('speech.status.disconnected')}
                  </StatusTitle>
                  <StatusDesc>
                    {serverConnected ? t('speech.status.server_description') : t('speech.status.check_server')}
                  </StatusDesc>
                </StatusText>
              </StatusInfo>
              {!serverConnected && !isChecking && (
                <Button type="primary" size="small" onClick={handleCheckHealth} icon={<AudioOutlined />}>
                  {t('speech.status.check_connection')}
                </Button>
              )}
            </StatusCard>

            {/* 未连接时的提示 */}
            {!serverConnected && !isChecking && (
              <InfoCard>
                <InfoItem>
                  <InfoCircleOutlined style={{ marginTop: 2 }} />
                  <span>{t('speech.status.start_server_hint')}</span>
                </InfoItem>
              </InfoCard>
            )}
          </StyledCard>

          {/* 快捷键设置 */}
          <StyledCard title={t('speech.shortcuts.title')}>
            <ConfigRow>
              <ConfigLabel>
                <ConfigTitle>{t('speech.shortcuts.toggle_recording')}</ConfigTitle>
                <ConfigDescription>{t('speech.shortcuts.toggle_recording_description')}</ConfigDescription>
              </ConfigLabel>
              <Space>
                {speechShortcut && speechShortcut.shortcut.length > 0 ? (
                  <ShortcutKeys>
                    {speechShortcut.shortcut.map((key, index) => (
                      <KeyTag key={index} color="blue">
                        {formatShortcutDisplay([key])}
                      </KeyTag>
                    ))}
                  </ShortcutKeys>
                ) : null}
                <ShortcutInput
                  ref={inputRef}
                  className={isRecording ? 'recording' : ''}
                  value={
                    isRecording
                      ? currentKeys.length > 0
                        ? formatShortcutDisplay(currentKeys)
                        : t('speech.shortcuts.press_keys')
                      : speechShortcut?.shortcut.length
                        ? formatShortcutDisplay(speechShortcut.shortcut)
                        : t('speech.shortcuts.click_to_set')
                  }
                  onClick={startRecording}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  readOnly
                  placeholder={t('speech.shortcuts.click_to_set')}
                />
                {speechShortcut && speechShortcut.shortcut.length > 0 && (
                  <Button size="small" onClick={clearShortcut}>
                    {t('common.clear')}
                  </Button>
                )}
              </Space>
            </ConfigRow>
            <InfoCard style={{ marginTop: 12 }}>
              <InfoItem>
                <InfoCircleOutlined style={{ marginTop: 2 }} />
                <span>{t('speech.shortcuts.recording_mode_description')}</span>
              </InfoItem>
            </InfoCard>
          </StyledCard>

          {/* 关于 */}
          <StyledCard title={t('speech.about.title')} size="small">
            <InfoItem>
              <SoundOutlined style={{ marginTop: 2 }} />
              <span>{t('speech.about.technology_description')}</span>
            </InfoItem>
            <InfoItem style={{ marginTop: 8 }}>
              <InfoCircleOutlined style={{ marginTop: 2 }} />
              <span>{t('speech.about.features_description')}</span>
            </InfoItem>
          </StyledCard>
        </>
      )}
    </Container>
  )
}

export default SpeechSettings
