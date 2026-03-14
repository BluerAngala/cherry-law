/**
 * 录音历史面板组件
 * 显示和管理所有录音历史记录
 */
import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  SoundOutlined
} from '@ant-design/icons'
import { useGlobalSpeech } from '@renderer/hooks/useGlobalSpeech'
import { Button, Empty, List, message, Modal, Popconfirm, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import type { SpeechHistoryItem } from '../../types/speech'

const { Text, Paragraph } = Typography

interface SpeechHistoryPanelProps {
  visible: boolean
  onClose: () => void
}

const ModalContent = styled.div`
  max-height: 60vh;
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
`

const HistoryItem = styled(List.Item)`
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const ItemMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const TimeText = styled(Text)`
  font-size: 12px;
  color: var(--color-text-3);
`

const DurationTag = styled(Tag)`
  font-size: 11px;
`

const StatusTag = styled(Tag)<{ $delivered: boolean }>`
  font-size: 11px;
  ${(props) =>
    props.$delivered
      ? `
    color: #52c41a;
    background: #f6ffed;
    border-color: #b7eb8f;
  `
      : `
    color: #faad14;
    background: #fffbe6;
    border-color: #ffe58f;
  `}
`

const TextContent = styled(Paragraph)`
  margin-bottom: 12px !important;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-1);
`

const ItemActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ActionButton = styled(Button)`
  padding: 4px 8px;
  height: auto;
  font-size: 12px;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
`

const StatsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
`

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-2);
`

export const SpeechHistoryPanel: React.FC<SpeechHistoryPanelProps> = ({ visible, onClose }) => {
  useTranslation()
  const { history, deleteHistoryItem, clearAllHistory, copyTextToClipboard, loadHistory } = useGlobalSpeech()
  const [playingId, setPlayingId] = useState<string | null>(null)

  // 复制文本
  const handleCopy = async (text: string) => {
    await copyTextToClipboard(text)
    message.success('已复制到剪贴板')
  }

  // 播放音频
  const handlePlay = (item: SpeechHistoryItem) => {
    if (!item.audioPath) {
      message.warning('音频文件不存在')
      return
    }

    // TODO: 实现音频播放
    setPlayingId(item.id)
    message.info('音频播放功能开发中...')
    setTimeout(() => setPlayingId(null), 1000)
  }

  // 删除单项
  const handleDelete = async (id: string) => {
    await deleteHistoryItem(id)
    message.success('已删除')
  }

  // 清空全部
  const handleClearAll = async () => {
    await clearAllHistory()
    message.success('已清空所有记录')
  }

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}秒`
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}分${secs}秒`
  }

  // 统计信息
  const totalCount = history.length
  const deliveredCount = history.filter((item) => item.delivered).length
  const totalDuration = history.reduce((sum, item) => sum + item.duration, 0)

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SoundOutlined />
          <span>录音历史</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      centered>
      <ModalContent>
        <HeaderActions>
          <StatsContainer>
            <StatItem>
              <AudioOutlined />
              <span>共 {totalCount} 条记录</span>
            </StatItem>
            <StatItem>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>{deliveredCount} 条已投递</span>
            </StatItem>
            <StatItem>
              <span>总时长: {formatDuration(totalDuration)}</span>
            </StatItem>
          </StatsContainer>

          <Button icon={<CopyOutlined />} onClick={loadHistory} size="small">
            刷新
          </Button>

          {history.length > 0 && (
            <Popconfirm
              title="确定要清空所有录音历史吗？"
              description="此操作不可恢复"
              onConfirm={handleClearAll}
              okText="确定"
              cancelText="取消">
              <Button danger icon={<DeleteOutlined />} size="small">
                清空全部
              </Button>
            </Popconfirm>
          )}
        </HeaderActions>

        {history.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无录音记录" />
        ) : (
          <List
            dataSource={history}
            renderItem={(item) => (
              <HistoryItem>
                <ItemHeader>
                  <ItemMeta>
                    <TimeText>{dayjs(item.timestamp).format('YYYY-MM-DD HH:mm:ss')}</TimeText>
                    <DurationTag color="blue">{formatDuration(item.duration)}</DurationTag>
                    <Tag color="default">{item.language}</Tag>
                    <StatusTag $delivered={item.delivered}>
                      {item.delivered ? (
                        <>
                          <CheckCircleOutlined /> 已投递
                        </>
                      ) : (
                        <>
                          <CloseCircleOutlined /> 未投递
                        </>
                      )}
                    </StatusTag>
                  </ItemMeta>

                  <Popconfirm
                    title="确定要删除这条记录吗？"
                    onConfirm={() => handleDelete(item.id)}
                    okText="确定"
                    cancelText="取消">
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                  </Popconfirm>
                </ItemHeader>

                <TextContent ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>{item.text}</TextContent>

                <ItemActions>
                  <Tooltip title="复制文本">
                    <ActionButton icon={<CopyOutlined />} onClick={() => handleCopy(item.text)}>
                      复制
                    </ActionButton>
                  </Tooltip>

                  {item.audioPath && (
                    <Tooltip title="播放音频">
                      <ActionButton
                        icon={<PlayCircleOutlined />}
                        onClick={() => handlePlay(item)}
                        loading={playingId === item.id}>
                        播放
                      </ActionButton>
                    </Tooltip>
                  )}
                </ItemActions>
              </HistoryItem>
            )}
          />
        )}
      </ModalContent>
    </Modal>
  )
}

export default SpeechHistoryPanel
