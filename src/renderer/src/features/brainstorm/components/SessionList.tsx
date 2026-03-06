/**
 * SessionList - 会话列表组件
 * 极简列表设计，对齐 Cherry Studio 侧边栏风格
 */

import { DeleteOutlined, EditOutlined, MessageOutlined } from '@ant-design/icons'
import { Button, List, Tooltip, Typography } from 'antd'

import { useBrainstorm } from '../context/BrainstormContext'

const { Text } = Typography

interface SessionListProps {
  onEdit?: (sessionId: string) => void
}

export function SessionList({ onEdit }: SessionListProps) {
  const { state, setCurrentSession, deleteSession, currentSession } = useBrainstorm()

  if (state.sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <MessageOutlined className="mb-3 text-3xl text-gray-200" />
        <Text type="secondary" className="text-xs">
          暂无历史讨论
        </Text>
      </div>
    )
  }

  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-3">
      <List
        dataSource={state.sessions}
        split={false}
        renderItem={(session) => {
          const isActive = currentSession?.id === session.id
          return (
            <List.Item
              className={`group mb-2 cursor-pointer rounded-xl px-4 py-3.5 transition-all duration-200 ${
                isActive ? 'bg-green-50 text-green-700 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setCurrentSession(session.id)}>
              <div className="flex w-full flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`flex-1 truncate font-semibold text-sm ${isActive ? 'text-green-700' : 'text-gray-700 group-hover:text-gray-900'}`}
                    title={session.title}>
                    {session.title}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Tooltip title="编辑会话">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined className="text-xs" />}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit?.(session.id)
                        }}
                        className="flex h-6 w-6 items-center justify-center text-gray-400 hover:bg-white hover:text-green-600"
                      />
                    </Tooltip>
                    <Tooltip title="删除会话">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined className="text-xs" />}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(session.id)
                        }}
                        className="flex h-6 w-6 items-center justify-center hover:bg-white"
                      />
                    </Tooltip>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        session.status === 'discussing'
                          ? 'animate-pulse bg-green-500'
                          : session.status === 'decided'
                            ? 'bg-blue-500'
                            : 'bg-gray-300'
                      }`}
                    />
                    <span className="font-medium text-[10px] text-gray-400 uppercase tracking-tight">
                      {session.status === 'idle' && '准备中'}
                      {session.status === 'discussing' && '讨论中'}
                      {session.status === 'paused' && '已暂停'}
                      {session.status === 'decided' && '已完成'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 tabular-nums opacity-60">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </List.Item>
          )
        }}
      />
    </div>
  )
}
