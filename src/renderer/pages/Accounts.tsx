import React, { useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Card, Button, Modal, Form, Input, InputNumber, Select, App, Row, Col, Space, List, Empty, AutoComplete, Dropdown } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SwapOutlined, ArrowRightOutlined, DollarOutlined, WalletOutlined, EllipsisOutlined, StarFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { addAccount, updateAccount, deleteAccount, fetchAccounts } from '../store/slices/accountsSlice'
import { transferRecord, fetchRecords } from '../store/slices/recordsSlice'
import type { Account, Record as RecordType } from '../../main/database/schema'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_COLORS, getDefaultAccountId, setDefaultAccountId } from '../utils/constants'

const { Option } = Select

const COMMON_BANKS = [
  '工商', '建设', '农业', '中国银行', '招商', '交通', '中信', '浦发',
  '民生', '兴业', '光大', '华夏', '平安', '广发', '邮储', '渤海',
  '北京银行', '上海银行', '江苏银行', '宁波银行', '南京银行', '杭州银行'
]

const bankOptions = COMMON_BANKS.map(b => ({ value: b }))

const accountGradients: Record<string, string[]> = {
  cash: ['#FFD93D', '#F0A500'],
  bank: ['#6BCB77', '#2ECC71'],
  wechat: ['#07C160', '#059C4E'],
  alipay: ['#1677FF', '#0958D9'],
  credit: ['#FF6B6B', '#EE5A24'],
  other: ['#667eea', '#764ba2']
}

interface AccountsProps {
  isDark?: boolean
  onViewAccountRecords?: (accountId: number) => void
}

