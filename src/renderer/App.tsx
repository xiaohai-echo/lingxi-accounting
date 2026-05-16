import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { ConfigProvider, theme, Layout, Menu, Avatar, Dropdown, Button, Select, App as AntApp, Drawer, Spin } from 'antd'
import {
  DashboardOutlined, CreditCardOutlined, AppstoreOutlined,
  PieChartOutlined, SettingOutlined, LogoutOutlined, BookOutlined,
  MenuOutlined, SunOutlined, MoonOutlined, UserOutlined, FileTextOutlined
} from '@ant-design/icons'
import { SpeedInsights } from '@vercel/speed-insights/react'
import type { RootState, AppDispatch } from './store'
import { checkAuth, logoutUser } from './store/slices/userSlice'
import { setCurrentLedger, fetchLedgers } from './store/slices/ledgersSlice'
import { fetchRecords } from './store/slices/recordsSlice'
import { fetchAccounts } from './store/slices/accountsSlice'
import { fetchCategories } from './store/slices/categoriesSlice'
import { fetchBudgets } from './store/slices/budgetsSlice'
import Login from './pages/Login'
import logoImg from './assets/logo.png'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Records = lazy(() => import('./pages/Records'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Categories = lazy(() => import('./pages/Categories'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Settings = lazy(() => import('./pages/Settings'))
const LedgerManage = lazy(() => import('./pages/LedgerManage'))
const Logs = lazy(() => import('./pages/Logs'))

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '1', icon: <DashboardOutlined />, label: '首页概览' },
  { key: '2', icon: <CreditCardOutlined />, label: '记账记录' },
  { key: '3', icon: <CreditCardOutlined style={{ transform: 'rotate(180deg)' }} />, label: '账户管理' },
  { key: '4', icon: <AppstoreOutlined />, label: '类别管理' },
  { key: '5', icon: <PieChartOutlined />, label: '预算管理' },
  { key: '7', icon: <BookOutlined />, label: '账本管理' },
  { key: '8', icon: <FileTextOutlined />, label: '操作日志' },
  { key: '6', icon: <SettingOutlined />, label: '个人设置' },
]

const mobileMenuItems = [
  { key: '1', icon: <DashboardOutlined />, label: '概览' },
  { key: '2', icon: <CreditCardOutlined />, label: '记录' },
  { key: '3', icon: <CreditCardOutlined style={{ transform: 'rotate(180deg)' }} />, label: '账户' },
  { key: '7', icon: <BookOutlined />, label: '账本' },
  { key: '6', icon: <SettingOutlined />, label: '设置' },
]

function AppContent() {
  const dispatch = useDispatch<AppDispatch>()
  const { currentUser, isLoggedIn } = useSelector((state: RootState) => state.user)
  const { currentLedgerId, items: ledgers } = useSelector((state: RootState) => state.ledgers)

  const [collapsed, setCollapsed] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('app_theme')
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const [activeKey, setActiveKey] = useState('1')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileNavKey, setMobileNavKey] = useState('1')
  const [autoOpenRecordsAdd, setAutoOpenRecordsAdd] = useState(false)
  const [recordFilterAccountId, setRecordFilterAccountId] = useState<number | null>(null)
  const [recordFilterCategoryId, setRecordFilterCategoryId] = useState<number | null>(null)

  const onToggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('app_theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const loadLedgerData = useCallback((ledgerId: number) => {
    dispatch(fetchRecords(ledgerId as any))
    dispatch(fetchAccounts(ledgerId as any))
    dispatch(fetchCategories(ledgerId as any))
    dispatch(fetchBudgets(ledgerId as any))
  }, [dispatch])

  useEffect(() => {
    dispatch(checkAuth() as any)
  }, [dispatch])

  useEffect(() => {
    if (isLoggedIn) {
      dispatch(fetchLedgers() as any)
    }
  }, [isLoggedIn, dispatch])

  useEffect(() => {
    if (isLoggedIn && ledgers.length > 0) {
      if (!currentLedgerId) {
        const defaultLedger = ledgers.find(l => l.isDefault === 1) || ledgers[0]
        dispatch(setCurrentLedger(defaultLedger.id!))
        loadLedgerData(defaultLedger.id!)
      } else {
        loadLedgerData(currentLedgerId)
      }
    }
  }, [isLoggedIn, ledgers, currentLedgerId, dispatch, loadLedgerData])

  const handleLedgerChange = (id: number) => {
    dispatch(setCurrentLedger(id))
    loadLedgerData(id)
  }

  const handleSwitchToRecords = (key: string) => {
    setActiveKey(key)
    setMobileNavKey(key)
  }

  const handleQuickRecord = () => {
    setActiveKey('2')
    setMobileNavKey('2')
    setAutoOpenRecordsAdd(true)
  }

  const handleViewAccountRecords = (accountId: number) => {
    setRecordFilterAccountId(accountId)
    setRecordFilterCategoryId(null)
    setActiveKey('2')
    setMobileNavKey('2')
  }

  const handleViewCategoryRecords = (categoryId: number) => {
    setRecordFilterCategoryId(categoryId)
    setRecordFilterAccountId(null)
    setActiveKey('2')
    setMobileNavKey('2')
  }

  const { message: msgApi } = AntApp.useApp()

  const handleLogout = () => {
    dispatch(logoutUser() as any)
    msgApi.success('已退出登录')
  }

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: currentUser?.nickname || currentUser?.username },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ]

  if (!isLoggedIn) {
    return (
      <ConfigProvider
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { colorPrimary: '#667eea' }
        }}
      >
        <Login />
      </ConfigProvider>
    )
  }

  const renderContent = () => {
    switch (isMobile ? mobileNavKey : activeKey) {
      case '1': return <Dashboard onNavigate={handleSwitchToRecords} onQuickRecord={handleQuickRecord} isDark={isDark} />
      case '2': return <Records isDark={isDark} autoOpenAdd={autoOpenRecordsAdd} onAutoOpenHandled={() => setAutoOpenRecordsAdd(false)} initialFilterAccountId={recordFilterAccountId} initialFilterCategoryId={recordFilterCategoryId} onFilterConsumed={() => { setRecordFilterAccountId(null); setRecordFilterCategoryId(null) }} />
      case '3': return <Accounts isDark={isDark} onViewAccountRecords={handleViewAccountRecords} />
      case '4': return <Categories isDark={isDark} onViewCategoryRecords={handleViewCategoryRecords} />
      case '5': return <Budgets />
      case '6': return <Settings isDark={isDark} onToggleTheme={onToggleTheme} />
      case '7': return <LedgerManage />
      case '8': return <Logs isDark={isDark} />
      default: return <Dashboard onNavigate={handleSwitchToRecords} onQuickRecord={handleQuickRecord} isDark={isDark} />
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#667eea' }
      }}
    >
      <Layout style={{ minHeight: '100vh' }} data-theme={isDark ? 'dark' : 'light'}>
        {!isMobile && (
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            style={{
              background: isDark ? '#001529' : '#ffffff',
              borderRight: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0'
            }}
            breakpoint="lg"
          >
            <div style={{
              height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0',
              marginBottom: 8
            }}>
              <span style={{ fontSize: collapsed ? 20 : 22, fontWeight: 700, color: '#667eea', display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={logoImg} alt="灵析记账" style={{ width: collapsed ? 28 : 32, height: collapsed ? 28 : 32, borderRadius: 6 }} />
                {!collapsed && '灵析记账'}
              </span>
            </div>
            <Menu
              mode="inline"
              selectedKeys={[activeKey]}
              onClick={({ key }) => setActiveKey(key)}
              items={menuItems}
              style={{ background: 'transparent', borderRight: 'none' }}
            />
          </Sider>
        )}

        <Layout>
          <Header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px',
            background: isDark ? '#001529' : '#ffffff',
            borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0',
            height: 56
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isMobile && (
                <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
              )}
              {!isMobile && (
                <span style={{ fontSize: 16, fontWeight: 600 }}>
                  {menuItems.find(m => m.key === activeKey)?.label}
                </span>
              )}
              <Select
                size="small"
                value={currentLedgerId}
                onChange={handleLedgerChange}
                style={{ minWidth: 160 }}
                options={ledgers.map(l => ({
                  value: l.id,
                  label: <span>{l.icon} {l.name}</span>
                }))}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={onToggleTheme}
              />
              <Dropdown menu={{ items: userMenuItems }}>
                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {currentUser?.avatar && currentUser.avatar.startsWith('data:') ? (
                    <Avatar size="small" src={currentUser.avatar} style={{ border: '2px solid #667eea' }} />
                  ) : (
                    <Avatar size="small" style={{ background: '#667eea', fontSize: 16 }}>
                      {currentUser?.avatar || '👤'}
                    </Avatar>
                  )}
                  {!isMobile && <span>{currentUser?.nickname || currentUser?.username}</span>}
                </div>
              </Dropdown>
            </div>
          </Header>

          <Content style={{
            padding: isMobile ? 12 : 24,
            overflow: 'auto',
            height: `calc(100vh - 56px${isMobile ? ' - 52px' : ''})`,
            paddingBottom: isMobile ? 56 : 0
          }}>
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
              {renderContent()}
            </Suspense>
          </Content>
        </Layout>
      </Layout>

      {isMobile && (
        <>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
            height: 52, background: isDark ? '#001529' : '#ffffff',
            borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-around'
          }}>
            {mobileMenuItems.map(item => (
              <div
                key={item.key}
                onClick={() => { setMobileNavKey(item.key); setActiveKey(item.key); setAutoOpenRecordsAdd(false) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  color: mobileNavKey === item.key ? '#667eea' : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'),
                  cursor: 'pointer', padding: '4px 12px', fontSize: 11
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            placement="left"
            width={240}
          >
            <div style={{ fontWeight: 700, fontSize: 18, color: '#667eea', padding: '12px 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={logoImg} alt="灵析记账" style={{ width: 32, height: 32, borderRadius: 6 }} />
              灵析记账
            </div>
            <Menu
              mode="inline"
              selectedKeys={[mobileNavKey]}
              onClick={({ key }) => {
                setMobileNavKey(key)
                setActiveKey(key)
                setDrawerOpen(false)
              }}
              items={menuItems}
            />
          </Drawer>
        </>
      )}
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <AntApp>
      <AppContent />
      <SpeedInsights />
    </AntApp>
  )
}
