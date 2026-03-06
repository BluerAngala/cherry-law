/**
 * RoleConfigPanel - 角色配置面板
 * 极简卡片设计，增强视觉一致性
 */

import { DeleteOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Checkbox, Input, Tooltip, Typography } from 'antd'

import type { AgentRole } from '../types'

const { Text } = Typography

interface RoleConfigPanelProps {
  roles: Omit<AgentRole, 'id'>[]
  onChange: (roles: Omit<AgentRole, 'id'>[]) => void
}

export function RoleConfigPanel({ roles, onChange }: RoleConfigPanelProps) {
  const addRole = () => {
    onChange([
      ...roles,
      {
        name: `新专家 ${roles.length + 1}`,
        systemPrompt: '',
        modelId: 'default',
        order: roles.length,
        isDecisionMaker: false,
        color: '#16a34a' // 使用 Tailwind green-600
      }
    ])
  }

  const removeRole = (index: number) => {
    const newRoles = roles.filter((_, i) => i !== index)
    onChange(newRoles.map((role, i) => ({ ...role, order: i })))
  }

  const updateRole = (index: number, updates: Partial<Omit<AgentRole, 'id'>>) => {
    const newRoles = [...roles]
    newRoles[index] = { ...newRoles[index], ...updates }
    onChange(newRoles)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserOutlined className="text-green-600" />
          <Text strong className="text-gray-700">
            配置专家团队 ({roles.length})
          </Text>
        </div>
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={addRole}
          className="rounded-lg border-green-200 text-green-600 hover:border-green-500 hover:text-green-700">
          新增专家
        </Button>
      </div>

      <div className="space-y-4">
        {roles.map((role, index) => (
          <div
            key={index}
            className={`group relative rounded-2xl border-2 p-5 transition-all ${role.isDecisionMaker ? 'border-green-100 bg-green-50/20' : 'border-gray-100 bg-white'}`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-500 text-xs">
                    {index + 1}
                  </div>
                  <Input
                    placeholder="专家职称，如：资深产品经理"
                    value={role.name}
                    onChange={(e) => updateRole(index, { name: e.target.value })}
                    className="h-10 border-none bg-transparent p-0 font-bold text-base text-gray-800 placeholder:text-gray-300 focus:ring-0"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Tooltip title="决策者负责最终总结和结论定稿">
                    <Checkbox
                      checked={role.isDecisionMaker}
                      onChange={(e) => updateRole(index, { isDecisionMaker: e.target.checked })}
                      className="font-medium text-gray-500 text-xs">
                      决策者
                    </Checkbox>
                  </Tooltip>

                  {roles.length > 1 && (
                    <Button
                      type="text"
                      danger
                      shape="circle"
                      icon={<DeleteOutlined />}
                      onClick={() => removeRole(index)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  )}
                </div>
              </div>

              <Input.TextArea
                placeholder="定义该专家的专业背景、性格特征和思考逻辑..."
                value={role.systemPrompt}
                onChange={(e) => updateRole(index, { systemPrompt: e.target.value })}
                rows={3}
                className="rounded-xl border-gray-100 bg-gray-50/50 p-3 text-gray-600 text-sm transition-all placeholder:text-gray-300 hover:border-gray-200 focus:border-green-400 focus:bg-white"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