const Accounts: React.FC<AccountsProps> = ({ isDark = true, onViewAccountRecords }) => {
  const { message } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()
  const { items: accounts } = useSelector((state: RootState) => state.accounts)
  const { items: records } = useSelector((state: RootState) => state.records)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { currentLedgerId } = useSelector((state: RootState) => state.ledgers)

  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const TERTIARY = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailAccount, setDetailAccount] = useState<Account | null>(null)
  const [transferVisible, setTransferVisible] = useState(false)
  const [withdrawVisible, setWithdrawVisible] = useState(false)
  const [rechargeVisible, setRechargeVisible] = useState(false)
  const [transferForm] = Form.useForm()
  const [withdrawForm] = Form.useForm()
  const [rechargeForm] = Form.useForm()

  const cardDisplay = (cardNo?: string) => {
    if (!cardNo) return ''
    return `尾号${cardNo}`
  }
  const [form] = Form.useForm()
  const [accountType, setAccountType] = useState<string>('cash')


  const getCategoryById = (id: number) => categories.find(c => c.id === id)
  const getAccountById = (id: number) => accounts.find(a => a.id === id)

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

  const renderAccountTagSmall = (accountId: number) => {
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

  const accountRecords = useMemo(() => {
    if (!detailAccount) return []
    return records
      .filter(r => !r.isDeleted && (r.accountId === detailAccount.id || r.targetAccountId === detailAccount.id))
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
  }, [detailAccount, records])

  const handleAdd = () => {
    setEditingAccount(null)
    form.resetFields()
    setAccountType('cash')
    form.setFieldsValue({ balance: 0, color: '#667eea', type: 'cash' })
    setIsModalOpen(true)
  }

  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setAccountType(account.type)
    form.setFieldsValue({
      name: account.name,
      type: account.type,
      balance: account.balance,
      color: account.color,
      uniqueId: account.uniqueId || '',
      bankName: account.bankName || '',
      cardNo: account.cardNo || '',
      holderName: account.holderName || '',
      remark: account.remark || ''
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await dispatch(deleteAccount(id)).unwrap()
      message.success('账户删除成功！')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const account: any = {
        name: values.name,
        type: values.type,
        balance: values.balance,
        color: values.color,
        icon: '',
        ledgerId: currentLedgerId ?? undefined,
        isDeleted: 0,
        uniqueId: values.uniqueId || '',
        bankName: values.bankName || '',
        cardNo: values.cardNo || '',
        holderName: values.holderName || '',
        remark: values.remark || ''
      }

      if (values.type === 'bank' || values.type === 'credit') {
        const bankFull = values.bankName || ''
        const bankShortName = bankFull === '中国银行' ? '中国银行' : bankFull.replace(/^中国/, '')
        let bankMinimalName: string
        if (bankShortName === '中国银行') {
          bankMinimalName = '中行'
        } else {
          bankMinimalName = bankShortName.replace(/银行$/, '')
        }
        account.uniqueId = bankMinimalName
          ? `${bankMinimalName}${values.cardNo || ''}`
          : `${values.type}:${values.name}`
      } else if (values.type === 'wechat' || values.type === 'alipay') {
        const typeLabel = values.type === 'wechat' ? '微信' : '支付宝'
        account.uniqueId = `${typeLabel}-${values.holderName || values.uniqueId || values.name}`
      } else {
        account.uniqueId = values.uniqueId || `${values.type}:${values.name}`
      }

      if (editingAccount) {
        await dispatch(updateAccount({ id: editingAccount.id!, account })).unwrap()
        message.success('账户更新成功！')
      } else {
        await dispatch(addAccount(account)).unwrap()
        message.success('账户添加成功！')
      }
      setIsModalOpen(false)
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const showDetail = (account: Account) => {
    setDetailAccount(account)
    setDetailVisible(true)
  }

  const showTransfer = () => {
    transferForm.resetFields()
    setTransferVisible(true)
  }

  const showWithdraw = () => {
    withdrawForm.resetFields()
    setWithdrawVisible(true)
  }

  const showRecharge = () => {
    rechargeForm.resetFields()
    setRechargeVisible(true)
  }

  const handleTransferOk = async () => {
    try {
      const values = await transferForm.validateFields()
      if (values.sourceAccountId === values.targetAccountId) {
        message.error('转出和转入账户不能相同')
        return
      }
      const sourceAccount = accounts.find(a => a.id === values.sourceAccountId)
      const fee = values.fee || 0
      if (sourceAccount && values.amount + fee > sourceAccount.balance) {
        message.error('转出金额加手续费不能超过账户余额')
        return
      }
      await dispatch(transferRecord({
        sourceAccountId: values.sourceAccountId,
        targetAccountId: values.targetAccountId,
        amount: values.amount,
        note: values.note,
        fee,
        transferType: 'transfer'
      })).unwrap()
      message.success('转账成功！')
      setTransferVisible(false)
      dispatch(fetchAccounts() as any)
      dispatch(fetchRecords() as any)
      if (detailAccount) {
        const updated = accounts.find(a => a.id === detailAccount.id)
        if (updated) setDetailAccount({ ...updated })
      }
    } catch (error) {
      message.error('转账失败，请重试')
    }
  }

  const handleWithdrawOk = async () => {
    try {
      const values = await withdrawForm.validateFields()
      const sourceAccount = accounts.find(a => a.id === values.sourceAccountId)
      const fee = values.fee || 0
      if (sourceAccount && values.amount + fee > sourceAccount.balance) {
        message.error('提现金额加手续费不能超过账户余额')
        return
      }
      await dispatch(transferRecord({
        sourceAccountId: values.sourceAccountId,
        targetAccountId: values.targetAccountId,
        amount: values.amount,
        note: values.note || '提现',
        fee,
        transferType: 'withdraw'
      })).unwrap()
      message.success('提现成功！')
      setWithdrawVisible(false)
      dispatch(fetchAccounts() as any)
      dispatch(fetchRecords() as any)
      if (detailAccount) {
        const updated = accounts.find(a => a.id === detailAccount.id)
        if (updated) setDetailAccount({ ...updated })
      }
    } catch (error) {
      message.error('提现失败，请重试')
    }
  }

  const handleRechargeOk = async () => {
    try {
      const values = await rechargeForm.validateFields()
      const sourceAccount = accounts.find(a => a.id === values.sourceAccountId)
      const fee = values.fee || 0
      if (sourceAccount && values.amount + fee > sourceAccount.balance) {
        message.error('充值金额加手续费不能超过账户余额')
        return
      }
      await dispatch(transferRecord({
        sourceAccountId: values.sourceAccountId,
        targetAccountId: values.targetAccountId,
        amount: values.amount,
        note: values.note || '充值',
        fee,
        transferType: 'recharge'
      })).unwrap()
      message.success('充值成功！')
      setRechargeVisible(false)
      dispatch(fetchAccounts() as any)
      dispatch(fetchRecords() as any)
      if (detailAccount) {
        const updated = accounts.find(a => a.id === detailAccount.id)
        if (updated) setDetailAccount({ ...updated })
      }
    } catch (error) {
      message.error('充值失败，请重试')
    }
  }

  const renderDetailFields = () => {
    if (!detailAccount) return null
    const fields: { label: string; value: string }[] = [
      { label: '账户名称', value: detailAccount.name },
      { label: '账户类型', value: ACCOUNT_TYPE_LABELS[detailAccount.type] || detailAccount.type },
      { label: '当前余额', value: `¥${detailAccount.balance.toFixed(2)}` }
    ]
    if (detailAccount.bankName) fields.push({ label: '开户行', value: detailAccount.bankName })
    if (detailAccount.cardNo) fields.push({ label: '卡号尾号', value: detailAccount.cardNo })
    if (detailAccount.holderName) fields.push({ label: '持有人', value: detailAccount.holderName })
    if (detailAccount.uniqueId) fields.push({ label: '唯一标识', value: detailAccount.uniqueId })
    if (detailAccount.remark) fields.push({ label: '备注', value: detailAccount.remark })

    return fields.map(f => (
      <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
        <span style={{ color: SECONDARY, fontSize: 13 }}>{f.label}</span>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{f.value}</span>
      </div>
    ))
  }

  const renderRecordForAccount = (record: RecordType) => {
    const isSource = record.accountId === detailAccount?.id

    if (record.type === 'transfer') {
      const sourceAccount = getAccountById(record.accountId)
      const targetAccount = record.targetAccountId ? getAccountById(record.targetAccountId) : null
      return (
        <List.Item
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#667eea20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SwapOutlined style={{ color: '#667eea', fontSize: 14 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isSource ? `转出至 ${targetAccount?.name || ''}` : `从 ${sourceAccount?.name || ''} 转入`}
                </span>
                <span style={{
                  color: isSource ? '#ff4d4f' : '#52c41a',
                  fontWeight: 700, fontSize: 14, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap', marginLeft: 8
                }}>
                  {isSource ? '-' : '+'}¥{record.amount.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {renderAccountTagSmall(record.accountId)}
                <span style={{ color: TERTIARY, fontSize: 11 }}>→</span>
                {record.targetAccountId && renderAccountTagSmall(record.targetAccountId)}
                <span style={{ color: TERTIARY, fontFamily: 'Inter, monospace', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>{record.date}</span>
              </div>
            </div>
          </div>
        </List.Item>
      )
    }

    const category = getCategoryById(record.categoryId)
    const isRefunded = record.refundStatus && record.refundStatus !== 'none'
    const effectiveAmount = record.type === 'expense' && record.refundAmount
      ? Math.max(0, record.amount - record.refundAmount + (record.shippingFee || 0))
      : record.amount
    const coreContent = record.title || record.note || category?.name || '未分类'

    return (
      <List.Item
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <div style={{
            width: 36, height: 48, borderRadius: 10,
            background: (category?.color || '#667eea') + '20',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{category?.icon || '💸'}</span>
            <span style={{ fontSize: 9, color: SECONDARY, lineHeight: 1, maxWidth: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category?.name}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {coreContent}
                {isRefunded && <span style={{ fontSize: 11, color: '#faad14', marginLeft: 6 }}>
                  {record.refundStatus === 'full' ? '(已退款)' : '(部分退款)'}
                </span>}
              </span>
              <span style={{
                color: record.type === 'income' ? '#52c41a' : '#ff4d4f',
                fontWeight: 700, fontSize: 14, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap', marginLeft: 8
              }}>
                {record.type === 'income' ? '+' : '-'}¥{effectiveAmount.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {renderSourceTag(record.source)}
              {renderAccountTagSmall(record.accountId)}
              {isRefunded && record.refundAmount ? <span style={{ fontSize: 10, color: '#faad14' }}>退¥{record.refundAmount.toFixed(2)}{record.shippingFee ? ` 运费¥${record.shippingFee.toFixed(2)}` : ''}</span> : ''}
              <span style={{ color: TERTIARY, fontFamily: 'Inter, monospace', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>{record.date}</span>
            </div>
          </div>
        </div>
      </List.Item>
    )
  }

  const renderAccountDetailForm = () => {
    switch (accountType) {
      case 'bank':
        return (
          <>
            <Form.Item name="bankName" label="开户行" rules={[{ required: true, message: '请选择或输入开户行' }]}>
              <AutoComplete options={bankOptions} placeholder="请选择或输入银行" size="large" filterOption={(input, option) => (option?.value as string)?.includes(input)} />
            </Form.Item>
            <Form.Item name="cardNo" label="银行卡尾号" rules={[{ required: true, message: '请输入银行卡尾号' }]}>
                <Input placeholder="例如：8888" size="large" maxLength={4} />
            </Form.Item>
            <Form.Item name="holderName" label="持卡人姓名">
              <Input placeholder="持卡人姓名（可选）" size="large" />
            </Form.Item>
          </>
        )
      case 'credit':
        return (
          <>
            <Form.Item name="bankName" label="发卡行" rules={[{ required: true, message: '请选择或输入发卡行' }]}>
              <AutoComplete options={bankOptions} placeholder="请选择或输入银行" size="large" filterOption={(input, option) => (option?.value as string)?.includes(input)} />
            </Form.Item>
            <Form.Item name="cardNo" label="信用卡尾号" rules={[{ required: true, message: '请输入信用卡尾号' }]}>
                <Input placeholder="例如：6666" size="large" maxLength={4} />
            </Form.Item>
            <Form.Item name="holderName" label="持卡人姓名">
              <Input placeholder="持卡人姓名（可选）" size="large" />
            </Form.Item>
          </>
        )
      case 'wechat':
        return (
          <>
            <Form.Item name="uniqueId" label="微信账号">
              <Input placeholder="微信号或手机号（可选）" size="large" />
            </Form.Item>
            <Form.Item name="holderName" label="实名姓名">
              <Input placeholder="实名认证姓名（可选）" size="large" />
            </Form.Item>
          </>
        )
      case 'alipay':
        return (
          <>
            <Form.Item name="uniqueId" label="支付宝账号">
              <Input placeholder="支付宝账号或手机号（可选）" size="large" />
            </Form.Item>
            <Form.Item name="holderName" label="实名姓名">
              <Input placeholder="实名认证姓名（可选）" size="large" />
            </Form.Item>
          </>
        )
      default:
        return (
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（可选）" size="large" />
          </Form.Item>
        )
    }
  }

  const ledgerAccounts = useMemo(() => {
    if (currentLedgerId === null) return accounts
    return accounts.filter(a => a.ledgerId === currentLedgerId || a.ledgerId === undefined)
  }, [accounts, currentLedgerId])

  const accountsByType = useMemo(() => {
    const groups: Record<string, typeof ledgerAccounts> = {}
    ledgerAccounts.forEach(acc => {
      const typeKey = acc.type || 'other'
      if (!groups[typeKey]) groups[typeKey] = []
      groups[typeKey].push(acc)
    })
    return groups
  }, [ledgerAccounts])

  const totalBalance = ledgerAccounts.reduce((sum, acc) => sum + acc.balance, 0)

  return (
    <div>
      <Card
        style={{
          background: 'linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.08) 100%)',
          border: '1px solid rgba(102,126,234,0.2)',
          marginBottom: 24
        }}
      >
        <Row align="middle" justify="space-between" wrap>
          <Col>
            <div style={{ color: SECONDARY, fontSize: 12, marginBottom: 2 }}>总资产</div>
            <div style={{ color: '#667eea', fontSize: 24, fontWeight: 700, fontFamily: 'Inter, monospace' }}>
              ¥{totalBalance.toFixed(2)}
            </div>
          </Col>
          <Col>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <Button icon={<DollarOutlined />} onClick={showWithdraw} size="small">提现</Button>
              <Button icon={<WalletOutlined />} onClick={showRecharge} size="small">充值</Button>
              <Button icon={<SwapOutlined />} onClick={showTransfer} size="small">转账</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="small">添加账户</Button>
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {ledgerAccounts.map((account) => {
          const gradients = accountGradients[account.type] || accountGradients.other
          const icon = ACCOUNT_TYPE_ICONS[account.type] || '💰'
          const currentBalance = account.balance
          const actionColor = 'rgba(255,255,255,0.85)'
          const isDefault = getDefaultAccountId() === account.id
          const actionItems = [
            {
              key: 'default',
              label: <span onClick={() => { setDefaultAccountId(isDefault ? null : account.id!) }}><StarFilled style={{ marginRight: 8, color: isDefault ? '#faad14' : '#8c8c8c' }} />{isDefault ? '取消默认' : '设为默认账户'}</span>
            },
            {
              key: 'transfer',
              label: <span onClick={() => { setDetailAccount(account); showTransfer() }}><SwapOutlined style={{ marginRight: 8 }} />转账</span>
            },
            {
              key: 'edit',
              label: <span onClick={() => handleEdit(account)}><EditOutlined style={{ marginRight: 8 }} />编辑</span>
            },
            {
              key: 'delete',
              danger: true,
              label: <span onClick={() => {
                Modal.confirm({
                  title: '确定要删除这个账户吗？',
                  onOk: () => handleDelete(account.id!),
                  okText: '确定',
                  cancelText: '取消'
                })
              }}><DeleteOutlined style={{ marginRight: 8 }} />删除</span>
            }
          ]
          return (
            <Col xs={24} sm={12} md={8} key={account.id}>
              <Card
                className="account-card-gradient"
                style={{
                  background: `linear-gradient(135deg, ${gradients[0]} 0%, ${gradients[1]} 100%)`,
                  border: 'none',
                  borderRadius: 16,
                  minHeight: 120,
                  cursor: 'pointer'
                }}
                onClick={() => showDetail(account)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 24 }}>{icon}</span>
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.name}
                      </div>
                      {isDefault && <StarFilled style={{ color: '#faad14', fontSize: 12 }} />}
                    </div>
                    <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: 'Inter, monospace' }}>
                      ¥{currentBalance.toFixed(2)}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
                      {account.bankName ? `${account.bankName}` : '余额'}
                      {account.cardNo ? ` · 尾号${account.cardNo}` : ''}
                    </div>
                  </div>
                  <Dropdown menu={{ items: actionItems }} trigger={['click']} placement="bottomRight">
                    <Button
                      type="text"
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: actionColor, width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      icon={<EllipsisOutlined style={{ fontSize: 14 }} />}
                    />
                  </Dropdown>
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>

      <Modal
        title={editingAccount ? "编辑账户" : "添加账户"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="确定"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
            <Input placeholder="请输入账户名称" size="large" />
          </Form.Item>
          <Form.Item name="type" label="账户类型" rules={[{ required: true, message: '请选择账户类型' }]}>
            <Select placeholder="请选择账户类型" size="large" onChange={(v) => setAccountType(v)}>
              <Option value="cash">💵 现金</Option>
              <Option value="bank">🏦 储蓄卡</Option>
              <Option value="credit">💳 信用卡</Option>
              <Option value="wechat">💬 微信</Option>
              <Option value="alipay">🔵 支付宝</Option>
              <Option value="other">💰 其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="balance" label="初始余额" rules={[{ required: true, message: '请输入初始余额' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="请输入初始余额" precision={2} size="large" prefix="¥" />
          </Form.Item>

          {renderAccountDetailForm()}

          <Form.Item name="color" label="卡片颜色">
            <Input type="color" placeholder="选择颜色" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <span style={{ fontSize: 24 }}>{ACCOUNT_TYPE_ICONS[detailAccount?.type || ''] || '💰'}</span>
            <span>{detailAccount?.name} - 账户详情</span>
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="transfer" icon={<SwapOutlined />} onClick={() => { setDetailVisible(false); showTransfer() }}>
            转账
          </Button>,
          <Button key="records" type="primary" onClick={() => {
            if (detailAccount?.id && onViewAccountRecords) {
              setDetailVisible(false)
              onViewAccountRecords(detailAccount.id)
            }
          }}>
            查看全部记录
          </Button>,
          <Button key="edit" icon={<EditOutlined />} onClick={() => {
            setDetailVisible(false)
            if (detailAccount) handleEdit(detailAccount)
          }}>
            编辑
          </Button>,
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>
        ]}
        width={560}
      >
        {renderDetailFields()}

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>最近流水</span>
            <span style={{ fontSize: 12, color: TERTIARY }}>共 {accountRecords.length} 条</span>
          </div>
          {accountRecords.length === 0 ? (
            <Empty description="暂无流水记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={accountRecords.slice(0, 10)}
              renderItem={renderRecordForAccount}
              style={{ maxHeight: 400, overflow: 'auto' }}
            />
          )}
        </div>
      </Modal>

      <Modal
        title="账户转账"
        open={transferVisible}
        onOk={handleTransferOk}
        onCancel={() => setTransferVisible(false)}
        okText="确认转账"
        cancelText="取消"
        width={480}
      >
        <Form form={transferForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="sourceAccountId" label="转出账户" rules={[{ required: true, message: '请选择转出账户' }]}>
            <Select placeholder="选择转出账户" size="large">
              {Object.entries(accountsByType).map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <ArrowRightOutlined style={{ fontSize: 20, color: '#667eea' }} />
          </div>

          <Form.Item name="targetAccountId" label="转入账户" rules={[{ required: true, message: '请选择转入账户' }]}>
            <Select placeholder="选择转入账户" size="large">
              {Object.entries(accountsByType).map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="amount" label="转账金额" rules={[{ required: true, message: '请输入转账金额' }]}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="请输入转账金额"
              precision={2}
              min={0.01}
              size="large"
              prefix="¥"
            />
          </Form.Item>

          <Form.Item name="fee" label="手续费（默认免手续费）">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="0.00"
              precision={2}
              min={0}
              size="large"
              prefix="¥"
            />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input placeholder="转账备注（可选）" size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarOutlined style={{ color: '#faad14' }} /><span>提现</span></div>}
        open={withdrawVisible}
        onOk={handleWithdrawOk}
        onCancel={() => setWithdrawVisible(false)}
        okText="确认提现"
        cancelText="取消"
        width={480}
      >
        <Form form={withdrawForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="sourceAccountId" label="提现账户" rules={[{ required: true, message: '请选择提现账户' }]}>
            <Select placeholder="选择提现账户" size="large">
              {Object.entries(accountsByType)
                .filter(([type]) => ['wechat', 'alipay', 'bank', 'credit'].includes(type))
                .map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <ArrowRightOutlined style={{ fontSize: 20, color: '#faad14' }} />
          </div>

          <Form.Item name="targetAccountId" label="提现到" rules={[{ required: true, message: '请选择提现到' }]}>
            <Select placeholder="选择提现目标" size="large">
              {Object.entries(accountsByType)
                .filter(([type]) => ['cash', 'bank'].includes(type))
                .map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="amount" label="提现金额" rules={[{ required: true, message: '请输入提现金额' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="请输入提现金额" precision={2} min={0.01} size="large" prefix="¥" />
          </Form.Item>

          <Form.Item name="fee" label="提现手续费（默认免手续费）">
            <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} min={0} size="large" prefix="¥" />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input placeholder="提现备注（可选）" size="large" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><WalletOutlined style={{ color: '#52c41a' }} /><span>充值</span></div>}
        open={rechargeVisible}
        onOk={handleRechargeOk}
        onCancel={() => setRechargeVisible(false)}
        okText="确认充值"
        cancelText="取消"
        width={480}
      >
        <Form form={rechargeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="sourceAccountId" label="付款账户" rules={[{ required: true, message: '请选择付款账户' }]}>
            <Select placeholder="选择付款账户" size="large">
              {Object.entries(accountsByType)
                .filter(([type]) => ['bank', 'credit', 'cash'].includes(type))
                .map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <ArrowRightOutlined style={{ fontSize: 20, color: '#52c41a' }} />
          </div>

          <Form.Item name="targetAccountId" label="充值到" rules={[{ required: true, message: '请选择充值到' }]}>
            <Select placeholder="选择充值目标" size="large">
              {Object.entries(accountsByType)
                .filter(([type]) => ['wechat', 'alipay'].includes(type))
                .map(([type, accs]) => (
                <Select.OptGroup key={type} label={`${ACCOUNT_TYPE_ICONS[type] || '💰'} ${ACCOUNT_TYPE_LABELS[type] || type}`}>
                  {accs.map(acc => (
                    <Option key={acc.id} value={acc.id}>
                      {acc.name}{cardDisplay(acc.cardNo) ? ` (${cardDisplay(acc.cardNo)})` : ''} ¥{acc.balance.toFixed(2)}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="amount" label="充值金额" rules={[{ required: true, message: '请输入充值金额' }]}>
            <InputNumber style={{ width: '100%' }} placeholder="请输入充值金额" precision={2} min={0.01} size="large" prefix="¥" />
          </Form.Item>

          <Form.Item name="fee" label="充值手续费（默认免手续费）">
            <InputNumber style={{ width: '100%' }} placeholder="0.00" precision={2} min={0} size="large" prefix="¥" />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input placeholder="充值备注（可选）" size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Accounts
