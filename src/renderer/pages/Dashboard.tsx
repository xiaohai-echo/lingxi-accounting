import React, { useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Card, Row, Col, Statistic, List, Button, Tooltip, Select, Segmented, Dropdown, Checkbox, Input, App } from 'antd'
import { RightOutlined, SendOutlined, DeleteOutlined, LoadingOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid, XAxis, YAxis, Legend, BarChart, Bar, LineChart, Line, ComposedChart } from 'recharts'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from '../utils/constants'
import { fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import AIRecordModal, { AIMode } from '../components/AIRecordModal'
import { generateVisualization, VizConfig, VizSeries } from '../services/ai'

interface SavedVizItem {
  id: string
  config: VizConfig
  query: string
  savedAt: string
}

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

const SAVED_VIZ_KEY = 'lingxi_saved_viz_list'

const loadSavedVizList = (): SavedVizItem[] => {
  try {
    const raw = localStorage.getItem(SAVED_VIZ_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onQuickRecord, isDark = true }) => {
  const { items: records, loading } = useSelector((state: RootState) => state.records)
  const { items: accounts } = useSelector((state: RootState) => state.accounts)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { items: budgets } = useSelector((state: RootState) => state.budgets)

  const [trendDays, setTrendDays] = useState(30)
  const [trendFilter, setTrendFilter] = useState<string[]>(['income', 'expense', 'balance'])
  const [categoryChartType, setCategoryChartType] = useState<'pie' | 'bar'>('pie')
  const [accountChartType, setAccountChartType] = useState<'pie' | 'bar'>('pie')
  const dispatch = useDispatch<AppDispatch>()
  const { message } = App.useApp()
  const [aiCardCollapsed, setAiCardCollapsed] = useState(true)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiMode, setAiMode] = useState<AIMode>('text')
  const [vizQuery, setVizQuery] = useState('')
  const [vizLoading, setVizLoading] = useState(false)
  const [vizConfig, setVizConfig] = useState<VizConfig | null>(null)
  const [savedVizList, setSavedVizList] = useState<SavedVizItem[]>(loadSavedVizList)

  const handleVizGenerate = () => {
    if (!vizQuery.trim() || vizLoading) return
    setVizLoading(true)
    setVizConfig(null)
    console.log('[Viz] Starting generation, query:', vizQuery.trim())
    console.log('[Viz] Data size: records=', records.length, 'accounts=', accounts.length, 'categories=', categories.length)

    generateVisualization(vizQuery.trim(), {
      records: records.map(r => ({ date: r.date, type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: r.accountId, note: r.note, title: r.title })),
      accounts: accounts.filter(a => a.id != null).map(a => ({ id: a.id!, name: a.name, type: a.type, balance: a.balance })),
      categories: categories.filter(c => c.id != null).map(c => ({ id: c.id!, name: c.name, type: c.type, icon: c.icon, color: c.color }))
    }, !!isDark)
      .then(config => {
        console.log('[Viz] Generation success:', config.chartType, 'data points:', config.data.length)
        setVizConfig(config)
        setVizLoading(false)
      })
      .catch(err => {
        console.error('[Viz] Generation failed:', err)
        setVizLoading(false)
        const errMsg = err.message || '可视化生成失败，请重试'
        if (errMsg === 'NO_API_KEY') message.error('请先配置 API Key')
        else message.error(errMsg)
      })
  }

  const SECONDARY = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const TERTIARY = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'

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
    let runningBalance = 0
    return days.map(date => {
      const dayRecords = records.filter(r => r.date === date)
      const dayIncome = dayRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
      const dayExpense = dayRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + getEffectiveAmount(r), 0)
      runningBalance += dayIncome - dayExpense
      return {
        date: trendDays <= 31 ? dayjs(date).format('MM-DD') : dayjs(date).format('YYYY-MM-DD'),
        income: dayIncome,
        expense: dayExpense,
        balance: runningBalance
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

  const vizFormatValue = (value: number, props: any, allSeries: VizSeries[]) => {
    const matched = allSeries.find(s => s.dataKey === props?.dataKey)
    if (matched?.unit === 'count') return `${value}笔`
    return `¥${Number(value).toFixed(2)}`
  }

  const vizSeriesName = (s: VizSeries, showUnit: boolean = true) => {
    const icon = s.icon ? `${s.icon} ` : ''
    const unit = showUnit ? (s.unit === 'count' ? '(笔)' : '(元)') : ''
    return `${icon}${s.name}${unit}`
  }

  const handleVizSave = () => {
    if (!vizConfig) return
    const item: SavedVizItem = {
      id: `viz-${Date.now()}`,
      config: vizConfig,
      query: vizQuery.trim(),
      savedAt: dayjs().format('YYYY-MM-DD HH:mm'),
    }
    setSavedVizList(prev => {
      const next = [item, ...prev]
      localStorage.setItem(SAVED_VIZ_KEY, JSON.stringify(next))
      return next
    })
    setVizConfig(null)
    setVizQuery('')
    message.success('图表已保存')
  }

  const handleVizDelete = (id: string) => {
    setSavedVizList(prev => {
      const next = prev.filter(v => v.id !== id)
      localStorage.setItem(SAVED_VIZ_KEY, JSON.stringify(next))
      return next
    })
  }

  const renderVizChart = (cfg: VizConfig, gradientPrefix: string = 'viz') => {
    if (cfg.chartType === 'pie') {
      return (
        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <Pie
            data={cfg.data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            label={({ name, percent, cx, cy, outerRadius: or, midAngle, index: idx }: any) => {
              const RADIAN = Math.PI / 180
              const radius = or + 18
              const lx = cx + radius * Math.cos(-midAngle * RADIAN)
              const ly = cy + radius * Math.sin(-midAngle * RADIAN)
              const textAnchor = lx > cx ? 'start' : 'end'
              const sectorColor = cfg.data[idx]?.color || '#667eea'
              const icon = cfg.data[idx]?.icon
              return (
                <text x={lx} y={ly} textAnchor={textAnchor} fill={sectorColor} fontSize={11} dominantBaseline="central" fontWeight={500}>
                  {icon ? `${icon} ` : ''}{name} {(percent * 100).toFixed(0)}%
                </text>
              )
            }}
            labelLine={({ points, index: idx }: any) => {
              const sectorColor = cfg.data[idx]?.color || '#667eea'
              return <polyline points={points.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={sectorColor} strokeWidth={1} opacity={0.6} />
            }}
            animationBegin={0}
            animationDuration={800}
          >
            {cfg.data.map((entry: any, index: number) => (
              <Cell key={`${gradientPrefix}-cell-${index}`} fill={entry.color || '#667eea'} stroke="none" />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={makeTooltipStyle('#13c2c2')}
            formatter={(value: number, name: string) => {
              const entry = cfg.data.find((d: any) => d.name === name)
              const icon = entry?.icon ? `${entry.icon} ` : ''
              return [`${icon}¥${Number(value).toFixed(2)}`, name]
            }}
          />
        </PieChart>
      )
    }
    if (cfg.chartType === 'line') {
      return (
        <LineChart data={cfg.data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} />
          <XAxis dataKey={cfg.xKey} fontSize={11} tick={{ fill: axisTickColor }} />
          <YAxis fontSize={11} tick={{ fill: axisTickColor }} />
          <RechartsTooltip
            contentStyle={makeTooltipStyle('#13c2c2')}
            formatter={(value: number, name: string, props: any) => [vizFormatValue(value, props, cfg.series || []), name]}
          />
          <Legend />
          {(cfg.series || []).map((s, i) => (
            <Line key={`${gradientPrefix}-line-${i}`} type="monotone" dataKey={s.dataKey} name={vizSeriesName(s, false)} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      )
    }
    if (cfg.chartType === 'area') {
      return (
        <AreaChart data={cfg.data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <defs>
            {(cfg.series || []).map((s, i) => (
              <linearGradient key={`${gradientPrefix}-grad-${i}`} id={`${gradientPrefix}Gradient${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} />
          <XAxis dataKey={cfg.xKey} fontSize={11} tick={{ fill: axisTickColor }} />
          <YAxis fontSize={11} tick={{ fill: axisTickColor }} />
          <RechartsTooltip
            contentStyle={makeTooltipStyle('#13c2c2')}
            formatter={(value: number, name: string, props: any) => [vizFormatValue(value, props, cfg.series || []), name]}
          />
          <Legend />
          {(cfg.series || []).map((s, i) => (
            <Area key={`${gradientPrefix}-area-${i}`} type="monotone" dataKey={s.dataKey} name={vizSeriesName(s, false)} stroke={s.color} strokeWidth={2} fill={`url(#${gradientPrefix}Gradient${i})`} />
          ))}
        </AreaChart>
      )
    }
    if (cfg.chartType === 'composed') {
      return (
        <ComposedChart data={cfg.data} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} />
          <XAxis dataKey={cfg.xKey} fontSize={11} tick={{ fill: axisTickColor }} />
          <YAxis yAxisId="left" fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `¥${v}`} label={{ value: '金额(元)', angle: -90, position: 'insideLeft', offset: 30, style: { fill: axisTickColor, fontSize: 11 } }} />
          <YAxis yAxisId="right" orientation="right" fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `${v}`} label={{ value: (cfg.rightSeries || []).some(s => s.unit === 'count') ? '数量(笔)' : '金额(元)', angle: 90, position: 'insideRight', offset: 30, style: { fill: axisTickColor, fontSize: 11 } }} />
          <RechartsTooltip
            contentStyle={makeTooltipStyle('#13c2c2')}
            formatter={(value: number, name: string, props: any) => {
              const allSeries = [...(cfg.series || []), ...(cfg.rightSeries || [])]
              return [vizFormatValue(value, props, allSeries), name]
            }}
          />
          <Legend content={(() => {
            const isSingleBarSeries = (cfg.series || []).length === 1
            if (!isSingleBarSeries) return undefined
            const barColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#f5222d']
            return () => {
              const textColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'
              return (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px' }}>
                  {cfg.data.map((entry: any, idx: number) => (
                    <li key={`${gradientPrefix}-cleg-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: textColor }}>
                      <svg width="14" height="14" viewBox="0 0 32 32" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <rect width="32" height="32" rx="4" fill={barColors[idx % barColors.length]} />
                      </svg>
                      <span>{String(entry[cfg.xKey || 'name'] || entry.name || `项${idx + 1}`)}</span>
                    </li>
                  ))}
                  {(cfg.rightSeries || []).map((s, i) => (
                    <li key={`${gradientPrefix}-cleg-line-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: textColor }}>
                      <svg width="14" height="14" viewBox="0 0 32 32" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <line x1="0" y1="16" x2="32" y2="16" stroke={s.color} strokeWidth="4" />
                      </svg>
                      <span>{vizSeriesName(s)}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          })()} />
          {(cfg.series || []).map((s, i) => {
            const isSingleBarSeries = (cfg.series || []).length === 1
            const barColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#f5222d']
            return (
              <Bar key={`${gradientPrefix}-cbar-${i}`} yAxisId="left" dataKey={s.dataKey} name={vizSeriesName(s)} fill={s.color} radius={[4, 4, 0, 0]} barSize={28}>
                {isSingleBarSeries && cfg.data.map((_: any, idx: number) => (
                  <Cell key={`${gradientPrefix}-cbarcell-${idx}`} fill={barColors[idx % barColors.length]} />
                ))}
              </Bar>
            )
          })}
          {(cfg.rightSeries || []).map((s, i) => (
            <Line key={`${gradientPrefix}-cline-${i}`} yAxisId="right" type="monotone" dataKey={s.dataKey} name={vizSeriesName(s)} stroke={s.color} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          ))}
        </ComposedChart>
      )
    }
    return (
      <BarChart
        data={cfg.data}
        layout={cfg.layout === 'vertical' ? 'vertical' : 'horizontal'}
        margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} />
        {cfg.layout === 'vertical' ? (
          <>
            <XAxis type="number" fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `¥${v}`} />
            <YAxis type="category" dataKey={cfg.xKey} fontSize={12} tick={{ fill: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} width={60} />
          </>
        ) : (
          <>
            <XAxis dataKey={cfg.xKey} fontSize={11} tick={{ fill: axisTickColor }} />
            <YAxis fontSize={11} tick={{ fill: axisTickColor }} tickFormatter={(v: number) => `¥${v}`} />
          </>
        )}
        <RechartsTooltip
          contentStyle={makeTooltipStyle('#13c2c2')}
          formatter={(value: number, name: string, props: any) => [vizFormatValue(value, props, cfg.series || []), name]}
        />
        <Legend content={(() => {
          const isSingleSeries = (cfg.series || []).length === 1 && !cfg.stack
          if (!isSingleSeries) return undefined
          const barColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#f5222d']
          return () => {
            const textColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'
            return (
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px' }}>
                {cfg.data.map((entry: any, idx: number) => {
                  const catInfo = (cfg.series || [])[0]
                  const icon = entry.icon || catInfo?.icon
                  return (
                    <li key={`${gradientPrefix}-leg-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: textColor }}>
                      <svg width="14" height="14" viewBox="0 0 32 32" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                        <rect width="32" height="32" rx="4" fill={barColors[idx % barColors.length]} />
                      </svg>
                      <span>{icon ? `${icon} ` : ''}{String(entry[cfg.xKey || 'name'] || entry.name || `项${idx + 1}`)}</span>
                    </li>
                  )
                })}
              </ul>
            )
          }
        })()} />
        {(cfg.series || []).map((s, i) => {
          const isSingleSeries = (cfg.series || []).length === 1 && !cfg.stack
          const barColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#f5222d']
          return (
            <Bar key={`${gradientPrefix}-bar-${i}`} dataKey={s.dataKey} name={vizSeriesName(s, false)} fill={s.color} radius={cfg.layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]} barSize={24} stackId={cfg.stack ? 'stack' : undefined}>
              {isSingleSeries && cfg.data.map((_: any, idx: number) => (
                <Cell key={`${gradientPrefix}-barcell-${idx}`} fill={barColors[idx % barColors.length]} />
              ))}
            </Bar>
          )
        })}
      </BarChart>
    )
  }

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
          <Card className="stat-card income" styles={{ body: { padding: '12px 16px' } }} style={{ background: 'linear-gradient(135deg, rgba(82,196,26,0.12) 0%, rgba(82,196,26,0.04) 100%)', border: '1px solid rgba(82,196,26,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 11, color: SECONDARY }}>本月收入</span>} value={thisMonthIncome} precision={2} prefix={<span style={{ fontSize: 13 }}>📈</span>} valueStyle={{ color: '#52c41a', fontSize: 16, fontWeight: 700 }} />
            <div style={{ marginTop: 2, fontSize: 10, color: TERTIARY }}>今日 +{todayIncome.toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="stat-card expense" styles={{ body: { padding: '12px 16px' } }} style={{ background: 'linear-gradient(135deg, rgba(255,77,79,0.12) 0%, rgba(255,77,79,0.04) 100%)', border: '1px solid rgba(255,77,79,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 11, color: SECONDARY }}>本月支出</span>} value={thisMonthExpense} precision={2} prefix={<span style={{ fontSize: 13 }}>📉</span>} valueStyle={{ color: '#ff4d4f', fontSize: 16, fontWeight: 700 }} />
            <div style={{ marginTop: 2, fontSize: 10, color: expenseTrendUp ? '#ff4d4f' : '#52c41a' }}>较上月 {expenseTrendUp ? '↑' : '↓'} {Math.abs(Number(expenseTrend))}%</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8}>
          <Card className="stat-card balance" styles={{ body: { padding: '12px 16px' } }} style={{ background: 'linear-gradient(135deg, rgba(102,126,234,0.12) 0%, rgba(102,126,234,0.04) 100%)', border: '1px solid rgba(102,126,234,0.15)' }}>
            <Statistic title={<span style={{ fontSize: 11, color: SECONDARY }}>本月结余</span>} value={thisMonthIncome - thisMonthExpense} precision={2} prefix={<span style={{ fontSize: 13 }}>💎</span>} valueStyle={{ color: '#667eea', fontSize: 16, fontWeight: 700 }} />
            <div style={{ marginTop: 2, fontSize: 10, color: TERTIARY }}>储蓄率 {thisMonthIncome > 0 ? ((thisMonthIncome - thisMonthExpense) / thisMonthIncome * 100).toFixed(1) : 0}%</div>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setAiCardCollapsed(!aiCardCollapsed)}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#fff'
            }}>🤖</span>
            <span style={{ fontWeight: 600 }}>智能记账</span>
            <span style={{ fontSize: 11, color: SECONDARY, fontWeight: 400 }}>选择方式开始记账</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.25s', transform: aiCardCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        }
        styles={{ body: { padding: aiCardCollapsed ? 0 : '20px 20px', overflow: 'hidden', transition: 'padding 0.25s' } }}
        style={{ marginBottom: 24, borderColor: 'rgba(102,126,234,0.2)' }}
      >
        <div style={{ display: aiCardCollapsed ? 'none' : 'flex', gap: 14 }}>
          {[
            { key: 'manual' as const, icon: '✏️', label: '手动记账', desc: '手动填写记录', color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
            { key: 'text' as AIMode, icon: '💬', label: '文字记账', desc: '输入描述智能识别', color: '#667eea', bg: 'rgba(102,126,234,0.08)' },
            { key: 'voice' as AIMode, icon: '🎤', label: '语音记账', desc: '说话即可记账', color: '#f5222d', bg: 'rgba(245,34,45,0.08)' },
            { key: 'screenshot' as AIMode, icon: '🖼️', label: '图片记账', desc: '上传截图识别', color: '#52c41a', bg: 'rgba(82,196,26,0.08)' },
            { key: 'camera' as AIMode, icon: '📸', label: '拍照记账', desc: '拍照自动记账', color: '#fa8c16', bg: 'rgba(250,140,22,0.08)' },
          ].map(btn => (
            <Card hoverable
              key={btn.key}
              className="ai-mode-card"
              style={{ borderColor: btn.color, borderWidth: 1, background: btn.bg, textAlign: 'center', flex: 1, minWidth: 0 }}
              styles={{ body: { padding: '10px 6px' } }}
              onClick={() => {
                if (btn.key === 'manual') {
                  onQuickRecord ? onQuickRecord() : onNavigate?.('2')
                } else {
                  setAiMode(btn.key as AIMode)
                  setAiModalOpen(true)
                }
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 2 }}>{btn.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: btn.color }}>{btn.label}</div>
            </Card>
          ))}
        </div>
      </Card>

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>📊 收支趋势</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Dropdown
                trigger={['click']}
                popupRender={() => (
                  <div style={{
                    background: isDark ? '#1f1f3a' : '#fff',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    padding: '8px 12px',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`
                  }}>
                    <Checkbox.Group
                      value={trendFilter}
                      onChange={v => setTrendFilter(v.length === 0 ? ['income', 'expense', 'balance'] : v as string[])}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <Checkbox value="income">
                        <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>📈 收入</span>
                      </Checkbox>
                      <Checkbox value="expense">
                        <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>📉 支出</span>
                      </Checkbox>
                      <Checkbox value="balance">
                        <span style={{ color: '#667eea', fontWeight: 600, fontSize: 13 }}>💎 余额</span>
                      </Checkbox>
                    </Checkbox.Group>
                  </div>
                )}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 24, padding: '0 8px', fontSize: 12,
                  borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#d9d9d9'}`,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                  color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.88)',
                  whiteSpace: 'nowrap'
                }}>
                  显示类别
                  <span style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)' }}>▼</span>
                </div>
              </Dropdown>
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
          <AreaChart data={dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#52c41a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4d4f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff4d4f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#667eea" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#667eea" stopOpacity={0} />
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
                const label = name === 'income' ? '收入' : name === 'expense' ? '支出' : name === 'balance' ? '余额' : name
                return [`¥${value.toFixed(2)}`, label]
              }}
            />
            <Legend />
            {trendFilter.includes('income') && (
              <Area type="monotone" dataKey="income" stroke="#52c41a" strokeWidth={2} fill="url(#incomeGradient)" name="收入" />
            )}
            {trendFilter.includes('expense') && (
              <Area type="monotone" dataKey="expense" stroke="#ff4d4f" strokeWidth={2} fill="url(#expenseGradient)" name="支出" />
            )}
            {trendFilter.includes('balance') && (
              <Area type="monotone" dataKey="balance" stroke="#667eea" strokeWidth={2} fill="url(#balanceGradient)" name="余额" strokeDasharray="6 3" />
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
                const isRefunded = record.refundStatus && record.refundStatus !== 'none'
                const coreContent = record.title || record.note || category?.name || '未分类'
                const timeStr = record.createdAt ? dayjs(record.createdAt).format('HH:mm') : ''
                return (
                  <List.Item className={isRefunded ? 'record-item-refunded' : (record.type === 'expense' ? 'record-item-expense' : 'record-item-income')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                      <div style={{ width: 40, height: 52, borderRadius: 10, background: (category?.color || '#667eea') + '20', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{category?.icon || '💸'}</span>
                        <span style={{ fontSize: 10, color: SECONDARY, lineHeight: 1, maxWidth: 38, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category?.name}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                            {coreContent}
                            {isRefunded && <span style={{ fontSize: 11, color: '#faad14', marginLeft: 6 }}>{record.refundStatus === 'full' ? '(已退款)' : '(部分退款)'}</span>}
                          </span>
                          <span style={{ color: record.type === 'income' ? '#52c41a' : '#ff4d4f', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, monospace', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            {record.type === 'income' ? '+' : '-'}¥{getEffectiveAmount(record).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {renderSourceTag(record.source)}
                          {renderPaymentTag(record.accountId)}
                          <span style={{ color: TERTIARY, fontFamily: 'Inter, monospace', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>{timeStr}</span>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                )
              }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #13c2c2 0%, #667eea 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#fff'
            }}>🎨</span>
            <span style={{ fontWeight: 600 }}>智能可视化</span>
            <span style={{ fontSize: 11, color: SECONDARY, fontWeight: 400 }}>用自然语言描述你想看到的图表</span>
          </div>
        }
        style={{ marginBottom: 24, borderColor: 'rgba(19,194,194,0.2)' }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: vizConfig ? 16 : 0 }}>
          <Input
            placeholder="例如：展示本月各类别支出占比、最近7天收支趋势对比..."
            value={vizQuery}
            onChange={e => setVizQuery(e.target.value)}
            onPressEnter={handleVizGenerate}
            size="small"
            style={{ flex: 1, borderRadius: 8 }}
            suffix={vizLoading ? <LoadingOutlined style={{ color: '#13c2c2' }} /> : <span />}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            size="small"
            loading={vizLoading}
            onClick={handleVizGenerate}
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #13c2c2, #667eea)', border: 'none' }}
          >
            生成
          </Button>
          {vizConfig && (
            <>
              <Tooltip title="保存图表">
                <Button icon={<SaveOutlined />} size="small" onClick={handleVizSave} style={{ borderRadius: 8, color: '#52c41a', borderColor: '#52c41a' }} />
              </Tooltip>
              <Tooltip title="丢弃">
                <Button icon={<CloseOutlined />} size="small" onClick={() => { setVizConfig(null); setVizQuery('') }} style={{ borderRadius: 8 }} />
              </Tooltip>
            </>
          )}
        </div>
        {vizLoading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: SECONDARY }}>
            <LoadingOutlined style={{ fontSize: 32, color: '#13c2c2', marginBottom: 12 }} />
            <div style={{ fontSize: 14, marginTop: 8 }}>AI 正在生成可视化图表...</div>
            <div style={{ fontSize: 12, marginTop: 4, color: TERTIARY }}>这可能需要几秒钟</div>
          </div>
        )}
        {vizConfig && !vizLoading && (
          <div style={{ position: 'relative' }}>
            <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 15, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' }}>
              {vizConfig.title}
            </div>
            <ResponsiveContainer width="100%" height={380}>
              {renderVizChart(vizConfig, 'preview')}
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                onClick={handleVizSave}
                style={{ borderRadius: 8, background: 'linear-gradient(135deg, #52c41a, #13c2c2)', border: 'none' }}
              >
                保存图表
              </Button>
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={() => { setVizConfig(null); setVizQuery('') }}
                style={{ borderRadius: 8 }}
              >
                丢弃
              </Button>
            </div>
          </div>
        )}
        {!vizConfig && !vizLoading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: TERTIARY }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>输入描述，AI 将为你生成专属可视化图表</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {[
                { label: '各月消费金额及数量', icon: '📈' },
                { label: '各月收支及结余', icon: '💰' },
                { label: '各类别月度支出趋势', icon: '📊' },
                { label: '最近7天消费笔数', icon: '🔢' },
                { label: '最近30天收支及结余', icon: '📉' },
                { label: '本月支出占比', icon: '🥧' },
                { label: '上月收入占比', icon: '💵' },
                { label: '各账户支出', icon: '💳' },
              ].map((item, i) => (
                <span
                  key={i}
                  onClick={() => { setVizQuery(item.label) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 12px', borderRadius: 16, fontSize: 12,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                    cursor: 'pointer', transition: 'all 0.2s',
                    fontWeight: 500,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = isDark ? 'rgba(19,194,194,0.15)' : 'rgba(19,194,194,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(19,194,194,0.3)'
                    e.currentTarget.style.color = '#13c2c2'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                    e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'
                  }}
                >
                  {item.icon} {item.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {savedVizList.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' }}>
              📌 已保存的图表
            </span>
            <span style={{ fontSize: 12, color: TERTIARY }}>{savedVizList.length} 个</span>
          </div>
          <Row gutter={[16, 16]}>
            {savedVizList.map(item => (
              <Col xs={24} lg={12} key={item.id}>
                <Card
                  size="small"
                  style={{ borderColor: 'rgba(19,194,194,0.15)', background: isDark ? 'rgba(26,26,46,0.6)' : 'rgba(255,255,255,0.8)' }}
                  styles={{ body: { padding: '12px 16px' } }}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{item.config.title}</span>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleVizDelete(item.id)}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  }
                  extra={<span style={{ fontSize: 10, color: TERTIARY }}>{item.savedAt}</span>}
                >
                  <ResponsiveContainer width="100%" height={280}>
                    {renderVizChart(item.config, item.id)}
                  </ResponsiveContainer>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}

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
