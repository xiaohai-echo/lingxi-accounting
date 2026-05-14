import React, { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Card, List, Button, Popconfirm, Tag, Empty, Space, Select } from 'antd'
import { ClearOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RootState } from '../store'
import { fetchLogs, clearLogs } from '../store/slices/logsSlice'

const actionConfig: Record<string, { color: string; label: string }> = {
  add_record: { color: '#52c41a', label: '新增记录' },
  edit_record: { color: '#1677FF', label: '编辑记录' },
  delete_record: { color: '#ff4d4f', label: '删除记录' },
  refund_record: { color: '#faad14', label: '退款' },
  transfer: { color: '#667eea', label: '转账' },
  withdraw: { color: '#faad14', label: '提现' },
  recharge: { color: '#52c41a', label: '充值' },
  add_account: { color: '#52c41a', label: '新增账户' },
  edit_account: { color: '#1677FF', label: '编辑账户' },
  delete_account: { color: '#ff4d4f', label: '删除账户' },
  add_category: { color: '#52c41a', label: '新增类别' },
  edit_category: { color: '#1677FF', label: '编辑类别' },
  delete_category: { color: '#ff4d4f', label: '删除类别' },
  add_budget: { color: '#52c41a', label: '新增预算' },
  edit_budget: { color: '#1677FF', label: '编辑预算' },
  delete_budget: { color: '#ff4d4f', label: '删除预算' },
  login: { color: '#667eea', label: '登录' },
}

interface LogsProps {
  isDark?: boolean
}

const Logs: React.FC<LogsProps> = ({ isDark = true }) => {
  const dispatch = useDispatch()
  const { items: logs, loading } = useSelector((state: RootState) => state.logs)
  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const [filterAction, setFilterAction] = React.useState<string | undefined>(undefined)

  useEffect(() => {
    dispatch(fetchLogs() as any)
  }, [dispatch])

  const filteredLogs = filterAction
    ? logs.filter(l => l.action === filterAction)
    : logs

  const formatTime = (log: { createdAt?: string }) => {
    if (!log.createdAt) return ''
    return dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')
  }

  return (
    <div>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}><FileTextOutlined style={{ marginRight: 8 }} />操作日志</span>
            <Space>
              <Select
                allowClear
                placeholder="筛选操作类型"
                style={{ width: 150 }}
                size="small"
                value={filterAction}
                onChange={setFilterAction}
              >
                {Object.entries(actionConfig).map(([key, cfg]) => (
                  <Select.Option key={key} value={key}>{cfg.label}</Select.Option>
                ))}
              </Select>
              <Popconfirm title="确定要清空所有日志吗？" onConfirm={() => dispatch(clearLogs() as any)} okText="确定" cancelText="取消">
                <Button size="small" danger icon={<ClearOutlined />}>清空日志</Button>
              </Popconfirm>
            </Space>
          </div>
        }
      >
        {filteredLogs.length === 0 ? (
          <Empty description={<span style={{ color: SECONDARY }}>暂无操作日志</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            loading={loading}
            dataSource={filteredLogs}
            pagination={{ pageSize: 20, size: 'small', showTotal: (total) => `共 ${total} 条` }}
            renderItem={(log) => {
              const cfg = actionConfig[log.action] || { color: '#999', label: log.action }
              return (
                <List.Item style={{ padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12 }}>
                    <Tag color={cfg.color} style={{ minWidth: 80, textAlign: 'center', fontWeight: 500, margin: 0 }}>
                      {cfg.label}
                    </Tag>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{log.target}</div>
                      {log.detail && <div style={{ fontSize: 12, color: SECONDARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.detail}</div>}
                    </div>
                    <div style={{ fontSize: 13, color: SECONDARY, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatTime(log)}
                    </div>
                  </div>
                </List.Item>
              )
            }}
          />
        )}
      </Card>
    </div>
  )
}

export default Logs
