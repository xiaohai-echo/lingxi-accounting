import React, { useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Card, Button, Modal, Form, Input, InputNumber, Select, App, Popconfirm, Tabs, Row, Col, List, Empty, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { addCategory, updateCategory, deleteCategory } from '../store/slices/categoriesSlice'
import { deleteRecord } from '../store/slices/recordsSlice'
import type { Category, Record as RecordType } from '../../main/database/schema'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from '../utils/constants'

const { Option } = Select

interface CategoriesProps {
  isDark?: boolean
  onViewCategoryRecords?: (categoryId: number) => void
}

const Categories: React.FC<CategoriesProps> = ({ isDark = true, onViewCategoryRecords }) => {
  const { message } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { items: records } = useSelector((state: RootState) => state.records)
  const { items: accounts } = useSelector((state: RootState) => state.accounts)
  const { currentLedgerId } = useSelector((state: RootState) => state.ledgers)

  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const TEXT_COLOR = isDark ? '#e0e0e0' : '#1a1a1a'
  const SUBTLE = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const CARD_BG = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
  const CARD_BORDER = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const NOTE_COLOR = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'

  const PRESET_ICONS = ['🍜','🚗','🛒','🎮','🏠','🏥','📚','📱','👗','🧴','🎁','⚡','💻','🏃','💇','🐱','✈️','🍺','📎','📦','💰','🎉','📈','💼','🏦','🧧','📋','🔑','↩️','📥','☕','🍕','💊','🎬','🎵','🌸','📖','🎓','🎂','🔥']
  const [selectedIcon, setSelectedIcon] = useState('')
  const [customIcon, setCustomIcon] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form] = Form.useForm()
  const [recordsVisible, setRecordsVisible] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

  const expenseCategories = categories.filter(c => c.type === 'expense')
  const incomeCategories = categories.filter(c => c.type === 'income')

  const getAccountById = (id: number) => accounts.find(a => a.id === id)

  const renderAccountTag = (accountId: number) => {
    const acc = getAccountById(accountId)
    if (!acc) return null
    const icon = ACCOUNT_TYPE_ICONS[acc.type] || '💰'
    const color = ACCOUNT_TYPE_COLORS[acc.type] || '#667eea'
    const label = acc.cardNo ? `${acc.name} (尾号${acc.cardNo})` : acc.name
    return (
      <span className="payment-tag" style={{ background: color + '22', color, border: `1px solid ${color}33` }}>
        {icon} {label}
      </span>
    )
  }

  const categoryRecords = useMemo(() => {
    if (!selectedCategory) return []
    return records
      .filter(r => !r.isDeleted && r.categoryId === selectedCategory.id)
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
  }, [selectedCategory, records])

  const categoryTotal = useMemo(() => {
    if (!selectedCategory) return 0
    return categoryRecords.reduce((sum, r) => {
      if (selectedCategory.type === 'expense') {
        if (r.type === 'expense') {
          const effective = r.refundAmount ? Math.max(0, r.amount - r.refundAmount + (r.shippingFee || 0)) : r.amount
          return sum + effective
        }
        return sum
      }
      return sum + (r.type === 'income' ? r.amount : 0)
    }, 0)
  }, [selectedCategory, categoryRecords])

  const handleAdd = (type: 'income' | 'expense') => {
    setEditingCategory(null)
    setSelectedIcon('')
    setCustomIcon('')
    form.resetFields()
    form.setFieldsValue({
      type,
      color: type === 'expense' ? '#ff4d4f' : '#52c41a',
      sortOrder: categories.length,
      icon: ''
    })
    setIsModalOpen(true)
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    const icon = category.icon || ''
    setSelectedIcon(PRESET_ICONS.includes(icon) ? icon : '')
    setCustomIcon(PRESET_ICONS.includes(icon) ? '' : icon)
    form.setFieldsValue({
      name: category.name,
      type: category.type,
      icon,
      color: category.color,
      sortOrder: category.sortOrder
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await dispatch(deleteCategory(id)).unwrap()
      message.success('分类删除成功！')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const category = {
        name: values.name,
        type: values.type,
        icon: values.icon || '📝',
        color: values.color,
        ledgerId: currentLedgerId ?? undefined,
        isDefault: 0,
        sortOrder: values.sortOrder,
        isDeleted: 0
      }

      if (editingCategory) {
        await dispatch(updateCategory({ id: editingCategory.id!, category })).unwrap()
        message.success('分类更新成功！')
      } else {
        await dispatch(addCategory(category)).unwrap()
        message.success('分类添加成功！')
      }
      setIsModalOpen(false)
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const showCategoryRecords = (category: Category) => {
    setSelectedCategory(category)
    setRecordsVisible(true)
  }

  const handleDeleteRecord = async (id: number) => {
    try {
      await dispatch(deleteRecord(id)).unwrap()
      message.success('记录删除成功！')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const renderRecordForCategory = (record: RecordType) => {
    const isRefunded = record.refundStatus && record.refundStatus !== 'none'
    const effectiveAmount = record.type === 'expense' && record.refundAmount
      ? Math.max(0, record.amount - record.refundAmount + (record.shippingFee || 0))
      : record.amount

    return (
      <List.Item
        actions={[
          <Popconfirm
            title="确定要删除这条记录吗？"
            onConfirm={() => handleDeleteRecord(record.id!)}
            okText="确定" cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        ]}
      >
        <List.Item.Meta
          avatar={
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: (selectedCategory?.color || '#667eea') + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>
              {selectedCategory?.icon || '💸'}
            </div>
          }
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {record.note || selectedCategory?.name || '未知'}
                </span>
                {renderAccountTag(record.accountId)}
                {isRefunded && <span style={{ fontSize: 11, color: '#faad14' }}>
                  {record.refundStatus === 'full' ? '(已退款)' : '(部分退款)'}
                </span>}
              </div>
              <span style={{
                color: record.type === 'income' ? '#52c41a' : '#ff4d4f',
                fontWeight: 700, fontSize: 14, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap'
              }}>
                {record.type === 'income' ? '+' : '-'}¥{effectiveAmount.toFixed(2)}
              </span>
            </div>
          }
          description={
            <div style={{ fontSize: 12, color: NOTE_COLOR }}>
              {record.date}
              {isRefunded && record.refundAmount ? ` · 退¥${record.refundAmount.toFixed(2)}${record.shippingFee ? ` 运费¥${record.shippingFee.toFixed(2)}` : ''}` : ''}
            </div>
          }
        />
      </List.Item>
    )
  }

  const renderCategoryGrid = (data: Category[], type: 'income' | 'expense') => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: SECONDARY, fontSize: 13 }}>
          共 {data.length} 个{type === 'expense' ? '支出' : '收入'}分类
        </span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd(type)}>
          添加{type === 'expense' ? '支出' : '收入'}分类
        </Button>
      </div>
      <Row gutter={[12, 12]}>
        {data.map((category) => {
          const catRecordCount = records.filter(r => !r.isDeleted && r.categoryId === category.id).length
          const catTotal = records
            .filter(r => !r.isDeleted && r.categoryId === category.id)
            .reduce((sum, r) => {
              if (type === 'expense') {
                if (r.type === 'expense') {
                  const effective = r.refundAmount ? Math.max(0, r.amount - r.refundAmount + (r.shippingFee || 0)) : r.amount
                  return sum + effective
                }
                return sum
              }
              return sum + (r.type === 'income' ? r.amount : 0)
            }, 0)
          return (
            <Col xs={8} sm={6} key={category.id}>
              <div
                className="category-grid-item"
                style={{
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  position: 'relative',
                  borderRadius: 12,
                  padding: '16px 8px',
                  textAlign: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => showCategoryRecords(category)}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: (category.color || '#667eea') + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, margin: '0 auto 12px'
                }}>
                  {category.icon}
                </div>
                <div style={{ color: TEXT_COLOR, fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
                  {category.name}
                </div>
                <div style={{ color: SUBTLE, fontSize: 11 }}>
                  {category.isDefault ? '默认' : '自定义'}
                </div>
                {catRecordCount > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: type === 'expense' ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
                    {catRecordCount}笔 · ¥{catTotal.toFixed(2)}
                  </div>
                )}
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s'
                }}
                className="category-actions"
                >
                  <Button
                    type="text" size="small"
                    icon={<EditOutlined style={{ color: SUBTLE }} />}
                    onClick={(e) => { e.stopPropagation(); handleEdit(category) }}
                  />
                  {!category.isDefault && (
                    <Popconfirm
                      title="确定要删除这个分类吗？"
                      onConfirm={() => handleDelete(category.id!)}
                      okText="确定" cancelText="取消"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>
                  )}
                </div>
              </div>
            </Col>
          )
        })}
      </Row>
    </div>
  )

  return (
    <div>
      <Card style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
        <Tabs
          defaultActiveKey="expense"
          items={[
            {
              key: 'expense',
              label: `💸 支出分类 (${expenseCategories.length})`,
              children: renderCategoryGrid(expenseCategories, 'expense')
            },
            {
              key: 'income',
              label: `💰 收入分类 (${incomeCategories.length})`,
              children: renderCategoryGrid(incomeCategories, 'income')
            }
          ]}
        />
      </Card>

      <Modal
        title={editingCategory ? "编辑分类" : "添加分类"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="请输入分类名称" size="large" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select placeholder="请选择类型" size="large">
              <Option value="expense">💸 支出</Option>
              <Option value="income">💰 收入</Option>
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {PRESET_ICONS.map(icon => (
                  <Tooltip key={icon} title={icon}>
                    <div
                      onClick={() => {
                        setSelectedIcon(icon)
                        setCustomIcon('')
                        form.setFieldsValue({ icon })
                      }}
                      style={{
                        width: 36, height: 36, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 20, cursor: 'pointer',
                        borderRadius: 8, border: selectedIcon === icon ? '2px solid #667eea' : '2px solid transparent',
                        background: selectedIcon === icon ? 'rgba(102,126,234,0.1)' : 'transparent',
                        transition: 'all 0.15s'
                      }}
                    >
                      {icon}
                    </div>
                  </Tooltip>
                ))}
              </div>
              <Input
                placeholder="或输入自定义图标（emoji/文字）"
                size="large"
                value={customIcon}
                onChange={e => {
                  setCustomIcon(e.target.value)
                  setSelectedIcon('')
                  form.setFieldsValue({ icon: e.target.value })
                }}
              />
            </div>
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input type="color" placeholder="选择颜色" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true, message: '请输入排序' }]}>
            <InputNumber style={{ width: '100%' }} min={0} size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{selectedCategory?.icon}</span>
            <span>{selectedCategory?.name} - {selectedCategory?.type === 'expense' ? '消费' : '收入'}记录</span>
          </div>
        }
        open={recordsVisible}
        onCancel={() => setRecordsVisible(false)}
        footer={[
          <Button key="all" type="primary" onClick={() => {
            if (selectedCategory?.id && onViewCategoryRecords) {
              setRecordsVisible(false)
              onViewCategoryRecords(selectedCategory.id)
            }
          }}>
            查看全部记录
          </Button>,
          <Button key="close" onClick={() => setRecordsVisible(false)}>关闭</Button>
        ]}
        width={560}
      >
        <div style={{ marginBottom: 16, padding: '12px 16px', background: (selectedCategory?.color || '#667eea') + '10', borderRadius: 8, border: `1px solid ${(selectedCategory?.color || '#667eea')}20` }}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ color: SECONDARY, fontSize: 12 }}>记录笔数</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, monospace' }}>{categoryRecords.length}</div>
            </Col>
            <Col span={12}>
              <div style={{ color: SECONDARY, fontSize: 12 }}>
                {selectedCategory?.type === 'expense' ? '总支出' : '总收入'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, monospace', color: selectedCategory?.type === 'expense' ? '#ff4d4f' : '#52c41a' }}>
                ¥{categoryTotal.toFixed(2)}
              </div>
            </Col>
          </Row>
        </div>

        {categoryRecords.length === 0 ? (
          <Empty description={`暂无${selectedCategory?.type === 'expense' ? '消费' : '收入'}记录`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={categoryRecords.slice(0, 20)}
            renderItem={renderRecordForCategory}
            style={{ maxHeight: 400, overflow: 'auto' }}
          />
        )}
      </Modal>
    </div>
  )
}

export default Categories
