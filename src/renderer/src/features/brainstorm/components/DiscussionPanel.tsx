/**
 * DiscussionPanel - 讨论面板
 * 展示讨论过程和结果，采用更先进的 DiscussionEngine (CrewAI 风格)
 * 强化响应式布局，解决内容重叠和截断问题
 */

import {
  CopyOutlined,
  DownloadOutlined,
  LayoutOutlined,
  MenuUnfoldOutlined,
  PlayCircleOutlined,
  RightOutlined,
  StopOutlined,
  TeamOutlined,
  VerticalLeftOutlined
} from '@ant-design/icons'
import { loggerService } from '@logger'
import { getStoreProviders } from '@renderer/hooks/useStore'
import { useAppSelector } from '@renderer/store'
import {
  Avatar,
  Button,
  Card,
  Input,
  List,
  message as antdMessage,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Timeline,
  Tooltip,
  Typography
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import { useBrainstorm } from '../context/BrainstormContext'
import type { DecisionReport, EngineDiscussionPhase } from '../services'
import { DiscussionEngine } from '../services'
import type { AgentRole, DiscussionMessage, DiscussionStatus } from '../types'

const { Text, Title: TypographyTitle } = Typography
const { Option } = Select
const { TextArea } = Input

const logger = loggerService.withContext('BrainstormDiscussionPanel')

interface DiscussionPanelProps {
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export function DiscussionPanel({ isSidebarCollapsed, onToggleSidebar }: DiscussionPanelProps) {
  const { currentSession, addMessage, setDecision, setIsRunning, appendMessageContent, updateStatus, dispatch } =
    useBrainstorm()

  const llmState = useAppSelector((state) => state.llm)
  const defaultModel = llmState.defaultModel

  // 从 store 获取所有 provider（包括内置的 CherryAI）
  const providers = useMemo(() => getStoreProviders(), [])

  // 获取默认选中的 Provider ID（优先匹配当前默认模型的 Provider）
  const initialProviderId = useMemo(() => {
    if (defaultModel) {
      const p = providers.find((p) => p.id === defaultModel.provider)
      if (p) return p.id
    }
    return providers[0]?.id || ''
  }, [defaultModel, providers])

  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialProviderId)
  const [currentPhase, setCurrentPhase] = useState<EngineDiscussionPhase>('divergence')
  const [decisionReport, setDecisionReport] = useState<DecisionReport | null>(null)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DiscussionEngine | null>(null)

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) || providers[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  // 使用 ref 保存最新的 session 数据，避免 engine 重建
  const sessionRef = useRef(currentSession)
  useEffect(() => {
    sessionRef.current = currentSession
  }, [currentSession])

  // 使用 ref 保存回调，避免 engine 频繁重建
  const callbacksRef = useRef({
    addMessage,
    updateStatus,
    setDecision,
    appendMessageContent,
    setIsRunning
  })

  // 同步最新的回调
  useEffect(() => {
    callbacksRef.current = {
      addMessage,
      updateStatus,
      setDecision,
      appendMessageContent,
      setIsRunning
    }
  }, [addMessage, updateStatus, setDecision, appendMessageContent, setIsRunning])

  // 初始化讨论引擎
  useEffect(() => {
    if (!currentSession?.id || !defaultModel || !selectedProvider) return

    // 只有当会话 ID 变化时才重新创建引擎
    if (engineRef.current) {
      engineRef.current.stop()
    }

    // 从 ref 中获取初始 session，后续 engine 内部会自己管理消息状态
    const initialSession = sessionRef.current
    if (!initialSession) return

    const newEngine = new DiscussionEngine(initialSession, defaultModel, selectedProvider, {
      onMessage: (message: DiscussionMessage) => {
        callbacksRef.current.addMessage(initialSession.id, message)
      },
      onPhaseChange: (phase: EngineDiscussionPhase) => {
        setCurrentPhase(phase)
      },
      onStatusChange: (status: DiscussionStatus) => {
        callbacksRef.current.updateStatus(initialSession.id, status)
      },
      onDecision: (report: DecisionReport) => {
        setDecisionReport(report)
        callbacksRef.current.setDecision(initialSession.id, report.finalDecision)
      },
      onMessageChunk: (messageId: string, chunk: string) => {
        callbacksRef.current.appendMessageContent(initialSession.id, messageId, chunk)
      },
      onError: (error: Error) => {
        logger.error('Discussion error:', error)
        callbacksRef.current.setIsRunning(false)
      }
    })

    engineRef.current = newEngine

    return () => {
      newEngine.stop()
      engineRef.current = null
    }
  }, [currentSession?.id, defaultModel, selectedProvider]) // 关键：只依赖 ID

  const handleStart = async () => {
    if (!engineRef.current) return
    setIsRunning(true)
    setDecisionReport(null)
    await engineRef.current.start()
    setIsRunning(false)
  }

  const handleStop = () => {
    engineRef.current?.stop()
    setIsRunning(false)
  }

  const handleUpdateRole = () => {
    if (!currentSession || !editingRole) return

    const updatedRoles = currentSession.roles.map((r) => (r.id === editingRole.id ? editingRole : r))

    dispatch({
      type: 'UPDATE_SESSION',
      payload: {
        id: currentSession.id,
        roles: updatedRoles
      }
    })

    setEditingRole(null)
    antdMessage.success('专家配置已更新')
  }

  const handleCopyMessage = (msg: DiscussionMessage) => {
    const text = `【${msg.roleName}】${new Date(msg.timestamp).toLocaleString()}\n\n${msg.content}`
    navigator.clipboard.writeText(text)
    antdMessage.success('已复制到剪贴板')
  }

  const handleCopyAll = () => {
    if (!currentSession) return
    let text = `# ${currentSession.title}\n\n**问题**：${currentSession.problem}\n\n**阶段**：${getPhaseLabel(currentPhase)}\n\n---\n\n`
    currentSession.messages.forEach((msg) => {
      text += `## ${msg.roleName} (${getMessageTypeLabel(msg.type)})\n*${new Date(msg.timestamp).toLocaleString()}*\n\n${msg.content}\n\n---\n\n`
    })
    if (decisionReport) {
      text += `## 🎯 最终决策报告\n\n**决策**：${decisionReport.finalDecision}\n\n**决策理由**：${decisionReport.reasoning}\n\n`
    }
    navigator.clipboard.writeText(text)
    antdMessage.success('整个讨论已复制到剪贴板')
  }

  const handleExport = () => {
    if (!currentSession) return
    let markdown = `# ${currentSession.title}\n\n> **问题**：${currentSession.problem}\n\n讨论时间：${new Date(currentSession.createdAt).toLocaleString()}\n阶段：${getPhaseLabel(currentPhase)}\n\n## 参与角色\n\n`
    currentSession.roles.forEach((role) => {
      markdown += `- ${role.name}${role.isDecisionMaker ? ' (决策者)' : ''}\n`
    })
    markdown += `\n---\n\n## 讨论记录\n\n`
    currentSession.messages.forEach((msg, index) => {
      markdown += `### ${index + 1}. ${msg.roleName} - ${getMessageTypeLabel(msg.type)}\n*${new Date(msg.timestamp).toLocaleString()}*\n\n${msg.content}\n\n`
    })
    if (decisionReport) {
      markdown += `## 🎯 最终决策报告\n\n### 最终决策\n${decisionReport.finalDecision}\n\n### 决策理由\n${decisionReport.reasoning}\n\n`
    }
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Brainstorm-${currentSession.title.replace(/\s+/g, '-')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    antdMessage.success('导出成功')
  }

  const getPhaseLabel = (phase: EngineDiscussionPhase) => {
    switch (phase) {
      case 'divergence':
        return '发散阶段 (各抒己见)'
      case 'collision':
        return '碰撞阶段 (辩论质疑)'
      case 'convergence':
        return '收敛阶段 (决策总结)'
      case 'completed':
        return '讨论完成'
      default:
        return '准备中'
    }
  }

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'analysis':
        return '专业分析'
      case 'suggestion':
        return '改进建议'
      case 'question':
        return '质疑挑战'
      case 'decision':
        return '最终决策'
      default:
        return '发言'
    }
  }

  if (!currentSession) return null
  const isRunning = currentSession.status === 'discussing'

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#fafafa]">
      {/* 1. 响应式顶部状态栏 - 优化布局与层级 */}
      <header className="shrink-0 border-gray-200 border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 左侧：标题与状态 */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {isSidebarCollapsed && (
              <Button
                type="text"
                shape="circle"
                icon={<MenuUnfoldOutlined />}
                onClick={onToggleSidebar}
                className="h-10 w-10 shrink-0 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-green-600"
              />
            )}
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-3">
                <h4 className="m-0! truncate font-bold text-gray-900 text-lg" title={currentSession.title}>
                  {currentSession.title}
                </h4>
                <Tag
                  color={isRunning ? 'processing' : currentSession.status === 'decided' ? 'success' : 'default'}
                  className="m-0! rounded-full border-none px-2 py-0 font-bold text-[9px] uppercase tracking-wider">
                  {isRunning ? '讨论中' : currentSession.status === 'decided' ? '已决策' : '待开始'}
                </Tag>
              </div>
              <div className="truncate text-[11px] text-gray-400 opacity-80" title={currentSession.problem}>
                {currentSession.problem}
              </div>
            </div>
          </div>

          {/* 右侧：操作区 - 更加紧凑且专业 */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 sm:flex">
              <span className="font-bold text-[10px] text-gray-400 uppercase tracking-tighter">模型</span>
              <Select
                size="small"
                value={selectedProviderId}
                onChange={setSelectedProviderId}
                className="w-32 md:w-36"
                disabled={isRunning}
                variant="borderless"
                popupClassName="rounded-xl shadow-xl">
                {providers.map((p) => (
                  <Option key={p.id} value={p.id}>
                    <span className="font-medium text-xs">{p.name}</span>
                  </Option>
                ))}
              </Select>
            </div>

            <div className="mx-1 hidden h-6 w-px bg-gray-100 sm:block" />

            <Space size={8}>
              {isRunning ? (
                <Button
                  icon={<StopOutlined />}
                  danger
                  type="primary"
                  onClick={handleStop}
                  className="h-9 rounded-lg px-4 font-bold shadow-lg shadow-red-50/50">
                  停止讨论
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleStart}
                  className="h-9 rounded-lg border-none bg-green-600 px-4 font-bold shadow-green-100 shadow-lg hover:bg-green-700">
                  {currentSession.messages.length > 0 ? '重新开始' : '启动专家团'}
                </Button>
              )}

              <Tooltip title="更多操作">
                <Space.Compact size="small">
                  <Tooltip title="复制全文">
                    <Button icon={<CopyOutlined />} onClick={handleCopyAll} className="h-9 rounded-l-lg" />
                  </Tooltip>
                  <Tooltip title="导出 Markdown">
                    <Button icon={<DownloadOutlined />} onClick={handleExport} className="h-9" />
                  </Tooltip>
                  <Tooltip title={isRightSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>
                    <Button
                      icon={isRightSidebarCollapsed ? <TeamOutlined /> : <LayoutOutlined />}
                      onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
                      className="h-9 rounded-r-lg"
                    />
                  </Tooltip>
                </Space.Compact>
              </Tooltip>
            </Space>
          </div>
        </div>
      </header>

      {/* 2. 阶段导航 - 居中展示 */}
      <nav className="flex shrink-0 items-center justify-center border-gray-100 border-b bg-white px-6 py-2">
        <div className="flex items-center gap-12 lg:gap-20">
          {[
            { id: 'divergence', label: '发散', desc: '独立观点', icon: '1' },
            { id: 'collision', label: '碰撞', desc: '辩论质疑', icon: '2' },
            { id: 'convergence', label: '收敛', desc: '最终决策', icon: '3' }
          ].map((phase) => (
            <div
              key={phase.id}
              className={`flex items-center gap-2.5 transition-all duration-300 ${
                currentPhase === phase.id ? 'opacity-100' : 'opacity-30 grayscale'
              }`}>
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[10px] transition-colors ${
                  currentPhase === phase.id ? 'bg-green-600 text-white shadow-sm' : 'bg-gray-200 text-gray-500'
                }`}>
                {phase.icon}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-bold text-xs tracking-tight ${currentPhase === phase.id ? 'text-green-700' : 'text-gray-500'}`}>
                  {phase.label}
                </span>
                <span className="hidden font-medium text-[10px] text-gray-400 sm:inline">{phase.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* 3. 主讨论区 - 响应式双栏，支持侧边栏折叠 */}
      <main className="relative flex flex-1 gap-4 overflow-hidden bg-[#fafafa] p-3 md:gap-6 md:p-6">
        {/* 右侧展开按钮 - 当专家面板折叠时显示 */}
        {isRightSidebarCollapsed && (
          <div className="fade-in slide-in-from-right-2 absolute top-6 right-6 z-50 animate-in duration-300">
            <Tooltip title="显示专家团" placement="left">
              <Button
                type="text"
                shape="circle"
                icon={<VerticalLeftOutlined />}
                onClick={() => setIsRightSidebarCollapsed(false)}
                className="h-10 w-10 bg-white text-gray-500 shadow-md hover:bg-gray-50 hover:text-green-600"
              />
            </Tooltip>
          </div>
        )}

        {/* 左侧：时间轴（弹性宽） */}
        <section
          ref={messagesContainerRef}
          className="scrollbar-thin flex flex-1 flex-col overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-8">
          {currentSession.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-300 opacity-60">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 text-4xl">💭</div>
              <Text className="font-medium text-sm">点击上方“启动专家团”开启深度讨论</Text>
            </div>
          ) : (
            <Timeline
              items={currentSession.messages.map((msg) => ({
                color: msg.roleColor || '#16a34a',
                children: (
                  <Card
                    size="small"
                    className="mb-6 border-none bg-[#fcfcfc] shadow-none transition-all hover:bg-[#f8fcf9] hover:shadow-green-50/50 hover:shadow-md md:mb-8"
                    styles={{ body: { padding: '16px md:20px' } }}>
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 md:gap-4">
                        <Avatar
                          style={{ backgroundColor: msg.roleColor || '#16a34a' }}
                          size="large"
                          className="font-bold shadow-sm">
                          {msg.roleName[0]}
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800 text-sm">{msg.roleName}</span>
                          <div className="mt-0.5 flex items-center gap-2">
                            <Tag
                              color={msg.type === 'decision' ? 'gold' : 'green'}
                              className="m-0! rounded-md border-none px-2 py-0 font-bold text-[9px] uppercase tracking-wider">
                              {getMessageTypeLabel(msg.type)}
                            </Tag>
                            <span className="font-medium text-[10px] text-gray-400">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopyMessage(msg)}
                        className="text-gray-300 transition-colors hover:text-green-600"
                      />
                    </div>
                    <div className="prose prose-sm max-w-none pl-12 text-gray-700 leading-relaxed md:pl-14">
                      <ReactMarkdown>{msg.content || '正在深度思考中...'}</ReactMarkdown>
                    </div>
                  </Card>
                )
              }))}
            />
          )}
          <div ref={messagesEndRef} />
        </section>

        {/* 右侧：决策面板（支持折叠） */}
        <aside
          className={`scrollbar-hide flex shrink-0 flex-col gap-6 overflow-y-auto pb-6 transition-all duration-300 ease-in-out ${
            isRightSidebarCollapsed ? 'w-0 opacity-0' : 'w-64 opacity-100 lg:w-72'
          }`}>
          {decisionReport && (
            <Card
              title={
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <span className="font-bold text-gray-800 text-sm">最终决策报告</span>
                </div>
              }
              className="border-none bg-green-600 shadow-green-100 shadow-xl"
              styles={{
                header: { borderBottom: 'none', padding: '16px 16px 8px' },
                body: { padding: '0 16px 16px' }
              }}>
              <div className="space-y-4">
                <div className="rounded-xl bg-white/10 p-3 backdrop-blur-md">
                  <Text strong className="mb-1.5 block font-bold text-[9px] text-white/60 uppercase tracking-tighter">
                    最终结论
                  </Text>
                  <Text className="font-bold text-white text-xs leading-snug">{decisionReport.finalDecision}</Text>
                </div>
                {decisionReport.actionItems.length > 0 && (
                  <div className="space-y-2.5">
                    <Text strong className="block font-bold text-[9px] text-white/60 uppercase tracking-tighter">
                      后续行动项
                    </Text>
                    {decisionReport.actionItems.map((item, i) => (
                      <div key={i} className="flex flex-col rounded-xl bg-white p-2.5 shadow-sm">
                        <div className="flex items-start gap-1.5">
                          <div
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-red-500' : 'bg-orange-400'}`}
                          />
                          <span className="font-bold text-[11px] text-gray-800 leading-tight">{item.task}</span>
                        </div>
                        <div className="mt-2 flex justify-between font-bold text-[8px] text-gray-400 uppercase">
                          <span className="rounded bg-gray-50 px-1 py-0.5">👤 {item.owner}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card
            title={<span className="font-bold text-gray-800 text-xs">专家团阵容</span>}
            extra={
              <Button
                type="text"
                size="small"
                icon={<RightOutlined className="text-[10px]" />}
                onClick={() => setIsRightSidebarCollapsed(true)}
                className="text-gray-400 hover:text-green-600"
              />
            }
            size="small"
            className="rounded-2xl border-gray-100 shadow-sm"
            styles={{
              header: { background: '#fcfcfc', borderBottom: '1px solid #f0f0f0', padding: '10px 16px' },
              body: { padding: '4px 16px' }
            }}>
            <List
              dataSource={currentSession.roles}
              renderItem={(role) => (
                <List.Item
                  className="group cursor-pointer border-none px-0 py-2 transition-all hover:bg-gray-50"
                  onClick={() => setEditingRole({ ...role })}>
                  <div className="flex w-full items-center gap-3 px-2">
                    <Avatar
                      style={{ backgroundColor: role.color }}
                      size="small"
                      className="shadow-sm transition-transform group-hover:scale-110">
                      {role.name[0]}
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold text-[11px] text-gray-700 group-hover:text-green-600">
                        {role.name}
                      </span>
                      {role.isDecisionMaker && (
                        <span className="mt-0.5 font-bold text-[7px] text-green-600 uppercase tracking-widest">
                          Decision Maker
                        </span>
                      )}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </aside>
      </main>

      {/* 快速编辑专家弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <TypographyTitle level={4} className="m-0!">
              编辑专家配置
            </TypographyTitle>
          </div>
        }
        open={!!editingRole}
        onOk={handleUpdateRole}
        onCancel={() => setEditingRole(null)}
        okText="保存修改"
        cancelText="取消"
        centered
        width={500}
        styles={{ body: { paddingTop: '20px' } }}
        className="expert-edit-modal">
        {editingRole && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Text strong className="text-gray-500 text-xs uppercase">
                  角色名称
                </Text>
                <Input
                  value={editingRole.name}
                  onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                  placeholder="例如：产品经理"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Text strong className="text-gray-500 text-xs uppercase">
                  角色颜色
                </Text>
                <Input
                  type="color"
                  value={editingRole.color}
                  onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg p-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Text strong className="text-gray-500 text-xs uppercase">
                  决策权
                </Text>
                <Switch
                  checked={editingRole.isDecisionMaker}
                  onChange={(checked) => setEditingRole({ ...editingRole, isDecisionMaker: checked })}
                  size="small"
                />
              </div>
              <Text className="block text-[10px] text-gray-400">决策者将在最后阶段汇总所有观点并给出最终结论。</Text>
            </div>

            <div className="space-y-2">
              <Text strong className="text-gray-500 text-xs uppercase">
                系统提示词 (System Prompt)
              </Text>
              <TextArea
                rows={6}
                value={editingRole.systemPrompt}
                onChange={(e) => setEditingRole({ ...editingRole, systemPrompt: e.target.value })}
                placeholder="定义该专家的专业背景、分析视角和思维模式..."
                className="rounded-xl"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
