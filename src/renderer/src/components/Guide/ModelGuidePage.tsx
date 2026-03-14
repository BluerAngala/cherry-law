import {
  ArrowRightOutlined,
  GlobalOutlined,
  KeyOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { SYSTEM_MODELS } from '@renderer/config/models'
import { useAppDispatch } from '@renderer/store'
import { setModel } from '@renderer/store/assistants'
import { setDefaultModel, setQuickModel, setTranslateModel, updateProvider } from '@renderer/store/llm'
import { Button, Divider, Input, Space, Typography } from 'antd'
import { motion } from 'framer-motion'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

const { Title, Text } = Typography

const GuideContainer = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
  overflow: hidden;
  position: relative;
`

const BackgroundCircle = styled(motion.div)<{
  $size: number
  $top?: string
  $bottom?: string
  $left?: string
  $right?: string
  $color: string
}>`
  position: absolute;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  top: ${(props) => props.$top};
  bottom: ${(props) => props.$bottom};
  left: ${(props) => props.$left};
  right: ${(props) => props.$right};
  background: ${(props) => props.$color};
  border-radius: 50%;
  filter: blur(100px);
  z-index: 0;
  opacity: 0.4;
`

const GlassCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 32px;
  padding: 40px;
  box-shadow:
    0 8px 32px 0 rgba(31, 38, 135, 0.1),
    0 20px 50px rgba(0, 0, 0, 0.05);
  max-width: 540px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  text-align: center;
  z-index: 1;
  position: relative;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 10px;
  }
`

const SiliconFlowCard = styled(motion.div)`
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.03) 0%,
    rgba(37, 99, 235, 0.06) 100%
  );
  border: 1px solid rgba(37, 99, 235, 0.1);
  border-radius: 20px;
  text-align: left;
  margin-top: 8px;
  padding: 24px;
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    border-color: rgba(37, 99, 235, 0.3);
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.05);
    transform: translateY(-2px);
  }
`

const StyledInput = styled(Input.Password)`
  border-radius: 12px !important;
  padding: 8px 12px !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  background: rgba(255, 255, 255, 0.8) !important;

  &:focus,
  &:hover {
    border-color: #2563eb !important;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1) !important;
  }
`

const ModelGuidePage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGoToSettings = () => {
    navigate('/settings/provider')
  }

  const handleSaveSiliconFlow = async () => {
    if (!apiKey.trim()) {
      window.toast.warning(t('agent.guide.api_key_required'))
      return
    }

    setLoading(true)
    try {
      // 更新 SiliconFlow 提供商
      dispatch(
        updateProvider({
          id: 'silicon',
          apiKey: apiKey.trim(),
          enabled: true
        })
      )

      // 设置默认模型为 SiliconFlow 的 DeepSeek 模型
      const siliconModels = SYSTEM_MODELS.silicon
      if (siliconModels && siliconModels.length > 0) {
        const siliconModel = siliconModels[0]
        dispatch(setDefaultModel({ model: siliconModel }))
        dispatch(setQuickModel({ model: siliconModel }))
        dispatch(setTranslateModel({ model: siliconModel }))
        // 同时更新默认助手的模型，确保引导完成后即刻生效
        dispatch(setModel({ assistantId: 'default', model: siliconModel }))
      }

      // 标记已引导
      localStorage.setItem('cherry_studio_onboarded', 'true')

      window.toast.success(t('agent.guide.config_success'))

      // 稍微延迟后跳转到首页
      setTimeout(() => {
        navigate('/')
      }, 800)
    } catch (error) {
      window.toast.error(t('agent.guide.config_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GuideContainer>
      <BackgroundCircle
        $size={500}
        $top="-150px"
        $left="-150px"
        $color="#3B82F6"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.4, 0.3],
          x: [0, 30, 0],
          y: [0, 20, 0]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      <BackgroundCircle
        $size={400}
        $bottom="-100px"
        $right="-100px"
        $color="#F59E0B"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
          x: [0, -40, 0],
          y: [0, -30, 0]
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      <BackgroundCircle
        $size={350}
        $top="30%"
        $right="10%"
        $color="#10B981"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.25, 0.15],
          x: [0, -20, 0],
          y: [0, 40, 0]
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />

      <GlassCard
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}>
        <Space direction="vertical" size={32} style={{ width: '100%' }}>
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: 0.3
            }}>
            <div
              style={{
                width: 80,
                height: 80,
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                borderRadius: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                boxShadow: '0 10px 20px rgba(37, 99, 235, 0.2)'
              }}>
              <RocketOutlined style={{ fontSize: 40, color: '#fff' }} />
            </div>
          </motion.div>

          <div>
            <Title
              level={2}
              style={{
                marginBottom: 8,
                marginTop: 0,
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}>
              {t('agent.guide.welcome_title')}
            </Title>
            <Text type="secondary" style={{ fontSize: 16, opacity: 0.8 }}>
              {t('agent.guide.no_model_desc')}
            </Text>
          </div>

          <SiliconFlowCard whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    background: 'rgba(37, 99, 235, 0.1)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                  <SafetyCertificateOutlined style={{ color: '#2563EB', fontSize: 18 }} />
                </div>
                <Text strong style={{ fontSize: 16 }}>
                  {t('agent.guide.recommend_title')}
                </Text>
              </div>

              <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                {t('agent.guide.recommend_desc')}
              </Text>

              <div style={{ marginTop: 8 }}>
                <StyledInput
                  placeholder={t('agent.guide.api_key_placeholder')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  prefix={<KeyOutlined style={{ color: 'rgba(0,0,0,0.3)' }} />}
                  size="large"
                />
                <div
                  style={{
                    marginTop: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                  <Button
                    type="link"
                    size="small"
                    icon={<GlobalOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open('https://cloud.siliconflow.cn/i/WFoChvZf', '_blank')
                    }}
                    style={{ padding: 0, fontSize: 14, color: '#64748b' }}>
                    {t('agent.guide.get_api_key')}
                  </Button>
                  <Button
                    type="primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSaveSiliconFlow()
                    }}
                    loading={loading}
                    icon={<ArrowRightOutlined />}
                    style={{
                      borderRadius: 12,
                      height: 40,
                      padding: '0 24px',
                      background: '#2563EB',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                    }}>
                    {t('agent.guide.confirm_config')}
                  </Button>
                </div>
              </div>
            </Space>
          </SiliconFlowCard>

          <Divider style={{ margin: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 13, opacity: 0.5 }}>
              {t('agent.guide.or')}
            </Text>
          </Divider>

          <motion.div whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
            <Button
              type="default"
              onClick={handleGoToSettings}
              icon={<SettingOutlined />}
              size="large"
              style={{
                borderRadius: 12,
                padding: '0 32px',
                height: 48,
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'transparent',
                fontWeight: 500
              }}>
              {t('agent.guide.go_to_settings')}
            </Button>
          </motion.div>
        </Space>
      </GlassCard>
    </GuideContainer>
  )
}

export default ModelGuidePage
