import { useTheme } from '@renderer/context/ThemeProvider'
import { useDefaultPreprocessProvider, usePreprocessProviders } from '@renderer/hooks/usePreprocess'
import type { PreprocessProvider } from '@renderer/types'
import { Select } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'
import PreprocessProviderSettings from './PreprocessProviderSettings'

const PreprocessSettings: FC = () => {
  const { preprocessProviders, updatePreprocessProviders } = usePreprocessProviders()
  const { provider: defaultProvider, setDefaultPreprocessProvider } = useDefaultPreprocessProvider()
  const { t } = useTranslation()
  const [selectedProvider, setSelectedProvider] = useState<PreprocessProvider | undefined>(defaultProvider)
  const { theme: themeMode } = useTheme()

  // 确保 Auto 选项存在（针对旧用户）
  useEffect(() => {
    const hasAuto = preprocessProviders.some((p) => p.id === 'auto')
    if (!hasAuto) {
      const newProviders = [
        {
          id: 'auto',
          name: 'Auto',
          apiKey: '',
          apiHost: ''
        },
        ...preprocessProviders
      ] as PreprocessProvider[]
      updatePreprocessProviders(newProviders)
    }
  }, [preprocessProviders, updatePreprocessProviders])

  // 当 defaultProvider 改变时同步 selectedProvider
  useEffect(() => {
    setSelectedProvider(defaultProvider)
  }, [defaultProvider])

  function updateSelectedPreprocessProvider(providerId: string) {
    const provider = preprocessProviders.find((p) => p.id === providerId)
    if (!provider) {
      return
    }
    setDefaultPreprocessProvider(provider)
    setSelectedProvider(provider)
  }

  return (
    <>
      <SettingGroup theme={themeMode}>
        <SettingTitle>{t('settings.tool.preprocess.title')}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{t('settings.tool.preprocess.provider')}</SettingRowTitle>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Select
              value={selectedProvider?.id}
              style={{ width: '200px' }}
              onChange={(value: string) => updateSelectedPreprocessProvider(value)}
              placeholder={t('settings.tool.preprocess.provider_placeholder')}
              options={preprocessProviders.map((p) => ({
                value: p.id,
                label: p.name
                // 由于system字段实际未使用，先注释掉
                // disabled: !isMac && p.id === 'system' // 在非 Mac 系统下禁用 system 选项
              }))}
            />
          </div>
        </SettingRow>
      </SettingGroup>
      {selectedProvider && (
        <SettingGroup theme={themeMode}>
          <PreprocessProviderSettings provider={selectedProvider} />
        </SettingGroup>
      )}
    </>
  )
}
export default PreprocessSettings
