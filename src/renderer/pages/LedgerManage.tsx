import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Card, Button, Modal, Form, Input, Select, Popconfirm, Space, Empty,
  Typography, Row, Col, App, Statistic, Tag
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MergeCellsOutlined,
  ArrowRightOutlined, WalletOutlined, FileTextOutlined, TagsOutlined
} from '@ant-design/icons'
import type { RootState, AppDispatch } from '../store'
import { fetchLedgers, addLedger, updateLedger, deleteLedger, mergeLedger } from '../store/slices/ledgersSlice'
import { getApi } from '../api/mock'

const { Title, Text } = Typography

const LEDGER_ICONS = ['📒', '✈️', '🍔', '🏠', '🎓', '💼', '🎯', '🎵', '🐱', '🌈', '🚗', '📱']
const LEDGER_COLORS = ['#667eea', '#FF6B6B', '#4ECDC4', '#F39C12', '#2ECC71', '#9B59B6', '#1ABC9C', '#E91E63', '#3498DB', '#FF9800', '#00BCD4', '#795548']

export default function LedgerManage() {
  const dispatch = useDispatch<AppDispatch>()
  const { items: ledgers } = useSelector((state: RootState) => state.ledgers)
  const { message: msgApi } = App.useApp()

  const [editVisible, setEditVisible] = useState(false)
  const [mergeVisible, setMergeVisible] = useState(false)
  const [editingLedger, setEditingLedger] = useState<any>(null)
  const [form] = Form.useForm()
  const [mergeForm] = Form.useForm()
  const [stats, setStats] = useState<Map<number, { records: number; accounts: number; categories: number }>>(new Map())

  const loadStats = async () => {
    const api = getApi()
    if (api.getLedgerStats) {
      const s = await api.getLedgerStats()
      if (s instanceof Map) {
        setStats(s)
      } else if (Array.isArray(s)) {
        const map = new Map<number, { records: number; accounts: number; categories: number }>()
        s.forEach((item: any) => {
          if (item.id != null) {
            map.set(item.id, { records: item.records || 0, accounts: item.accounts || 0, categories: item.categories || 0 })
          }
        })
        setStats(map)
      }
    }
  }

  useEffect(() => {
    dispatch(fetchLedgers() as any)
  }, [dispatch])

  useEffect(() => {
    if (ledgers.length > 0) {
      loadStats()
    }
  }, [ledgers.length])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingLedger) {
        await dispatch(updateLedger({ id: editingLedger.id, ledger: values }) as any).unwrap()
        msgApi.success('账本更新成功')
      } else {
        await dispatch(addLedger(values) as any).unwrap()
        msgApi.success('账本创建成功')
      }
      setEditVisible(false)
      setEditingLedger(null)
      form.resetFields()
      dispatch(fetchLedgers() as any)
      setTimeout(loadStats, 300)
    } catch {
      // validation error
    }
  }

  const openNew = () => {
    setEditingLedger(null)
    form.resetFields()
    const randomIcon = LEDGER_ICONS[Math.floor(Math.random() * LEDGER_ICONS.length)]
    const randomColor = LEDGER_COLORS[Math.floor(Math.random() * LEDGER_COLORS.length)]
    form.setFieldsValue({ icon: randomIcon, color: randomColor })
    setEditVisible(true)
  }

  const openEdit = (ledger: any) => {
    setEditingLedger(ledger)
    form.setFieldsValue({ name: ledger.name, icon: ledger.icon, color: ledger.color })
    setEditVisible(true)
  }

  const handleDelete = async (id: number) => {
    if (ledgers.length <= 1) {
      msgApi.warning('至少保留一个账本')
      return
    }
    await dispatch(deleteLedger(id) as any).unwrap()
    msgApi.success('账本已删除')
    dispatch(fetchLedgers() as any)
  }

  const openMerge = () => {
    mergeForm.resetFields()
    setMergeVisible(true)
  }

  const handleMerge = async () => {
    const values = await mergeForm.validateFields()
    if (values.sourceId === values.targetId) {
      msgApi.error('源账本和目标账本不能相同')
      return
    }
    const result = await dispatch(mergeLedger({ sourceId: values.sourceId, targetId: values.targetId }) as any).unwrap()
    const mergedCats = result.mergedCategories || 0
    const mergedAccs = result.mergedAccounts || 0
    let detail = '账本合并成功'
    if (mergedCats > 0 || mergedAccs > 0) {
      const parts: string[] = []
      if (mergedCats > 0) parts.push(`合并了 ${mergedCats} 个相同类别`)
      if (mergedAccs > 0) parts.push(`合并了 ${mergedAccs} 个相同账户（余额已累加）`)
      detail += '：' + parts.join('，')
    }
    msgApi.success(detail)
    setMergeVisible(false)
    mergeForm.resetFields()
    dispatch(fetchLedgers() as any)
    setTimeout(loadStats, 300)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', overflowY: 'auto', padding: '0 2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>账本管理</Title>
        <Space>
          <Button icon={<MergeCellsOutlined />} onClick={openMerge} disabled={ledgers.length < 2}>
            合并账本
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            新建账本
          </Button>
        </Space>
      </div>

      {ledgers.length === 0 ? (
        <Empty description="暂无账本，请创建" />
      ) : (
        <Row gutter={[16, 16]}>
          {ledgers.map(ledger => {
            const s = stats.get(ledger.id!) || { records: 0, accounts: 0, categories: 0 }
            return (
              <Col xs={24} sm={12} key={ledger.id}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 12,
                    borderTop: `4px solid ${ledger.color}`,
                    height: '100%'
                  }}
                  actions={[
                    <EditOutlined key="edit" onClick={() => openEdit(ledger)} />,
                    <Popconfirm
                      key="delete"
                      title="确定删除此账本？"
                      description="删除后该账本下的数据将无法查看"
                      onConfirm={() => handleDelete(ledger.id!)}
                      okText="确认"
                      cancelText="取消"
                    >
                      <DeleteOutlined />
                    </Popconfirm>
                  ]}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: `${ledger.color}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24
                    }}>
                      {ledger.icon}
                    </div>
                    <div>
                      <Text strong style={{ fontSize: 16 }}>{ledger.name}</Text>
                      {ledger.isDefault === 1 && (
                        <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>默认</Tag>
                      )}
                    </div>
                  </div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Statistic
                        title={<span><FileTextOutlined /> 记账记录</span>}
                        value={s.records}
                        suffix="条"
                        valueStyle={{ color: '#667eea', fontSize: 20 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={<span><WalletOutlined /> 账户个数</span>}
                        value={s.accounts}
                        suffix="个"
                        valueStyle={{ color: '#4ECDC4', fontSize: 20 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={<span><TagsOutlined /> 记账类别</span>}
                        value={s.categories}
                        suffix="类"
                        valueStyle={{ color: '#F39C12', fontSize: 20 }}
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 12, color: '#999', fontSize: 12 }}>
                    创建时间：{ledger.createdAt ? new Date(ledger.createdAt).toLocaleDateString('zh-CN') : '-'}
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <Modal
        title={editingLedger ? '编辑账本' : '新建账本'}
        open={editVisible}
        onOk={handleSubmit}
        onCancel={() => { setEditVisible(false); setEditingLedger(null); form.resetFields() }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="账本名称" rules={[{ required: true, message: '请输入账本名称' }]}>
            <Input placeholder="例如：日常账本、旅行基金" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Select>
              {LEDGER_ICONS.map(icon => (
                <Select.Option key={icon} value={icon}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Select>
              {LEDGER_COLORS.map(color => (
                <Select.Option key={color} value={color}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: color }} />
                    <span>{color}</span>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="合并账本"
        open={mergeVisible}
        onOk={handleMerge}
        onCancel={() => setMergeVisible(false)}
        okText="合并"
        cancelText="取消"
      >
        <Form form={mergeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="sourceId" label="源账本（将被合并）" rules={[{ required: true, message: '请选择源账本' }]}>
            <Select placeholder="选择要合并的账本">
              {ledgers.map(l => (
                <Select.Option key={l.id} value={l.id}>{l.icon} {l.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="targetId" label="目标账本（合并到）" rules={[{ required: true, message: '请选择目标账本' }]}>
            <Select placeholder="选择目标账本">
              {ledgers.map(l => (
                <Select.Option key={l.id} value={l.id}>{l.icon} {l.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{
            padding: 12, background: '#f6f8fa', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12,
            justifyContent: 'center', fontSize: 13, color: '#666'
          }}>
            <span>源账本</span>
            <ArrowRightOutlined />
            <span>目标账本</span>
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            合并后源账本的所有记录、账户、分类和预算将转移到目标账本，源账本将被删除。
          </Text>
        </Form>
      </Modal>
    </div>
  )
}
