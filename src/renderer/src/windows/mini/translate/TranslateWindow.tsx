import { SwapOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import LanguageSelect from '@renderer/components/LanguageSelect'
import Scrollbar from '@renderer/components/Scrollbar'
import { LanguagesEnum } from '@renderer/config/translate'
import { useDefaultModel } from '@renderer/hooks/useAssistant'
import useTranslate from '@renderer/hooks/useTranslate'
import { translateText } from '@renderer/services/TranslateService'
import type { TranslateLanguage } from '@renderer/types'
import { runAsyncFunction } from '@renderer/utils'
import { IpcChannel } from '@shared/IpcChannel'
import { Select } from 'antd'
import { isEmpty } from 'lodash'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const logger = loggerService.withContext('TranslateWindow')

interface Props {
  text: string
}

// Initialize target language from config
const getInitialTargetLanguage = async (): Promise<TranslateLanguage> => {
  try {
    const targetLang = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, 'translate:target:language')
    return targetLang || LanguagesEnum.zhCN
  } catch (error) {
    logger.error('Failed to get target language:', error as Error)
    return LanguagesEnum.zhCN
  }
}

let _targetLanguage: TranslateLanguage = LanguagesEnum.zhCN

// Initialize on module load
getInitialTargetLanguage().then((lang) => {
  _targetLanguage = lang
})

const Translate: FC<Props> = ({ text }) => {
  const [result, setResult] = useState('')
  const [targetLanguage, setTargetLanguage] = useState<TranslateLanguage>(_targetLanguage)
  const { translateModel } = useDefaultModel()
  const { t } = useTranslation()
  const translatingRef = useRef(false)
  const { getLanguageByLangcode } = useTranslate()

  _targetLanguage = targetLanguage

  const translate = useCallback(async () => {
    if (!text.trim() || !translateModel) return

    if (translatingRef.current) return

    try {
      translatingRef.current = true

      await translateText(text, targetLanguage, setResult)

      translatingRef.current = false
    } catch (error) {
      logger.error('Error fetching result:', error as Error)
    } finally {
      translatingRef.current = false
    }
  }, [text, targetLanguage, translateModel])

  useEffect(() => {
    runAsyncFunction(async () => {
      const targetLang = await window.electron.ipcRenderer.invoke(IpcChannel.Config_Get, 'translate:target:language')
      targetLang && setTargetLanguage(getLanguageByLangcode(targetLang))
    })
  }, [getLanguageByLangcode])

  useEffect(() => {
    translate()
  }, [translate])

  useHotkeys('c', () => {
    navigator.clipboard.writeText(result)
    window.toast.success(t('message.copy.success'))
  })

  return (
    <Container>
      <MenuContainer>
        <Select
          showSearch
          value="any"
          style={{ maxWidth: 200, minWidth: 100, flex: 1 }}
          optionFilterProp="label"
          disabled
          options={[{ label: t('translate.any.language'), value: 'any' }]}
        />
        <SwapOutlined />
        <LanguageSelect
          showSearch
          value={targetLanguage.langCode}
          style={{ maxWidth: 200, minWidth: 130, flex: 1 }}
          optionFilterProp="label"
          onChange={async (value) => {
            await window.electron.ipcRenderer.invoke(IpcChannel.Config_Set, { id: 'translate:target:language', value })
            setTargetLanguage(getLanguageByLangcode(value))
          }}
        />
      </MenuContainer>
      <Main>
        <ResultContainer>
          <Scrollbar>
            {isEmpty(result) ? <StatusText>{t('translate.generating')}</StatusText> : <ResultText>{result}</ResultText>}
          </Scrollbar>
        </ResultContainer>
      </Main>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-background);
`

const MenuContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 15px;
  gap: 10px;
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  user-select: none;

  .ant-select {
    -webkit-app-region: no-drag;
  }

  .anticon {
    -webkit-app-region: no-drag;
    color: var(--color-text-2);
  }
`

const Main = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
`

const ResultContainer = styled.div`
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background-color: var(--color-background);
`

const ResultText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
`

const StatusText = styled.div`
  font-size: 14px;
  color: var(--color-text-3);
  text-align: center;
  padding: 20px;
`

export default Translate
