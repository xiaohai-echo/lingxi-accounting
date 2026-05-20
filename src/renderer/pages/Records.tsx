import React, { useState, useMemo, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Card, List, Button, Modal, Form, Input, Select, DatePicker, InputNumber,
  App, Popconfirm, Tabs, Row, Col, Tag, TimePicker, Dropdown
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  FilterOutlined, CloseOutlined, SwapOutlined, RollbackOutlined, EllipsisOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { addRecord, updateRecord, deleteRecord, refundRecordThunk, fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import type { Record as RecordType } from '../../main/database/schema'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_COLORS, getDefaultAccountId } from '../utils/constants'
import RecordDetailModal from '../components/RecordDetailModal'

const { Option } = Select
const { TextArea } = Input
const { RangePicker } = DatePicker

const QUICK_DATES: { label: string; getValue: () => [dayjs.Dayjs, dayjs.Dayjs] }[] = [
  { label: '今天', getValue: () => [dayjs(), dayjs()] },
  { label: '本周', getValue: () => [dayjs().startOf('week'), dayjs().endOf('week')] },
  { label: '本月', getValue: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { label: '近3月', getValue: () => [dayjs().subtract(3, 'month'), dayjs()] },
  { label: '今年', getValue: () => [dayjs().startOf('year'), dayjs()] },
]

interface RecordsProps {
  isDark?: boolean
  autoOpenAdd?: boolean
  onAutoOpenHandled?: () => void
  initialFilterAccountId?: number | null
  initialFilterCategoryId?: number | null
  onFilterConsumed?: () => void
}

const Records: React.FC<RecordsProps> = ({
  isDark = true, autoOpenAdd = false, onAutoOpenHandled,
  initialFilterAccountId, initialFilterCategoryId, onFilterConsumed
}) => {
  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const TERTIARY = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'

  const { message } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()
  const { items: records } = useSelector((state: RootState) => state.records)
  const { items: accounts } = useSelector((state: RootState) => state.accounts)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { currentLedgerId } = useSelector((state: RootState) => state.ledgers)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RecordType | null>(null)
  const [recordType, setRecordType] = useState<'income' | 'expense'>('expense')
  const [activeTab, setActiveTab] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  const [filterCategory, setFilterCategory] = useState<number | undefined>(undefined)
  const [filterAccount, setFilterAccount] = useState<number | undefined>(undefined)
  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)

  const [refundVisible, setRefundVisible] = useState(false)
  const [refundTargetRecord, setRefundTargetRecord] = useState<RecordType | null>(null)
  const [refundForm] = Form.useForm()

  const [detailVisible, setDetailVisible] = useState(false)
  const [detailRecord, setDetailRecord] = useState<RecordType | null>(null)

  const getCategoryById = (id: number) => categories.find(c => c.id === id)
  const getAccountById = (id: number) => accounts.find(a => a.id === id)

  useEffect(() => {
    if (autoOpenAdd) {
      handleAdd()
      onAutoOpenHandled?.()
    }
  }, [autoOpenAdd])

  useEffect(() => {
    if (initialFilterAccountId !== undefined && initialFilterAccountId !== null) {
      setFilterAccount(initialFilterAccountId)
      setFilterVisible(true)
      setActiveTab('all')
      onFilterConsumed?.()
    }
  }, [initialFilterAccountId])

  useEffect(() => {
    if (initialFilterCategoryId !== undefined && initialFilterCategoryId !== null) {
      setFilterCategory(initialFilterCategoryId)
      setFilterVisible(true)
      setActiveTab('all')
      onFilterConsumed?.()
    }
  }, [initialFilterCategoryId])

  const hasActiveFilters = filterCategory !== undefined || filterDateRange !== null || filterAccount !== undefined

  const clearFilters = () => {
    setFilterCategory(undefined)
    setFilterDateRange(null)
    setFilterAccount(undefined)
  }

  const handleQuickDate = (fn: () => [dayjs.Dayjs, dayjs.Dayjs]) => {
    const [start, end] = fn()
    setFilterDateRange([start, end])
  }

  const filteredRecords = useMemo(() => {
    let result = [...records]

    if (activeTab === 'expense') {
      result = result.filter(r => r.type === 'expense')
    } else if (activeTab === 'income') {
      result = result.filter(r => r.type === 'income')
    } else if (activeTab === 'transfer') {
      result = result.filter(r => r.type === 'transfer')
    }

    if (filterCategory !== undefined) {
      result = result.filter(r => r.categoryId === filterCategory)
    }

    if (filterAccount !== undefined) {
      result = result.filter(r => r.accountId === filterAccount || r.targetAccountId === filterAccount)
    }

    if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
      const startStr = filterDateRange[0].format('YYYY-MM-DD')
      const endStr = filterDateRange[1].format('YYYY-MM-DD')
      result = result.filter(r => r.date >= startStr && r.date <= endStr)
    }

    if (searchText.trim()) {
      const lower = searchText.toLowerCase()
      result = result.filter(r => {
        const category = getCategoryById(r.categoryId)
        const account = getAccountById(r.accountId)
        return (
          (r.note && r.note.toLowerCase().includes(lower)) ||
          (category?.name && category.name.toLowerCase().includes(lower)) ||
          (account?.name && account.name.toLowerCase().includes(lower)) ||
          r.amount.toString().includes(lower)
        )
      })
    }

    return result.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
  }, [records, activeTab, searchText, filterCategory, filterAccount, filterDateRange])

  const getEffectiveAmount = (r: RecordType): number => {
    if (r.type === 'expense' && r.refundAmount) {
      return Math.max(0, r.amount - r.refundAmount + (r.shippingFee || 0))
    }
    return r.amount
  }

  const totalExpense = filteredRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
  const totalIncome = filteredRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    setRecordType('expense')
    form.setFieldsValue({ date: dayjs(), time: dayjs(), type: 'expense', accountId: getDefaultAccountId() ?? undefined })
    setIsModalOpen(true)
  }

  const handleEdit = (record: RecordType) => {
    if (record.type === 'transfer') return
    setEditingRecord(record)
    setRecordType(record.type)
    form.setFieldsValue({
      type: record.type,
      title: record.title || '',
      amount: record.amount,
      categoryId: record.categoryId,
      accountId: record.accountId,
      date: dayjs(record.date),
      time: record.createdAt ? dayjs(record.createdAt) : dayjs(),
      note: record.note,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await dispatch(deleteRecord(id)).unwrap()
      message.success('记录删除成功！'); dispatch(fetchAccounts() as any); dispatch(fetchRecords() as any)
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const record = {
        amount: values.amount,
        type: values.type,
        categoryId: values.categoryId,
        accountId: values.accountId,
        ledgerId: currentLedgerId || (accounts[0]?.ledgerId ?? 1),
        date: values.date.format('YYYY-MM-DD'),
        title: values.title || '',
        note: values.note || '',
        source: 'manual' as const,
        syncedAt: undefined,
        isDeleted: 0
      }

      const now = new Date()
      if (values.time) {
        const timeVal = values.time as dayjs.Dayjs
        now.setHours(timeVal.hour(), timeVal.minute(), timeVal.second(), 0)
      }
      const createdAt = now.toISOString()

      if (editingRecord) {
        await dispatch(updateRecord({ id: editingRecord.id!, record: { ...record, createdAt } })).unwrap()
        message.success('记录更新成功！')
      } else {
        await dispatch(addRecord({ ...record, createdAt })).unwrap()
        message.success('记录添加成功！')
      }
      setIsModalOpen(false)
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const handleRefund = (record: RecordType) => {
    setRefundTargetRecord(record)
    refundForm.resetFields()
    refundForm.setFieldsValue({
      refundAmount: record.amount,
      shippingFee: 0,
    })
    setRefundVisible(true)
  }

  const handleRefundOk = async () => {
    try {
      const values = await refundForm.validateFields()
      if (!refundTargetRecord?.id) return
      if (values.refundAmount > refundTargetRecord.amount) {
        message.error('退款金额不能超过原消费金额')
        return
      }
      if (values.shippingFee > values.refundAmount) {
        message.error('运费不能超过退款金额')
        return
      }
      await dispatch(refundRecordThunk({
        originalRecordId: refundTargetRecord.id,
        refundAmount: values.refundAmount,
        shippingFee: values.shippingFee || 0,
        note: values.refundNote
      })).unwrap()
      message.success('退款已记录！')
      setRefundVisible(false)
      dispatch(fetchRecords(currentLedgerId as any) as any)
      dispatch(fetchAccounts(currentLedgerId as any) as any)
    } catch (error) {
      message.error('退款操作失败，请重试')
    }
  }

  const filteredCategories = categories.filter(c => c.type === recordType)

  const accountsByType = useMemo(() => {
    const groups: Record<string, typeof accounts> = {}
    accounts.forEach(acc => {
      const typeKey = acc.type || 'other'
      if (!groups[typeKey]) groups[typeKey] = []
      groups[typeKey].push(acc)
    })
    return groups
  }, [accounts])

  const groupedRecords = useMemo(() => {
    const groups: Record<string, RecordType[]> = {}
    filteredRecords.forEach(record => {
      const dateKey = record.date.substring(0, 10)
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(record)
    })
    return Object.entries(groups).sort((a, b) => dayjs(b[0]).valueOf() - dayjs(a[0]).valueOf())
  }, [filteredRecords])

  const filterCategoryName = filterCategory !== undefined ? getCategoryById(filterCategory)?.name : undefined
  const filterAccountName = filterAccount !== undefined ? getAccountById(filterAccount)?.name : undefined

  const getRefundTag = (record: RecordType) => {
    if (!record.refundStatus || record.refundStatus === 'none') return null
    if (record.refundStatus === 'full') {
      return <Tag color="orange" style={{ fontSize: 11, lineHeight: '18px' }}>已退款</Tag>
    }
    return <Tag color="gold" style={{ fontSize: 11, lineHeight: '18px' }}>部分退款</Tag>
  }

  const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    manual: { label: '手动', color: '#8c8c8c', icon: '✏️' },
    ai_text: { label: 'AI文本', color: '#667eea', icon: '💬' },
    ai_voice: { label: 'AI语音', color: '#faad14', icon: '🎙️' },
    ai_image: { label: 'AI图片', color: '#13c2c2', icon: '📷' },
  }

  const renderSourceTag = (source?: string) => {
    const cfg = SOURCE_CONFIG[source || 'manual'] || SOURCE_CONFIG.manual
    return (
      <span className="source-tag" style={{ background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
        {cfg.icon} {cfg.label}
      </span>
    )
  }

  const renderAccountTag = (accountId: number) => {
    const acc = getAccountById(accountId)
    if (!acc) return null
    const icon = ACCOUNT_TYPE_ICONS[acc.type] || '💰'
    const color = ACCOUNT_TYPE_COLORS[acc.type] || '#667eea'
    return (
      <span className="payment-tag" style={{ background: color + '22', color, border: `1px solid ${color}33` }}>
        {icon} {acc.name}
      </span>
    )
  }

  const formatTime = (record: RecordType) => {
    if (record.createdAt) {
      return dayjs(record.createdAt).format('HH:mm:ss')
    }
    return ''
  }

  const renderActions = (record: RecordType, isRefunded: boolean) => {
    const items: { key: string; label: React.ReactNode; danger?: boolean }[] = []
    if (record.type === 'expense' && !isRefunded) {
      items.push({
        key: 'refund',
        label: <span onClick={() => handleRefund(record)}><RollbackOutlined style={{ color: '#faad14', marginRight: 8 }} />退款</span>
      })
    }
    if (record.type !== 'transfer') {
      items.push({
        key: 'edit',
        label: <span onClick={() => handleEdit(record)}><EditOutlined style={{ marginRight: 8 }} />编辑</span>
      })
    }
    items.push({
      key: 'delete',
      danger: true,
      label: (
        <Popconfirm title={record.type === 'transfer' ? "确定要删除这条转账记录吗？" : "确定要删除这条记录吗？"} onConfirm={() => handleDelete(record.id!)} okText="确定" cancelText="取消">
          <span><DeleteOutlined style={{ marginRight: 8 }} />删除</span>
        </Popconfirm>
      )
    })
    return (
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
        <Button type="text" size="small" onClick={(e) => e.stopPropagation()} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} icon={<EllipsisOutlined style={{ fontSize: 18 }} />} />
      </Dropdown>
    )
  }

  const handleShowDetail = (record: RecordType) => {
    setDetailRecord(record)
    setDetailVisible(true)
  }

  const renderRecordItem = (record: RecordType) => {
    const timeStr = formatTime(record)

    if (record.type === 'transfer') {
      return (
        <List.Item className="record-item-transfer" style={{ cursor: 'pointer' }} onClick={() => handleShowDetail(record)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#667eea20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SwapOutlined style={{ color: '#667eea', fontSize: 16 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {record.note || '账户转账'}
                </span>
                <span style={{ color: '#667eea', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  ¥{record.amount.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {renderAccountTag(record.accountId)}
                <span style={{ color: TERTIARY, fontSize: 11 }}>→</span>
                {record.targetAccountId && renderAccountTag(record.targetAccountId)}
                {record.fee ? <span style={{ fontSize: 10, color: '#faad14' }}>手续费 ¥{record.fee.toFixed(2)}</span> : ''}
                <span style={{ color: TERTIARY, fontFamily: 'Inter, monospace', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>{timeStr}</span>
              </div>
            </div>
            {renderActions(record, false)}
          </div>
        </List.Item>
      )
    }

    const category = getCategoryById(record.categoryId)
    const isRefunded = record.refundStatus && record.refundStatus !== 'none'
    const effectiveAmount = getEffectiveAmount(record)
    const coreContent = record.title || record.note || category?.name || '未分类'

    return (
      <List.Item className={isRefunded ? 'record-item-refunded' : (record.type === 'expense' ? 'record-item-expense' : 'record-item-income')} style={{ cursor: 'pointer' }} onClick={() => handleShowDetail(record)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <div style={{ width: 40, height: 52, borderRadius: 10, background: (category?.color || '#667eea') + '20', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{category?.icon || '💸'}</span>
            <span style={{ fontSize: 10, color: SECONDARY, lineHeight: 1, maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category?.name}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {getRefundTag(record)}
                {coreContent}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 8 }}>
                {isRefunded && record.refundAmount ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', whiteSpace: 'nowrap' }}>
                    <span style={{ textDecoration: 'line-through', color: TERTIARY, fontSize: 11, fontFamily: 'Inter, monospace' }}>
                      -¥{record.amount.toFixed(2)}
                    </span>
                    <span style={{
                      color: record.type === 'income' ? '#52c41a' : '#ff4d4f',
                      fontSize: 14, fontWeight: 700, fontFamily: 'Inter, monospace'
                    }}>
                      {record.type === 'income' ? '+' : '-'}¥{effectiveAmount.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: '#faad14' }}>
                      退¥{record.refundAmount.toFixed(2)}{record.shippingFee ? ` 运费¥${record.shippingFee.toFixed(2)}` : ''}
                    </span>
                  </div>
                ) : (
                  <span style={{
                    color: record.type === 'income' ? '#52c41a' : '#ff4d4f',
                    fontSize: 14, fontWeight: 700, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap'
                  }}>
                    {record.type === 'income' ? '+' : '-'}¥{record.amount.toFixed(2)}
                  </span>
                )}
                {renderActions(record, !!isRefunded)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {renderSourceTag(record.source)}
              {renderAccountTag(record.accountId)}
              {isRefunded && record.refundNote && <span style={{ fontSize: 10, color: '#faad14' }}>{record.refundNote}</span>}
              <span style={{ color: TERTIARY, fontFamily: 'Inter, monospace', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>{timeStr}</span>
            </div>
          </div>
        </div>
      </List.Item>
    )
  }

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ marginBottom: 0 }}
                items={[
                  { key: 'all', label: '全部' },
                  { key: 'expense', label: '支出' },
                  { key: 'income', label: '收入' },
                  { key: 'transfer', label: '转账' }
                ]}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Button icon={<FilterOutlined />} onClick={() => setFilterVisible(!filterVisible)} type={hasActiveFilters ? 'primary' : 'default'} size="small">
                筛选{hasActiveFilters ? ` (${(filterCategory !== undefined ? 1 : 0) + (filterDateRange !== null ? 1 : 0) + (filterAccount !== undefined ? 1 : 0)})` : ''}
              </Button>
              <Input placeholder="搜索记录..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 140, borderRadius: 8 }} allowClear size="small" />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="small">记一笔</Button>
            </div>
          </div>

          {filterVisible && (
            <div style={{ padding: 16, marginBottom: 16, borderRadius: 10, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}><FilterOutlined /> 筛选条件</span>
                {hasActiveFilters && <Button type="link" size="small" icon={<CloseOutlined />} onClick={clearFilters}>清除筛选</Button>}
              </div>
              <Row gutter={[16, 12]}>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: SECONDARY }}>按类别</div>
                  <Select style={{ width: '100%' }} placeholder="全部类别" allowClear value={filterCategory} onChange={val => setFilterCategory(val)}>
                    <Select.OptGroup label="支出">
                      {categories.filter(c => c.type === 'expense').map(c => (<Option key={c.id} value={c.id}>{c.icon} {c.name}</Option>))}
                    </Select.OptGroup>
                    <Select.OptGroup label="收入">
                      {categories.filter(c => c.type === 'income').map(c => (<Option key={c.id} value={c.id}>{c.icon} {c.name}</Option>))}
                    </Select.OptGroup>
                  </Select>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: SECONDARY }}>按账户</div>
                  <Select style={{ width: '100%' }} placeholder="全部账户" allowClear value={filterAccount} onChange={val => setFilterAccount(val)}>
                    {Object.entries(accountsByType).map(([type, accs]) => (
                      <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                        {accs.map(acc => (<Option key={acc.id} value={acc.id}>{acc.name}{acc.cardNo ? ` (尾号${acc.cardNo})` : ''} ¥{acc.balance.toFixed(2)}</Option>))}
                      </Select.OptGroup>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: SECONDARY }}>按时间段</div>
                  <RangePicker style={{ width: '100%' }} value={filterDateRange as any} onChange={dates => setFilterDateRange(dates as any)} placeholder={['开始日期', '结束日期']} />
                </Col>
              </Row>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {QUICK_DATES.map(qd => (
                  <Tag key={qd.label} style={{ cursor: 'pointer', margin: 0 }} color={filterDateRange && filterDateRange[0] && filterDateRange[1] && filterDateRange[0].isSame(qd.getValue()[0], 'day') && filterDateRange[1].isSame(qd.getValue()[1], 'day') ? 'blue' : undefined} onClick={() => handleQuickDate(qd.getValue)}>{qd.label}</Tag>
                ))}
                {filterDateRange && <Tag style={{ cursor: 'pointer', margin: 0 }} onClick={() => setFilterDateRange(null)}>清除日期</Tag>}
              </div>
              {hasActiveFilters && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: TERTIARY }}>当前筛选：</span>
                  {filterCategory !== undefined && <Tag closable onClose={() => setFilterCategory(undefined)} color="blue">类别: {filterCategoryName || filterCategory}</Tag>}
                  {filterAccount !== undefined && <Tag closable onClose={() => setFilterAccount(undefined)} color="purple">账户: {filterAccountName || filterAccount}</Tag>}
                  {filterDateRange && filterDateRange[0] && filterDateRange[1] && <Tag closable onClose={() => setFilterDateRange(null)} color="green">时间: {filterDateRange[0].format('YYYY-MM-DD')} ~ {filterDateRange[1].format('YYYY-MM-DD')}</Tag>}
                </div>
              )}
            </div>
          )}

          <Row gutter={16}>
            <Col span={8}>
              <div style={{ padding: '12px 16px', background: 'rgba(255,77,79,0.08)', borderRadius: 8, border: '1px solid rgba(255,77,79,0.12)' }}>
                <span style={{ color: SECONDARY, fontSize: 12 }}>筛选支出</span>
                <div style={{ color: '#ff4d4f', fontSize: 18, fontWeight: 700, fontFamily: 'Inter, monospace' }}>¥{totalExpense.toFixed(2)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ padding: '12px 16px', background: 'rgba(82,196,26,0.08)', borderRadius: 8, border: '1px solid rgba(82,196,26,0.12)' }}>
                <span style={{ color: SECONDARY, fontSize: 12 }}>筛选收入</span>
                <div style={{ color: '#52c41a', fontSize: 18, fontWeight: 700, fontFamily: 'Inter, monospace' }}>¥{totalIncome.toFixed(2)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ padding: '12px 16px', background: 'rgba(102,126,234,0.08)', borderRadius: 8, border: '1px solid rgba(102,126,234,0.12)' }}>
                <span style={{ color: SECONDARY, fontSize: 12 }}>筛选结余</span>
                <div style={{ color: '#667eea', fontSize: 18, fontWeight: 700, fontFamily: 'Inter, monospace' }}>¥{(totalIncome - totalExpense).toFixed(2)}</div>
              </div>
            </Col>
          </Row>
        </div>

        {groupedRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: SECONDARY }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>暂无记录</div>
            <div style={{ fontSize: 13 }}>点击"记一笔"开始记录你的消费吧</div>
          </div>
        ) : (
          groupedRecords.map(([date, dateRecords]) => {
            const dayExpense = dateRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
            const dayIncome = dateRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
            const isToday = date === dayjs().format('YYYY-MM-DD')
            const isYesterday = date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')
            const dateLabel = isToday ? '今天' : isYesterday ? '昨天' : dayjs(date).format('MM月DD日')
            return (
              <div key={date} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                  <span style={{ color: SECONDARY, fontSize: 13, fontWeight: 600 }}>{dateLabel} <span style={{ color: TERTIARY, fontWeight: 400 }}>{dayjs(date).format('ddd')}</span></span>
                  <span style={{ fontSize: 12, color: TERTIARY }}>
                    {dayExpense > 0 && <span style={{ marginRight: 12 }}>支 ¥{dayExpense.toFixed(2)}</span>}
                    {dayIncome > 0 && <span>收 ¥{dayIncome.toFixed(2)}</span>}
                  </span>
                </div>
                <List dataSource={dateRecords} renderItem={renderRecordItem} />
              </div>
            )
          })
        )}
      </Card>

      <Modal
        title={editingRecord ? "编辑记录" : "添加记录"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="确定"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select onChange={(value) => setRecordType(value)} size="large">
              <Option value="expense">💸 支出</Option>
              <Option value="income">💰 收入</Option>
            </Select>
          </Form.Item>
          <Form.Item name="title" label={recordType === 'income' ? '收入记录' : '支出记录'} rules={[{ required: true, message: recordType === 'income' ? '请输入收入记录' : '请输入支出记录' }]}>
            <Input placeholder={recordType === 'income' ? '如：5月工资、项目奖金等' : '如：午餐-黄焖鸡、地铁通勤等'} size="large" />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="请输入金额" precision={2} min={0.01} size="large" prefix="¥" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select placeholder="选择分类" size="large">
                  {filteredCategories.map(category => (<Option key={category.id} value={category.id}>{category.icon} {category.name}</Option>))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="accountId" label="账户" rules={[{ required: true, message: '请选择账户' }]}>
                <Select placeholder="选择账户" size="large">
                  {Object.entries(accountsByType).map(([type, accs]) => (
                    <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                      {accs.map(acc => (<Option key={acc.id} value={acc.id}>{acc.name}{acc.cardNo ? ` (尾号${acc.cardNo})` : ''}{acc.bankName ? ` - ${acc.bankName}` : ''}</Option>))}
                    </Select.OptGroup>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="date" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="time" label="时间" rules={[{ required: true, message: '请选择时间' }]}>
                <TimePicker style={{ width: '100%' }} size="large" format="HH:mm:ss" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="备注" extra="记录补充信息、AI识别结果等">
            <TextArea rows={2} placeholder="添加备注（可选）" />
          </Form.Item>
          {editingRecord?.rawFilePath && (
            <Form.Item label="附件路径">
              <Input value={editingRecord.rawFilePath} disabled size="large" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RollbackOutlined style={{ color: '#faad14' }} /><span>记录退款</span></div>}
        open={refundVisible} onOk={handleRefundOk} onCancel={() => setRefundVisible(false)} okText="确认退款" cancelText="取消" width={440}
      >
        {refundTargetRecord && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
            <div style={{ fontSize: 13, color: SECONDARY, marginBottom: 4 }}>原消费记录</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{getCategoryById(refundTargetRecord.categoryId)?.icon} {getCategoryById(refundTargetRecord.categoryId)?.name}</div>
            <div style={{ color: '#ff4d4f', fontSize: 20, fontWeight: 700, fontFamily: 'Inter, monospace', marginTop: 4 }}>-¥{refundTargetRecord.amount.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: TERTIARY, marginTop: 4 }}>{refundTargetRecord.date} {refundTargetRecord.note || ''}</div>
          </div>
        )}
        <Form form={refundForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="refundAmount" label="退款金额" rules={[{ required: true, message: '请输入退款金额' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="请输入退款金额" precision={2} min={0.01} max={refundTargetRecord?.amount} size="large" prefix="¥" />
          </Form.Item>
          <Form.Item name="shippingFee" label="退款运费或手续费（默认为0）">
            <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} min={0} size="large" prefix="¥" />
          </Form.Item>
          <Form.Item name="refundNote" label="退款备注">
            <Input placeholder="退款原因（可选）" size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <RecordDetailModal
        open={detailVisible}
        record={detailRecord}
        onClose={() => setDetailVisible(false)}
        accounts={accounts}
        categories={categories}
        onEdit={(record) => { setDetailVisible(false); handleEdit(record) }}
        onDelete={(id) => handleDelete(id)}
        onRefund={(record) => { setDetailVisible(false); handleRefund(record) }}
      />
    </div>
  )
}

export default Records
