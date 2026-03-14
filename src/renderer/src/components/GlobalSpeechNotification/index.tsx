/**
 * 全局语音投递结果通知组件
 * 显示语音投递成功或失败的通知
 */
import { CheckCircleOutlined, CloseCircleOutlined, HistoryOutlined } from '@ant-design/icons'
import { useGlobalSpeech } from '@renderer/hooks/useGlobalSpeech'
import { Button, notification } from 'antd'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { SpeechHistoryPanel } from '../SpeechHistoryPanel'

const NotificationContent = styled.div`
  max-width: 350px;
`

const NotificationText = styled.div`
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-all;
`

const NotificationActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
`

export const GlobalSpeechNotification: React.FC = () => {
  const { lastDeliveryResult, copyTextToClipboard } = useGlobalSpeech()
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false)
  const [api, contextHolder] = notification.useNotification()

  useEffect(() => {
    if (!lastDeliveryResult) return

    const { success, text, delivered, error } = lastDeliveryResult

    if (success) {
      if (delivered) {
        // 投递成功
        api.success({
          message: '语音已投递',
          description: (
            <NotificationContent>
              <NotificationText>{text}</NotificationText>
            </NotificationContent>
          ),
          icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
          duration: 3,
          placement: 'topRight'
        })
      } else {
        // 投递失败 - 显示历史面板入口
        api.warning({
          message: '语音未投递到输入框',
          description: (
            <NotificationContent>
              <NotificationText>{error || '未找到活动输入框，文本已保存到历史记录'}</NotificationText>
              <NotificationActions>
                <Button
                  type="primary"
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => setHistoryPanelVisible(true)}>
                  查看历史
                </Button>
                <Button size="small" onClick={() => copyTextToClipboard(text)}>
                  复制文本
                </Button>
              </NotificationActions>
            </NotificationContent>
          ),
          icon: <CloseCircleOutlined style={{ color: '#faad14' }} />,
          duration: 5,
          placement: 'topRight'
        })
      }
    } else {
      // 识别失败
      api.error({
        message: '语音识别失败',
        description: error || '请检查语音服务状态',
        icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
        duration: 4,
        placement: 'topRight'
      })
    }
  }, [lastDeliveryResult, api, copyTextToClipboard])

  return (
    <>
      {contextHolder}
      <SpeechHistoryPanel visible={historyPanelVisible} onClose={() => setHistoryPanelVisible(false)} />
    </>
  )
}

export default GlobalSpeechNotification
