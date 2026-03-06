/**
 * BrainstormPage - 头脑风暴主页面
 * 采用极简主义设计，对齐 Cherry Studio 整体美学
 */

import { ArrowLeftOutlined, BulbOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined } from '@ant-design/icons'
import { Navbar, NavbarCenter, NavbarRight } from '@renderer/components/app/Navbar'
import { Button, Collapse, Input, message, Space, Tag, Tooltip, Typography } from 'antd'
import { useState } from 'react'

import { ALL_ROLE_TEMPLATES, getRoleTemplateById } from '../config/roleTemplates'
import { useBrainstorm } from '../context/BrainstormContext'
import type { AgentRole } from '../types'
import { DiscussionPanel } from './DiscussionPanel'
import { RoleConfigPanel } from './RoleConfigPanel'
import { SessionList } from './SessionList'

const { Title, Text } = Typography

export function BrainstormPage() {
  const { createSession, currentSession, setCurrentSession, dispatch, state } = useBrainstorm()
  const [problem, setProblem] = useState('')
  const [title, setTitle] = useState('')
  const defaultTemplate = ALL_ROLE_TEMPLATES[0]
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(defaultTemplate.id)
  const [roles, setRoles] = useState<Omit<AgentRole, 'id'>[]>(defaultTemplate.roles)
  const [showNewSession, setShowNewSession] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<string | undefined>('1')

  // 处理模板切换
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = getRoleTemplateById(templateId)
    if (template) {
      setRoles(template.roles)
    }
  }

  const handleCreateSession = () => {
    if (!title.trim()) {
      message.error('请输入会话标题')
      return
    }
    if (!problem.trim() || problem.trim().length < 10) {
      message.error('问题描述至少需要10个字符')
      return
    }
    if (roles.length === 0) {
      message.error('请至少添加一个参与角色')
      return
    }
    if (!roles.some((r) => r.isDecisionMaker)) {
      message.error('请至少指定一个决策者')
      return
    }

    if (editingSessionId) {
      dispatch({
        type: 'UPDATE_SESSION',
        payload: {
          id: editingSessionId,
          title: title.trim(),
          problem: problem.trim(),
          roles: roles.map((r, i) => ('id' in r ? r : { ...r, id: `role-${Date.now()}-${i}` }))
        }
      })
      message.success('会话更新成功')
    } else {
      createSession({
        title: title.trim(),
        problem: problem.trim(),
        roles
      })
      message.success('会话创建成功')
    }

    setProblem('')
    setTitle('')
    setEditingSessionId(null)
    setShowNewSession(false)
    setActiveStep('1')
  }

  const handleNewSession = () => {
    setCurrentSession(null)
    setEditingSessionId(null)
    setTitle('')
    setProblem('')
    setRoles(defaultTemplate.roles)
    setSelectedTemplateId(defaultTemplate.id)
    setShowNewSession(true)
    setActiveStep('1')
  }

  const handleEditSession = (sessionId: string) => {
    const session = state.sessions.find((s) => s.id === sessionId)
    if (session) {
      setCurrentSession(null)
      setEditingSessionId(sessionId)
      setTitle(session.title)
      setProblem(session.problem)
      setRoles(session.roles)
      setShowNewSession(true)
      setActiveStep('1') // 编辑时默认展开第一步
    }
  }

  // 检查是否满足开启条件
  const canStart = title.trim() && problem.trim() && problem.trim().length >= 10

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#fafafa]">
      {/* 顶部导航栏 - 提供窗口控制 */}
      <Navbar>
        <NavbarCenter />
        <NavbarRight />
      </Navbar>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧会话列表 */}
        <div
          className={`relative flex shrink-0 flex-col border-gray-200 border-r bg-white transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'w-0 opacity-0' : 'w-64 opacity-100 sm:w-72'
          }`}>
          <div className="flex items-center justify-between px-5 py-4">
            <Title level={5} className="m-0! font-bold text-gray-800">
              头脑风暴
            </Title>
            <Space size={4}>
              <Tooltip title="新建会话">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleNewSession}
                  className="text-gray-400 hover:text-green-600"
                />
              </Tooltip>
              <Tooltip title="收起列表">
                <Button
                  type="text"
                  size="small"
                  icon={<MenuFoldOutlined />}
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="text-gray-400 hover:text-green-600"
                />
              </Tooltip>
            </Space>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden border-gray-100 border-t">
            <SessionList onEdit={handleEditSession} />
          </div>
          {!isSidebarCollapsed && (
            <div className="border-gray-100 border-t px-5 py-4">
              <Button
                type="primary"
                block
                size="large"
                onClick={handleNewSession}
                className="h-11 rounded-xl border-none bg-green-600 font-medium shadow-sm hover:bg-green-700">
                新建会话
              </Button>
            </div>
          )}
        </div>

        {/* 展开按钮 - 当侧边栏折叠时显示在左上角 */}
        {/* 已移动到右侧内容区内部渲染，防止与主侧边栏重叠 */}

        {/* 右侧内容区 */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {currentSession ? (
            <DiscussionPanel
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white">
              {isSidebarCollapsed && !showNewSession && (
                <div className="absolute top-4 left-4 z-50">
                  <Tooltip title="展开侧边栏" placement="right">
                    <Button
                      type="text"
                      shape="circle"
                      icon={<MenuUnfoldOutlined />}
                      onClick={() => setIsSidebarCollapsed(false)}
                      className="h-10 w-10 bg-white text-gray-500 shadow-md hover:bg-gray-50 hover:text-green-600"
                    />
                  </Tooltip>
                </div>
              )}
              {!showNewSession ? (
                <div className="fade-in zoom-in-95 max-w-lg animate-in text-center duration-500">
                  <div className="mb-8 inline-flex h-24 w-24 items-center justify-center rounded-4xl bg-green-50 text-green-600 shadow-sm">
                    <BulbOutlined className="text-5xl" />
                  </div>
                  <Title level={2} className="mb-4 font-bold text-gray-900 tracking-tight">
                    开启深度头脑风暴
                  </Title>
                  <Text className="mb-10 block text-gray-500 text-lg leading-relaxed">
                    汇聚 AI 专家团的力量，通过多维度的观点碰撞与逻辑博弈，助你做出更明智的决策。
                  </Text>
                  <Button
                    type="primary"
                    size="large"
                    onClick={handleNewSession}
                    className="h-14 rounded-2xl border-none bg-green-600 px-12 font-bold text-lg shadow-green-100 shadow-lg transition-all hover:scale-[1.02] hover:bg-green-700 active:scale-[0.98]">
                    立即开始
                  </Button>
                </div>
              ) : (
                <div className="fade-in slide-in-from-bottom-4 mx-auto flex h-full w-full max-w-4xl animate-in flex-col bg-white shadow-2xl duration-500">
                  {/* 固定页眉 */}
                  <div className="flex shrink-0 items-center gap-4 border-gray-100 border-b bg-gray-50/30 px-8 py-4">
                    {isSidebarCollapsed ? (
                      <Button
                        type="text"
                        shape="circle"
                        icon={<MenuUnfoldOutlined />}
                        onClick={() => setIsSidebarCollapsed(false)}
                        className="h-10 w-10 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-green-600"
                      />
                    ) : (
                      <Button
                        type="text"
                        shape="circle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => setShowNewSession(false)}
                        className="text-gray-400 hover:bg-white"
                      />
                    )}
                    <div>
                      <Title level={3} className="m-0! font-bold text-gray-900">
                        {editingSessionId ? '编辑讨论会话' : '新建讨论会话'}
                      </Title>
                      <Text type="secondary" className="text-xs">
                        {editingSessionId ? '修改当前讨论的配置和专家团' : '配置话题和专家团，开启一次深度思辨之旅'}
                      </Text>
                    </div>
                  </div>

                  {/* 可滚动表单区域 */}
                  <div className="scrollbar-thin flex-1 overflow-y-auto px-12 py-4">
                    <Collapse
                      activeKey={activeStep}
                      onChange={(key) => setActiveStep(Array.isArray(key) ? key[0] : key)}
                      accordion
                      ghost
                      expandIconPosition="end"
                      className="brainstorm-steps-collapse">
                      {/* 步骤 1: 话题设置 */}
                      <Collapse.Panel
                        key="1"
                        header={
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 font-bold text-white text-xs">
                              1
                            </span>
                            <Title level={4} className="m-0! text-gray-800">
                              话题设置
                            </Title>
                          </div>
                        }>
                        <div className="space-y-4 pb-2 pl-10">
                          <div className="space-y-2">
                            <Text strong className="text-gray-700">
                              讨论标题
                            </Text>
                            <Input
                              size="large"
                              placeholder="给这次讨论起个名字，例如：2024 年度营销方案取舍"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              className="h-12 rounded-xl border-gray-200 bg-white px-4 shadow-sm hover:border-green-400 focus:border-green-500"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <Text strong className="text-gray-700">
                                核心问题描述
                              </Text>
                              <Tag
                                color={problem.trim().length < 10 ? 'orange' : 'green'}
                                className="m-0! rounded-full border-none px-3 font-bold text-[10px] uppercase tracking-wider">
                                {problem.trim().length < 10
                                  ? `至少还需 ${10 - problem.trim().length} 字`
                                  : '✓ 已满足长度要求'}
                              </Tag>
                            </div>
                            <Input.TextArea
                              placeholder="请尽可能详细地描述您的问题背景、目标、已知约束条件以及需要决策的具体事项。描述越详尽，专家的建议就越具参考价值。"
                              rows={4}
                              value={problem}
                              onChange={(e) => setProblem(e.target.value)}
                              className="rounded-2xl border-gray-200 bg-white p-4 shadow-sm hover:border-green-400 focus:border-green-500"
                            />
                          </div>
                        </div>
                      </Collapse.Panel>

                      {/* 步骤 2: 模式选择 */}
                      <Collapse.Panel
                        key="2"
                        header={
                          <div className="flex items-center gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 font-bold text-[10px] text-white">
                              2
                            </span>
                            <Title level={5} className="m-0! text-gray-800">
                              选择专家模式
                            </Title>
                          </div>
                        }>
                        <div className="grid grid-cols-1 gap-3 pb-2 pl-10 sm:grid-cols-2 lg:grid-cols-3">
                          {ALL_ROLE_TEMPLATES.map((template) => (
                            <div
                              key={template.id}
                              onClick={() => handleTemplateChange(template.id)}
                              className={`group cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                                selectedTemplateId === template.id
                                  ? 'border-green-600 bg-green-50/30'
                                  : 'border-gray-100 bg-white shadow-sm hover:border-gray-200'
                              }`}>
                              <div className="mb-2 text-2xl transition-transform group-hover:scale-110">
                                {template.id === 'product' ? '🚀' : template.id === 'general' ? '🧠' : '🛠️'}
                              </div>
                              <div className="mb-0.5 font-bold text-gray-900 text-sm">{template.name}</div>
                              <div className="line-clamp-1 text-[10px] text-gray-500 leading-relaxed">
                                {template.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Collapse.Panel>

                      {/* 步骤 3: 专家团队精修 */}
                      <Collapse.Panel
                        key="3"
                        header={
                          <div className="flex items-center gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 font-bold text-[10px] text-white">
                              3
                            </span>
                            <Title level={5} className="m-0! text-gray-800">
                              自定义专家团队
                            </Title>
                          </div>
                        }>
                        <div className="pb-4 pl-10">
                          <RoleConfigPanel roles={roles} onChange={setRoles} />
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                  </div>

                  {/* 固定页脚操作栏 */}
                  <div className="flex shrink-0 items-center justify-between border-gray-100 border-t bg-white px-8 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <Text type="secondary" className="text-xs">
                        {roles.length} 位专家已就绪
                      </Text>
                    </div>
                    <div className="flex gap-4">
                      <Button
                        size="large"
                        onClick={() => setShowNewSession(false)}
                        className="h-12 rounded-xl border-gray-200 px-8 text-gray-500 hover:text-gray-700">
                        取消
                      </Button>
                      <Tooltip title={!canStart ? '请先填写讨论标题和至少10个字的问题描述' : ''}>
                        <Button
                          type="primary"
                          size="large"
                          onClick={handleCreateSession}
                          disabled={!canStart}
                          className={`h-12 rounded-xl border-none px-12 font-bold shadow-lg transition-all ${
                            canStart
                              ? 'bg-green-600 shadow-green-100 hover:bg-green-700'
                              : 'bg-gray-200 text-gray-400 shadow-none'
                          }`}>
                          开启专家讨论
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
