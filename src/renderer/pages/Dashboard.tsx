import React, { useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Card, Row, Col, Statistic, List, Button, Tooltip, Select, Segmented } from 'antd'
import { PlusOutlined, RightOutlined } from '@ant-design/icons'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid, XAxis, YAxis, Legend, BarChart, Bar } from 'recharts'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from '../utils/constants'
import { fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import AIRecordModal, { AIMode } from '../components/AIRecordModal'

const TREND_PERIODS = [
  { label: '近7天', value: 7 },
  { label: '近15天', value: 15 },
  { label: '近30天', value: 30 },
  { label: '近90天', value: 90 },
  { label: '近半年', value: 180 },
  { label: '近一年', value: 365 }
]

interface DashboardProps {
  onNavigate?: (key: string) => void
  onQuickRecord?: () => void
  isDark?: boolean
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onQuickRecord, isDark = true }) => {
  const { items: records, loading } = useSelector((state: RootState) => state.records)
  const { items: accounts } = useSelector((state: RootState) => state.accounts)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { items: budgets } = useSelector((state: RootState) => state.budgets)

  const [trendDays, setTrendDays] = useState(30)
  const [trendFilter, setTrendFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryChartType, setCategoryChartType] = useState<'pie' | 'bar'>('pie')
  const [accountChartType, setAccountChartType] = useState<'pie' | 'bar'>('pie')
  const dispatch = useDispatch<AppDispatch>()
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiMode, setAiMode] = useState<AIMode>('text')

  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const TERTIARY = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'
  const NOTE_COLOR = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'

  const today = dayjs().format('YYYY-MM-DD')
  const thisMonth = dayjs().month()
  const thisYear = dayjs().year()
  const lastMonth = dayjs().subtract(1, 'month')

  const getEffectiveAmount = (r: { type: string; amount: number; refundAmount?: number; shippingFee?: number }): number => {
    if (r.type === 'expense' && r.refundAmount) {
      return Math.max(0, r.amount - r.refundAmount + (r.shippingFee || 0))
    }
    return r.amount
  }

  const todayRecords = records.filter(r => r.date === today)
  const thisMonthRecords = records.filter(r => dayjs(r.date).month() === thisMonth && dayjs(r.date).year() === thisYear)
  const lastMonthRecords = records.filter(r => dayjs(r.date).month() === lastMonth.month() && dayjs(r.date).year() === lastMonth.year())

  const todayIncome = todayRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
  const thisMonthIncome = thisMonthRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
  const thisMonthExpense = thisMonthRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
  const lastMonthExpense = lastMonthRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
  const expenseTrend = lastMonthExpense > 0 ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense * 100).toFixed(1) : '0.0'
  const expenseTrendUp = Number(expenseTrend) > 0

  const getCategoryById = (id: number) => categories.find(c => c.id === id)
  const getAccountById = (id: number) => accounts.find(a => a.id === id)

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0)

  const getBudgetForCategory = (categoryId: number) => {
    return budgets.find(b => b.categoryId === categoryId && b.period === 'monthly' && b.year === thisYear && (b.month === thisMonth + 1 || b.month == null))
  }

  const expenseByCategory = useMemo(() => {
    const categoryMap = new Map<number, number>()
    thisMonthRecords.filter(r => r.type === 'expense').forEach(r => {
      const current = categoryMap.get(r.categoryId) || 0
      categoryMap.set(r.categoryId, current + getEffectiveAmount(r))
    })
    return Array.from(categoryMap.entries())
      .map(([categoryId, amount]) => {
        const category = getCategoryById(categoryId)
        const budget = getBudgetForCategory(categoryId)
        return {
          name: category?.name || '未知',
          value: amount,
          color: category?.color || '#8884d8',
          icon: category?.icon || '💸',
          categoryId,
          budget: budget?.amount || 0
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [thisMonthRecords, categories, budgets])

  const expenseByAccount = useMemo(() => {
    const accountMap = new Map<number, number>()
    thisMonthRecords.filter(r => r.type === 'expense').forEach(r => {
      const current = accountMap.get(r.accountId) || 0
      accountMap.set(r.accountId, current + getEffectiveAmount(r))
    })
    return Array.from(accountMap.entries())
      .map(([accountId, amount]) => {
        const account = getAccountById(accountId)
        return { name: account?.name || '未知', value: amount, color: ACCOUNT_TYPE_COLORS[account?.type || 'other'] || '#8884d8', icon: ACCOUNT_TYPE_ICONS[account?.type || 'other'] || '💰' }
      })
      .sort((a, b) => b.value - a.value)
  }, [thisMonthRecords, accounts])

  const dailyTrend = useMemo(() => {
    const days = []
    for (let i = trendDays - 1; i >= 0; i--) {
      days.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
    }
    return days.map(date => {
      const dayRecords = records.filter(r => r.date === date)
      return {
        date: trendDays <= 31 ? dayjs(date).format('MM-DD') : dayjs(date).format('YYYY-MM-DD'),
        income: dayRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0),
        expense: dayRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
      }
    })
  }, [records, trendDays])

  const recentRecords = [...records]
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
    .slice(0, 5)

  const renderPaymentTag = (accountId: number) => {
    const account = getAccountById(accountId)
    if (!account) return null
    const icon = ACCOUNT_TYPE_ICONS[account.type] || '💰'
    const bgColor = ACCOUNT_TYPE_COLORS[account.type] || '#667eea'
    return (
      <span className="payment-tag" style={{ background: bgColor + '22', color: bgColor, border: `1px solid ${bgColor}33` }}>
        {icon} {account.name}
      </span>
    )
  }

  const renderOuterPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180
    const isSmall = percent < 0.05
    const radius = outerRadius + (isSmall ? 30 : 22)
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const textAnchor = x > cx ? 'start' : 'end'
    const displayText = `${name} ${(percent * 100).toFixed(0)}%`
    const innerX = cx + (outerRadius + 4) * Math.cos(-midAngle * RADIAN)
    const innerY = cy + (outerRadius + 4) * Math.sin(-midAngle * RADIAN)
    return (
      <g>
        {isSmall && (
          <line x1={innerX} y1={innerY} x2={x} y2={y} stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} strokeWidth={1} />
        )}
        <text x={x} y={y} fill={isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'} textAnchor={textAnchor} dominantBaseline="central" fontSize={isSmall ? 11 : 12} fontWeight={500}>
          {displayText}
        </text>
      </g>
    )
  }

  const makeTooltipStyle = (accentColor: string) => ({
    background: isDark ? '#1a1a2e' : '#ffffff',
    border: `2px solid ${accentColor}`,
    borderRadius: 10,
    color: isDark ? '#ffffff' : '#1a1a1a',
    boxShadow: `0 4px 16px ${accentColor}33`,
    fontSize: 13,
    padding: '8px 12px'
  })

  const axisTickColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'

  const renderCategoryTooltip = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null
    const data = payload[0]
    const entry = expenseByCategory.find(e => e.name === data.name)
    const accentColor = entry?.color || '#667eea'
    return (
      <div style={{ background: isDark ? '#1a1a2e' : '#ffffff', border: `2px solid ${accentColor}`, borderRadius: 10, padding: '8px 14px', boxShadow: `0 4px 16px ${accentColor}44`, fontSize: 13 }}>
        <div style={{ color: accentColor, fontWeight: 700, marginBottom: 4 }}>{entry?.icon} {data.name}</div>
        <div style={{ color: isDark ? '#fff' : '#1a1a1a', fontWeight: 600 }}>支出 ¥{Number(data.value).toFixed(2)}</div>
        <div style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)', fontSize: 11, marginTop: 2 }}>占比 {(Number(data.value) / thisMonthExpense * 100).toFixed(1)}%</div>
        {entry && entry.budget > 0 && (
          <div style={{ marginTop: 4, padding: '4px 8px', borderRadius: 6, background: entry.value > entry.budget ? 'rgba(255,77,79,0.12)' : 'rgba(82,196,26,0.12)', fontSize: 11 }}>
            <span style={{ color: entry.value > entry.budget ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              预算 ¥{entry.budget.toFixed(2)} · {entry.value > entry.budget ? '超支' : '剩余'} ¥{Math.abs(entry.budget - entry.value).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderAccountTooltip = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null
    const data = payload[0]
    const entry = expenseByAccount.find(e => e.name === data.name)
    const accentColor = entry?.color || '#667eea'
    return (
      <div style={{ background: isDark ? '#1a1a2e' : '#ffffff', border: `2px solid ${accentColor}`, borderRadius: 10, padding: '8px 14px', boxShadow: `0 4px 16px ${accentColor}44`, fontSize: 13 }}>
        <div style={{ color: accentColor, fontWeight: 700, marginBottom: 4 }}>{entry?.icon} {data.name}</div>
        <div style={{ color: isDark ? '#fff' : '#1a1a1a', fontWeight: 600 }}>支出 ¥{Number(data.value).toFixed(2)}</div>
        <div style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)', fontSize: 11, marginTop: 2 }}>占比 {(Number(data.value) / thisMonthExpense * 100).toFixed(1)}%</div>
      </div>
    )
  }

  const chartSegmented = (value: 'pie' | 'bar', onChange: (v: 'pie' | 'bar') => void) => (
    <Segmented
      size="small"
      value={value}
      onChange={onChange as any}
      options={[
        { label: '饼图', value: 'pie' },
        { label: '柱图', value: 'bar' }
      ]}
    />
  )

  const renderCategoryPie = () => (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={expenseByCategory}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          labelLine={{ stroke: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', strokeWidth: 1 }}
          label={renderOuterPieLabel}
          animationBegin={0}
          animationDuration={800}
        >
          {expenseByCategory.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color || '#8884d8'} stroke="none" />))}
        </Pie>
        <RechartsTooltip content={renderCategoryTooltip} />
      </PieChart>
    </ResponsiveContainer>
  )

  const renderCategoryBar = () => (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={expenseByCategory} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} horizontal={false} />
        <XAxis type="number" fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `¥${v}`} />
        <YAxis type="category" dataKey="name" fontSize={12} tick={{ fill: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} width={60} />
        <RechartsTooltip content={renderCategoryTooltip} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
          {expenseByCategory.map((entry, index) => {
            const budget = entry.budget
            const overBudget = budget > 0 && entry.value > budget
            return <Cell key={`bar-${index}`} fill={overBudget ? '#ff4d4f' : entry.color} stroke="none" />
          })}
        </Bar>
        {expenseByCategory.some(e => e.budget > 0) && (
          <Bar dataKey="budget" fill="rgba(250,173,20,0.25)" radius={[0, 4, 4, 0]} barSize={18} name="预算" />
        )}
      </BarChart>
    </ResponsiveContainer>
  )

  const renderAccountPie = () => (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={expenseByAccount}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          labelLine={{ stroke: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', strokeWidth: 1 }}
          label={renderOuterPieLabel}
          animationBegin={0}
          animationDuration={800}
        >
          {expenseByAccount.map((entry, index) => (<Cell key={`acc-${index}`} fill={entry.color} stroke="none" />))}
        </Pie>
        <RechartsTooltip content={renderAccountTooltip} />
      </PieChart>
    </ResponsiveContainer>
  )

  const renderAccountBar = () => (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={expenseByAccount} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} horizontal={false} />
        <XAxis type="number" fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `¥${v}`} />
        <YAxis type="category" dataKey="name" fontSize={12} tick={{ fill: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} width={60} />
        <RechartsTooltip content={renderAccountTooltip} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
          {expenseByAccount.map((entry, index) => (<Cell key={`acc-bar-${index}`} fill={entry.color} stroke="none" />))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={8}>
          <Card className="stat-card income" style={{ background: 'linear-gradient(135deg, rgba(82,196,26,0.12) 0%, rgba(82,196,26,0.04) 100%)', border: '1px solid rgba(82,196,26,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 12, color: SECONDARY }}>本月收入</span>} value={thisMonthIncome} precision={2} prefix={<span style={{ fontSize: 14 }}>📈</span>} valueStyle={{ color: '#52c41a', fontSize: 18, fontWeight: 700 }} />
            <div style={{ marginTop: 4, fontSize: 11, color: TERTIARY }}>今日 +{todayIncome.toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="stat-card expense" style={{ background: 'linear-gradient(135deg, rgba(255,77,79,0.12) 0%, rgba(255,77,79,0.04) 100%)', border: '1px solid rgba(255,77,79,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 12, color: SECONDARY }}>本月支出</span>} value={thisMonthExpense} precision={2} prefix={<span style={{ fontSize: 14 }}>📉</span>} valueStyle={{ color: '#ff4d4f', fontSize: 18, fontWeight: 700 }} />
            <div style={{ marginTop: 4, fontSize: 11, color: expenseTrendUp ? '#ff4d4f' : '#52c41a' }}>较上月 {expenseTrendUp ? '↑' : '↓'} {Math.abs(Number(expenseTrend))}%</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="stat-card balance" style={{ background: 'linear-gradient(135deg, rgba(102,126,234,0.12) 0%, rgba(102,126,234,0.04) 100%)', border: '1px solid rgba(102,126,234,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 12, color: SECONDARY }}>本月结余</span>} value={thisMonthIncome - thisMonthExpense} precision={2} prefix={<span style={{ fontSize: 14 }}>💎</span>} valueStyle={{ color: '#667eea', fontSize: 18, fontWeight: 700 }} />
            <div style={{ marginTop: 4, fontSize: 11, color: TERTIARY }}>储蓄率 {thisMonthIncome > 0 ? ((thisMonthIncome - thisMonthExpense) / thisMonthIncome * 100).toFixed(1) : 0}%</div>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#fff'
            }}>🤖</span>
            <span style={{ fontWeight: 600 }}>AI 智能记账</span>
          </div>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={() => onQuickRecord ? onQuickRecord() : onNavigate?.('2')}
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
          >
            手动记账
          </Button>
        }
        styles={{ body: { padding: '16px 20px' } }}
        style={{ marginBottom: 24, borderColor: 'rgba(102,126,234,0.2)' }}
      >
        <Row gutter={[16, 12]}>
          {[
            { key: 'text' as AIMode, icon: '💬', label: '文本记账', desc: '输入文字智能识别', color: '#667eea', bg: 'rgba(102,126,234,0.08)' },
            { key: 'screenshot' as AIMode, icon: '📷', label: '截图记账', desc: '截取屏幕识别', color: '#52c41a', bg: 'rgba(82,196,26,0.08)' },
            { key: 'camera' as AIMode, icon: '📸', label: '拍照识别', desc: '拍照自动记账', color: '#fa8c16', bg: 'rgba(250,140,22,0.08)' },
            { key: 'voice' as AIMode, icon: '🎤', label: '语音记账', desc: '语音输入记账', color: '#f5222d', bg: 'rgba(245,34,45,0.08)' },
          ].map(btn => (
            <Col xs={12} sm={12} md={6} key={btn.key}>
              <Card hoverable
                className="ai-mode-card"
                style={{ borderColor: btn.color, borderWidth: 1, background: btn.bg, textAlign: 'center' }}
                styles={{ body: { padding: '16px 12px' } }}
                onClick={() => { setAiMode(btn.key); setAiModalOpen(true) }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{btn.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: btn.color, marginBottom: 2 }}>{btn.label}</div>
                <div style={{ fontSize: 11, color: TERTIARY }}>{btn.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>📊 收支趋势</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Segmented
                size="small"
                value={trendFilter}
                onChange={v => setTrendFilter(v as 'all' | 'income' | 'expense')}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '收入', value: 'income' },
                  { label: '支出', value: 'expense' },
                ]}
              />
              <Select
                size="small"
                value={trendDays}
                onChange={setTrendDays}
                style={{ width: 110 }}
                options={TREND_PERIODS.map(p => ({ value: p.value, label: p.label }))}
              />
            </div>
          </div>
        }
        style={{ marginBottom: 24 }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={dailyTrend}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#52c41a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4d4f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff4d4f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} />
            <XAxis dataKey="date" fontSize={11} tick={{ fill: axisTickColor }} interval={trendDays > 60 ? 14 : trendDays > 30 ? 6 : undefined} />
            <YAxis fontSize={11} tick={{ fill: axisTickColor }} />
            <RechartsTooltip
              contentStyle={makeTooltipStyle('#667eea')}
              itemStyle={{ color: isDark ? '#fff' : '#1a1a1a' }}
              labelStyle={{ color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)', fontWeight: 600 }}
              formatter={(value: number, name: string) => {
                const label = name === 'income' ? '收入' : name === 'expense' ? '支出' : name
                return [`¥${value.toFixed(2)}`, label]
              }}
            />
            <Legend />
            {(trendFilter === 'all' || trendFilter === 'income') && (
              <Area type="monotone" dataKey="income" stroke="#52c41a" strokeWidth={2} fill="url(#incomeGradient)" name="收入" />
            )}
            {(trendFilter === 'all' || trendFilter === 'expense') && (
              <Area type="monotone" dataKey="expense" stroke="#ff4d4f" strokeWidth={2} fill="url(#expenseGradient)" name="支出" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>🥧 支出构成</span>
                {chartSegmented(categoryChartType, setCategoryChartType)}
              </div>
            }
            style={{ height: '100%' }}
          >
            {expenseByCategory.length > 0 ? (
              <>
                {categoryChartType === 'pie' ? renderCategoryPie() : renderCategoryBar()}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  {expenseByCategory.map((item, index) => {
                    const percent = thisMonthExpense > 0 ? (item.value / thisMonthExpense * 100).toFixed(1) : '0.0'
                    const budget = item.budget
                    const overBudget = budget > 0 && item.value > budget
                    return (
                      <Tooltip key={index} title={
                        budget > 0
                          ? `¥${item.value.toFixed(2)} / 预算 ¥${budget.toFixed(2)}${overBudget ? ' (超支)' : ' (剩余 ¥' + (budget - item.value).toFixed(2) + ')'}`
                          : `¥${item.value.toFixed(2)}`
                      }>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6,
                          background: overBudget ? 'rgba(255,77,79,0.12)' : item.color + '22',
                          fontSize: 12, color: overBudget ? '#ff4d4f' : item.color, fontWeight: 500,
                          border: `1px solid ${overBudget ? 'rgba(255,77,79,0.25)' : item.color + '33'}`, cursor: 'default'
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: overBudget ? '#ff4d4f' : item.color, display: 'inline-block' }} />
                          {item.icon} {item.name} {percent}%
                          {budget > 0 && <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 2 }}>预算{overBudget ? '⚠' : '✓'}</span>}
                        </span>
                      </Tooltip>
                    )
                  })}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: SECONDARY }}>暂无支出数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>💳 支出账户分布</span>
                {chartSegmented(accountChartType, setAccountChartType)}
              </div>
            }
            style={{ height: '100%' }}
          >
            {expenseByAccount.length > 0 ? (
              <>
                {accountChartType === 'pie' ? renderAccountPie() : renderAccountBar()}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                  {expenseByAccount.map((item, index) => {
                    const percent = thisMonthExpense > 0 ? (item.value / thisMonthExpense * 100).toFixed(1) : '0.0'
                    return (
                      <span key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: item.color + '22', fontSize: 12, color: item.color, fontWeight: 500, border: `1px solid ${item.color}33` }}>
                        {item.icon} {item.name} {percent}%
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: SECONDARY }}>暂无数据</div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title={<span style={{ fontWeight: 600 }}>💰 账户概览</span>}>
            <div style={{ marginBottom: 16, padding: '12px', background: 'linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.08) 100%)', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ color: SECONDARY, fontSize: 12, marginBottom: 2 }}>总资产</div>
              <div style={{ color: '#667eea', fontSize: 22, fontWeight: 700, fontFamily: 'Inter, monospace' }}>¥{totalBalance.toFixed(2)}</div>
            </div>
            <List
              dataSource={accounts}
              renderItem={(account) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: account.color || '#667eea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                        {ACCOUNT_TYPE_ICONS[account.type] || '💰'}
                      </div>
                      <span style={{ fontWeight: 500 }}>{account.name}</span>
                    </div>
                    <span style={{ fontWeight: 600, fontFamily: 'Inter, monospace' }}>¥{account.balance.toFixed(2)}</span>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>🕐 最近记录</span>
                <Button type="link" onClick={() => onNavigate?.('2')} style={{ padding: 0 }}>
                  查看全部 <RightOutlined />
                </Button>
              </div>
            }
          >
            <List
              loading={loading}
              dataSource={recentRecords}
              locale={{ emptyText: <span style={{ color: SECONDARY }}>暂无记录</span> }}
              renderItem={(record) => {
                const category = getCategoryById(record.categoryId)
                return (
                  <List.Item className={record.type === 'expense' ? (record.refundStatus && record.refundStatus !== 'none' ? 'record-item-refunded' : 'record-item-expense') : 'record-item-income'}>
                    <List.Item.Meta
                      avatar={
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: (category?.color || '#667eea') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                          {category?.icon || '💸'}
                        </div>
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{category?.name}</span>
                            {record.refundStatus && record.refundStatus !== 'none' && (
                              <span style={{ fontSize: 11, color: '#faad14' }}>
                                {record.refundStatus === 'full' ? '(已退款)' : '(部分退款)'}
                              </span>
                            )}
                            {renderPaymentTag(record.accountId)}
                          </div>
                          <span style={{ color: record.type === 'income' ? '#52c41a' : '#ff4d4f', fontSize: 16, fontWeight: 700, fontFamily: 'Inter, monospace' }}>
                            {record.type === 'income' ? '+' : '-'}¥{getEffectiveAmount(record).toFixed(2)}
                          </span>
                        </div>
                      }
                      description={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: NOTE_COLOR, fontWeight: record.note ? 500 : 400 }}>{record.note || '无备注'}</span>
                          <span style={{ fontSize: 13, color: TERTIARY }}>{record.date} {record.createdAt ? dayjs(record.createdAt).format('HH:mm:ss') : ''}</span>
                        </div>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          </Card>
        </Col>
      </Row>
      <AIRecordModal
        open={aiModalOpen}
        mode={aiMode}
        onClose={() => setAiModalOpen(false)}
        onSuccess={() => {
          dispatch(fetchRecords() as any)
          dispatch(fetchAccounts() as any)
        }}
      />
    </div>
  )
}

export default Dashboard
