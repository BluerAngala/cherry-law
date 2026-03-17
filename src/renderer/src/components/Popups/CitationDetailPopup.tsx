import { HStack } from '@renderer/components/Layout'
import { TopView } from '@renderer/components/TopView'
import type { Citation } from '@renderer/types'
import { Button, Modal } from 'antd'
import { FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  citation: Citation
  resolve: (value: any) => void
}

const PopupContainer: React.FC<Props> = ({ citation, resolve }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)

  const onCancel = () => {
    setOpen(false)
  }

  const afterClose = () => {
    resolve(null)
  }

  const hostname = useMemo(() => {
    try {
      return new URL(citation.url).hostname
    } catch {
      return citation.url
    }
  }, [citation.url])

  const sourceTitle = useMemo(() => {
    // 尝试从 title 或 sourceUrl 中提取文件名
    if (citation.title) {
      // 检查 title 是否包含路径分隔符（支持 Windows 和 Unix 风格）
      if (citation.title.includes('/') || citation.title.includes('\\')) {
        return citation.title.split(/[/\\]/).pop() || citation.title
      }
      return citation.title
    }

    // 如果没有 title，尝试从 url 中提取（如果 url 是文件路径）
    if (citation.url && !citation.url.startsWith('http')) {
      return citation.url.split(/[/\\]/).pop() || citation.url
    }

    return hostname
  }, [citation.title, citation.url, hostname])

  return (
    <Modal
      title={
        <HStack alignItems="center" gap={8}>
          <FileText size={18} />
          <span>{sourceTitle}</span>
        </HStack>
      }
      open={open}
      onCancel={onCancel}
      afterClose={afterClose}
      footer={
        <HStack justifyContent="flex-end">
          <Button onClick={onCancel}>{t('common.close')}</Button>
          {citation.url && (
            <Button
              type="primary"
              onClick={() => {
                if (citation.url.startsWith('http')) {
                  window.open(citation.url, '_blank')
                } else {
                  // 对于本地文件路径，使用 Electron 的 shell.openPath
                  window.api.openPath(citation.url)
                }
              }}>
              {t('common.open')}
            </Button>
          )}
        </HStack>
      }
      width={800}
      centered
      maskClosable>
      <ContentContainer>
        <SourceInfo>
          <InfoItem>
            <Label>{t('knowledge.source')}:</Label>
            <Value>{hostname}</Value>
          </InfoItem>
          {citation.number && (
            <InfoItem>
              <Label>{t('knowledge.citation_index')}:</Label>
              <Value>[{citation.number}]</Value>
            </InfoItem>
          )}
        </SourceInfo>

        <Divider />

        <Content className="markdown-body" dangerouslySetInnerHTML={{ __html: citation.content || '' }} />
      </ContentContainer>
    </Modal>
  )
}

const ContentContainer = styled.div`
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
`

const SourceInfo = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--color-text-2);
`

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const Label = styled.span`
  font-weight: 500;
`

const Value = styled.span`
  color: var(--color-text-1);
`

const Divider = styled.div`
  height: 1px;
  background-color: var(--color-border);
  margin: 12px 0;
`

const Content = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-1);
  white-space: pre-wrap;
  word-break: break-word;

  mark {
    background-color: rgba(255, 215, 0, 0.3);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }
`

const TopViewKey = 'CitationDetailPopup'

export default class CitationDetailPopup {
  static topviewId = 0

  static hide() {
    TopView.hide(TopViewKey)
  }

  static show(citation: Citation) {
    return new Promise((resolve) => {
      TopView.show(
        <PopupContainer
          citation={citation}
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
