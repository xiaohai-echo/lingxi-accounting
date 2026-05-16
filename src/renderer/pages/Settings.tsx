import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Card, Typography, Switch, Form, Input, Button, Space, Modal, App, Tag, Tabs,
  Radio, Alert, Divider, Row, Col, Statistic, Table, Checkbox
} from 'antd'
import {
  MoonOutlined, SunOutlined, UserOutlined, LockOutlined, CameraOutlined, PlusOutlined,
  DownloadOutlined, UploadOutlined, SyncOutlined, DeleteOutlined,
  CheckCircleOutlined, WarningOutlined, InfoCircleOutlined, SaveOutlined,
  ReloadOutlined, FilterOutlined, ExclamationCircleOutlined, DatabaseOutlined,
  ToolOutlined, HistoryOutlined, FileTextOutlined, BarChartOutlined
} from '@ant-design/icons'
import type { RootState, AppDispatch } from '../store'
import { updateProfile } from '../store/slices/userSlice'
import { fetchLedgers } from '../store/slices/ledgersSlice'
import { fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { fetchBudgets } from '../store/slices/budgetsSlice'
import { getApi } from '../api/mock'

const { Title, Text } = Typography

const AVATAR_OPTIONS = [
  '👤','👨','👩','🧑','👦','👧','🧒','👶','😊','😎','🤓','🧐','🤩','🥳','😇','🦸',
  '🐱','🐶','🐼','🐨','🐰','🦊','🐸','🐙','🌟','🔥','💎','🎯','🚀','🎨','🎵','⚡',
  '🍎','🍕','🍔','🎂','☕','🍦','🌈','❄️'
]

function isDataUrl(s: string) { return s.startsWith('data:') }
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024; const sizes = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function Settings({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const { currentUser } = useSelector((state: RootState) => state.user)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const dispatch = useDispatch<AppDispatch>()
  const { message: msgApi, modal } = App.useApp()

  const uid = () => localStorage.getItem('userId') || '0'
  const [nicknameEditVisible, setNicknameEditVisible] = useState(false)
  const [passwordEditVisible, setPasswordEditVisible] = useState(false)
  const [avatarVisible, setAvatarVisible] = useState(false)
  const [nicknameForm] = Form.useForm(); const [passwordForm] = Form.useForm()
  const fileInputRef = useRef<HTMLInputElement>(null); const importFileRef = useRef<HTMLInputElement>(null)
  const exportingRef = useRef(false)

  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge')
  const [importPreviewVisible, setImportPreviewVisible] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [localDataSize, setLocalDataSize] = useState<number>(0)
  const [dataStats, setDataStats] = useState<Array<{ id: number; name: string; records: number; accounts: number; categories: number }>>([])
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => localStorage.getItem('auto_backup_enabled_' + uid()) === 'true')
  const [backupHistory, setBackupHistory] = useState<Array<{ time: string; size: number; label: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('backup_history_' + uid()) || '[]') } catch { return [] }
  })
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; issues: string[] } | null>(null)
  const [selectiveExportVisible, setSelectiveExportVisible] = useState(false)
  const [selectedExportLedgerIds, setSelectedExportLedgerIds] = useState<number[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('zhipu_api_key') || '')
  const [showKey, setShowKey] = useState(false)
  const [storeMappings, setStoreMappings] = useState<Array<{ storeName: string; categoryId: number }>>(() => {
    const userId = localStorage.getItem('userId') || '0'
    try { return JSON.parse(localStorage.getItem(`store_mappings_${userId}`) || '[]') } catch { return [] }
  })
  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreCategory, setNewStoreCategory] = useState<number | null>(null)

  useEffect(() => { loadSyncStatus(); loadDataStats() }, [])
  useEffect(() => {
    if (!autoBackupEnabled) return
    const last = localStorage.getItem('last_auto_backup_' + uid())
    const today = new Date().toISOString().slice(0, 10)
    if (last === today) return
    const t = setTimeout(async () => {
      try {
        const api = getApi(); const data = await api.exportData()
        localStorage.setItem(`auto_backup_${uid()}_${today}`, data)
        localStorage.setItem('last_auto_backup_' + uid(), today)
        const h = JSON.parse(localStorage.getItem('backup_history_' + uid()) || '[]')
        h.unshift({ time: new Date().toISOString(), size: new Blob([data]).size, label: `自动备份 ${today}` })
        if (h.length > 10) h.length = 10
        localStorage.setItem('backup_history_' + uid(), JSON.stringify(h))
        setBackupHistory(h); msgApi.success('自动备份已完成')
      } catch {}
    }, 2000)
    return () => clearTimeout(t)
  }, [autoBackupEnabled])

  const loadSyncStatus = async () => {
    const api = getApi()
    if (api.getSyncStatus) {
      const s = await api.getSyncStatus()
      setLastSyncAt(s.lastSyncAt); setLocalDataSize(s.localDataSize)
    }
  }
  const loadDataStats = async () => {
    try {
      const api = getApi()
      if (api.getLedgerStats) {
        const stats = await api.getLedgerStats(); const ledgers = await api.getLedgers()
        const arr = Array.isArray(stats) ? stats : Array.from((stats as Map<number, any>).entries()).map(([id, s]: [number, any]) => ({ id, ...s }))
        setDataStats(arr.map((s: any) => {
          const l = ledgers.find((x: any) => x.id === s.id)
          return { ...s, name: l?.name || '未知' }
        }))
      }
    } catch {}
  }
  const refreshAllData = async () => {
    await dispatch(fetchLedgers() as any)
    await dispatch(fetchRecords(undefined as any))
    await dispatch(fetchAccounts(undefined as any))
    await dispatch(fetchCategories(undefined as any))
    await dispatch(fetchBudgets(undefined as any))
    loadSyncStatus()
  }

  // Profile
  const handleNicknameSave = async () => { try { const v = await nicknameForm.validateFields(); if (currentUser) { await dispatch(updateProfile({ id: currentUser.id!, data: { nickname: v.nickname } })).unwrap(); msgApi.success('昵称修改成功'); setNicknameEditVisible(false); nicknameForm.resetFields() } } catch {} }
  const handlePasswordSave = async () => { try { const v = await passwordForm.validateFields(); if (currentUser) { await dispatch(updateProfile({ id: currentUser.id!, data: { password: v.newPassword } })).unwrap(); msgApi.success('密码修改成功'); setPasswordEditVisible(false); passwordForm.resetFields() } } catch {} }
  const handleAvatarChange = async (avatar: string) => { if (currentUser) { await dispatch(updateProfile({ id: currentUser.id!, data: { avatar } })).unwrap(); msgApi.success('头像更换成功'); setAvatarVisible(false) } }
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!file.type.startsWith('image/')) { msgApi.error('请选择图片文件'); return }
    if (file.size > 512 * 1024) { msgApi.error('图片大小不能超过 512KB'); return }
    const r = new FileReader()
    r.onload = async (ev) => { const d = ev.target?.result as string; if (d && currentUser) { await dispatch(updateProfile({ id: currentUser.id!, data: { avatar: d } })).unwrap(); msgApi.success('头像上传成功'); setAvatarVisible(false) } }
    r.readAsDataURL(file); e.target.value = ''
  }

  // Export with guard
  const handleExport = async () => {
    if (exportingRef.current) return; exportingRef.current = true
    try {
      const api = getApi(); const jsonStr = await api.exportData()
      const date = new Date().toISOString().slice(0, 10); const userName = currentUser?.username || 'user'; const fileName = `记账数据_${userName}_${date}.json`
      api.addLog('export', '完整导出', fileName)
      if (window.showSaveFilePicker) {
        try { const h = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON 备份文件', accept: { 'application/json': ['.json'] } }] }); const w = await h.createWritable(); await w.write(jsonStr); await w.close(); msgApi.success('数据导出成功！') } catch (err: any) { if (err.name !== 'AbortError') throw err }
      } else {
        const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = fileName
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
        msgApi.success('数据导出成功！')
      }
    } catch { msgApi.error('导出失败，请重试') }
    finally { setTimeout(() => { exportingRef.current = false }, 1000) }
  }
  const handleExportCSV = async () => {
    if (exportingRef.current) return; exportingRef.current = true
    try {
      const api = getApi()
      if (api.exportCSV) {
        const csvStr = await api.exportCSV()
        const date = new Date().toISOString().slice(0, 10); const userName = currentUser?.username || 'user'; const fileName = `记账数据_${userName}_${date}.csv`
        api.addLog('export', 'CSV导出', fileName)
        if (window.showSaveFilePicker) {
          try { const h = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'CSV 表格文件', accept: { 'text/csv': ['.csv'] } }] }); const w = await h.createWritable(); await w.write(csvStr); await w.close(); msgApi.success('CSV 表格导出成功！') } catch (err: any) { if (err.name !== 'AbortError') throw err }
        } else {
          const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = fileName
          document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
          msgApi.success('CSV 表格导出成功！')
        }
      }
    } catch { msgApi.error('导出失败，请重试') }
    finally { setTimeout(() => { exportingRef.current = false }, 1000) }
  }
  const handleSelectiveExport = async () => {
    if (selectedExportLedgerIds.length === 0) { msgApi.warning('请至少选择一个账本'); return }
    try {
      const api = getApi()
      const [recs, accs, cats, buds, leds] = await Promise.all([api.getRecords(), api.getAccounts(), api.getCategories(), api.getBudgets(), api.getLedgers()])
      const exportData = { version: '1.0.0', exportedAt: new Date().toISOString(), app: '个人记账助手 - 选择性导出', data: { ledgers: leds.filter((l: any) => selectedExportLedgerIds.includes(l.id!)), records: recs.filter((r: any) => selectedExportLedgerIds.includes(r.ledgerId!)), accounts: accs.filter((a: any) => selectedExportLedgerIds.includes(a.ledgerId!)), categories: cats.filter((c: any) => selectedExportLedgerIds.includes(c.ledgerId!)), budgets: buds.filter((b: any) => selectedExportLedgerIds.includes(b.ledgerId!)) } }
      const jsonStr = JSON.stringify(exportData, null, 2)
      api.addLog('export', '选择性导出', `${selectedExportLedgerIds.length}个账本`)
      const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `记账数据_${selectedExportLedgerIds.length}个账本_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      msgApi.success(`已导出 ${selectedExportLedgerIds.length} 个账本的数据`); setSelectiveExportVisible(false)
    } catch { msgApi.error('导出失败') }
  }

  // Import
  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!file.name.endsWith('.json')) { msgApi.error('请选择 .json 格式的备份文件'); e.target.value = ''; return }
    const r = new FileReader()
    r.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (!parsed.data || !parsed.version) { msgApi.error('无效的备份文件格式'); return }
        setImportPreviewData({ raw: ev.target?.result, version: parsed.version, exportedAt: parsed.exportedAt, app: parsed.app, stats: { ledgers: (parsed.data.ledgers||[]).filter((l:any)=>!l.isDeleted).length, records: (parsed.data.records||[]).filter((r:any)=>!r.isDeleted).length, accounts: (parsed.data.accounts||[]).filter((a:any)=>!a.isDeleted).length, categories: (parsed.data.categories||[]).filter((c:any)=>!c.isDeleted).length, budgets: (parsed.data.budgets||[]).length } })
        setImportPreviewVisible(true)
      } catch { msgApi.error('文件解析失败') }
    }
    r.readAsText(file); e.target.value = ''
  }
  const handleImportConfirm = async () => {
    if (!importPreviewData) return; setImportLoading(true)
    try {
      const api = getApi(); const result = await api.importData(importPreviewData.raw, importMode)
      if (result.success) { api.addLog('import', '数据导入', `${importMode==='replace'?'替换':'合并'}模式, 账本${result.stats.ledgers}个, 记录${result.stats.records}条`); msgApi.success(result.message); setImportPreviewVisible(false); setImportPreviewData(null); await refreshAllData() }
      else msgApi.error(result.message)
    } catch { msgApi.error('导入失败，请重试') }
    finally { setImportLoading(false) }
  }

  // Sync
  const handleSync = async () => { setSyncLoading(true); try { const api = getApi(); if (api.syncData) { const r = await api.syncData(); if (r.success) { msgApi.success('数据同步成功'); setLastSyncAt(r.lastSyncAt) } else msgApi.error(r.message) } } catch { msgApi.error('同步失败') } finally { setSyncLoading(false) } }

  // Backup
  const handleManualBackup = async () => {
    try {
      const api = getApi(); const data = await api.exportData()
      const today = new Date().toISOString().slice(0, 10)
      localStorage.setItem(`manual_backup_${uid()}_${today}_${Date.now()}`, data)
      const h = JSON.parse(localStorage.getItem('backup_history_' + uid()) || '[]')
      h.unshift({ time: new Date().toISOString(), size: new Blob([data]).size, label: `手动备份 ${new Date().toLocaleString('zh-CN')}` })
      if (h.length > 10) h.length = 10
      localStorage.setItem('backup_history_' + uid(), JSON.stringify(h)); setBackupHistory(h)
      api.addLog('backup', '手动备份', formatBytes(new Blob([data]).size))
      msgApi.success('手动备份已保存到本地存储')
    } catch { msgApi.error('备份失败') }
  }
  const handleRestoreBackup = (index: number) => {
    const item = backupHistory[index]; if (!item) return
    modal.confirm({ title: '恢复备份', content: `确定要恢复到「${item.label}」吗？当前数据将被替换。`, okText: '确认恢复', okButtonProps: { danger: true }, onOk: async () => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('auto_backup_' + uid()) || k.startsWith('manual_backup_' + uid()))
      keys.sort().reverse(); const key = keys[index]; if (!key) return
      const data = localStorage.getItem(key); if (!data) return
      const api = getApi(); const result = await api.importData(data, 'replace')
      if (result.success) { api.addLog('restore', '恢复备份', item.label); msgApi.success('备份恢复成功'); await refreshAllData() }
      else msgApi.error(result.message)
    }})
  }

  // Verify & Repair
  const handleVerifyData = async () => {
    setDataLoading(true)
    try {
      const api = getApi(); const accounts = await api.getAccounts(); const records = await api.getRecords()
      const issues: string[] = []
      for (const acc of accounts) {
        let expected = 0
        for (const r of records) {
          if (r.isDeleted) continue
          if (r.accountId === acc.id) { if (r.type==='income') expected+=r.amount; else if (r.type==='expense') expected-=r.amount; else if (r.type==='transfer') expected-=r.amount+(r.fee||0) }
          if (r.type==='transfer' && r.targetAccountId===acc.id) expected+=r.amount
          if (r.accountId===acc.id && r.type==='expense' && r.refundAmount && r.refundStatus!=='none') expected+=r.refundAmount-(r.shippingFee||0)
        }
        if (Math.abs(expected-acc.balance)>0.01) issues.push(`${acc.name}: 记录余额 ¥${expected.toFixed(2)} ≠ 账户余额 ¥${acc.balance.toFixed(2)}`)
      }
      setVerifyResult({ ok: issues.length===0, issues })
      if (issues.length===0) msgApi.success('数据校验通过，无异常')
    } catch { msgApi.error('校验失败') }
    finally { setDataLoading(false) }
  }
  const handleRepairBalances = () => { modal.confirm({ title: '修复账户余额', content: '将根据所有记录重新计算每个账户的余额。', okText: '确认修复', onOk: async () => {
    try {
      const api = getApi(); const accounts = await api.getAccounts(); const records = await api.getRecords()
      for (const acc of accounts) { let e=0; for (const r of records) { if (r.isDeleted) continue; if (r.accountId===acc.id) { if (r.type==='income') e+=r.amount; else if (r.type==='expense') e-=r.amount; else if (r.type==='transfer') e-=r.amount+(r.fee||0) } if (r.type==='transfer'&&r.targetAccountId===acc.id) e+=r.amount; if (r.accountId===acc.id&&r.type==='expense'&&r.refundAmount&&r.refundStatus!=='none') e+=r.refundAmount-(r.shippingFee||0) } await api.updateAccount(acc.id!, { balance: e }) }
      api.addLog('repair', '修复余额', `${accounts.length}个账户`); msgApi.success('账户余额已修复'); await refreshAllData(); setVerifyResult(null)
    } catch { msgApi.error('修复失败') }
  }}) }

  // Clear data (keep presets)
  const handleClearData = () => { modal.confirm({ title: '确认清除所有数据？', content: '将清除所有记账记录和账户，但保留预设分类和默认账本。建议先导出备份。', okText: '确认清除', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
    const api = getApi(); const ledgers = await api.getLedgers(); const allCats = await api.getCategories()
    const defaultLedger = ledgers.find((l: any) => l.isDefault) || ledgers[0] || { id: 1, name: '日常账本', icon: '📒', color: '#667eea', isDefault: 1, isDeleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    if (defaultLedger.id) defaultLedger.id = 1
    const preset = allCats.filter((c: any) => c.isDefault===1).map((c: any, i: number) => ({ ...c, id: i+1, ledgerId: 1, isDeleted: 0 }))
    await api.importData(JSON.stringify({ version: '1.0.0', data: { ledgers: [{ ...defaultLedger, isDeleted: 0 }], records: [], accounts: [], categories: preset, budgets: [], nextIds: { record: 1, account: 1, category: preset.length+1, budget: 1, ledger: 2, log: 1 } } }), 'replace')
    api.addLog('clear', '清除数据', '保留预设分类和默认账本'); msgApi.success('数据已清除（保留预设分类和默认账本）'); await refreshAllData()
  }}) }

  // Restore demo (demo user only)
  const handleRestoreDemo = () => { modal.confirm({ title: '恢复演示数据', content: '将清除演示账号的所有数据并重新生成演示数据。', okText: '确认恢复', okButtonProps: { danger: true }, onOk: async () => {
    try {
      // Clear all demo-related data
      localStorage.removeItem('expense_data_1')
      localStorage.removeItem('backup_history_1')
      localStorage.removeItem('last_auto_backup_1')
      const keysToRemove = [] as string[]
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('auto_backup_1_') || k.startsWith('manual_backup_1_'))) keysToRemove.push(k)
      }
      for (const k of keysToRemove) localStorage.removeItem(k)
      if (currentUser?.id===1) await getApi().login('demo','demo123')
      msgApi.success('演示数据已恢复，即将刷新')
      setTimeout(() => window.location.reload(), 800)
    } catch { msgApi.error('恢复失败') }
  }})}

  // AI settings handlers
  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('zhipu_api_key', apiKey.trim())
      msgApi.success('API Key 已保存')
    } else {
      localStorage.removeItem('zhipu_api_key')
      setApiKey('')
      msgApi.success('API Key 已清除')
    }
  }

  const handleAddMapping = () => {
    if (!newStoreName.trim() || newStoreCategory === null) {
      msgApi.warning('请输入店铺名称并选择类别')
      return
    }
    const userId = localStorage.getItem('userId') || '0'
    const exists = storeMappings.some(m => m.storeName === newStoreName.trim())
    if (exists) {
      msgApi.warning('该店铺已存在映射')
      return
    }
    const updated = [...storeMappings, { storeName: newStoreName.trim(), categoryId: newStoreCategory }]
    setStoreMappings(updated)
    localStorage.setItem(`store_mappings_${userId}`, JSON.stringify(updated))
    setNewStoreName('')
    setNewStoreCategory(null)
    msgApi.success('映射已添加')
  }

  const handleRemoveMapping = (storeName: string) => {
    const userId = localStorage.getItem('userId') || '0'
    const updated = storeMappings.filter(m => m.storeName !== storeName)
    setStoreMappings(updated)
    localStorage.setItem(`store_mappings_${userId}`, JSON.stringify(updated))
  }

  const renderAvatar = () => {
    const avatar = currentUser?.avatar || '👤'
    if (isDataUrl(avatar)) return <img src={avatar} alt="头像" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
    return <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{avatar}</div>
  }

  const SECONDARY = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', overflowY: 'auto', padding: '0 2px' }}>
      <Title level={4} style={{ marginBottom: 24 }}>个人设置</Title>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div onClick={() => setAvatarVisible(true)} style={{ cursor: 'pointer', position: 'relative' }} title="点击更换头像">
            {renderAvatar()}
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}><CameraOutlined style={{ fontSize: 12, color: '#667eea' }} /></div>
          </div>
          <div><Title level={3} style={{ margin: 0 }}>{currentUser?.nickname || currentUser?.username}</Title><Tag color="blue" style={{ marginTop: 4 }}>@{currentUser?.username}</Tag></div>
        </div>
        <Space><Button icon={<UserOutlined />} onClick={() => { nicknameForm.setFieldsValue({ nickname: currentUser?.nickname }); setNicknameEditVisible(true) }}>修改昵称</Button><Button icon={<LockOutlined />} onClick={() => setPasswordEditVisible(true)}>修改密码</Button></Space>
      </Card>

      <Card style={{ marginBottom: 24 }}><Title level={5} style={{ marginBottom: 16 }}>主题设置</Title>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Space>{isDark ? <MoonOutlined style={{ fontSize: 18, color: '#f0c040' }} /> : <SunOutlined style={{ fontSize: 18, color: '#f0c040' }} />}<Text>{isDark ? '深色模式' : '浅色模式'}</Text></Space><Switch checked={isDark} onChange={onToggleTheme} checkedChildren="🌙" unCheckedChildren="☀️" /></div>
      </Card>

      {/* Data Stats */}
      <Card style={{ marginBottom: 24 }}><Title level={5} style={{ marginBottom: 16 }}><DatabaseOutlined style={{ marginRight: 8 }} />数据统计</Title>
        <div style={{ marginBottom: 20, padding: 16, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
          <Row gutter={[8,12]}><Col span={8}><Statistic title="本地数据" value={formatBytes(localDataSize)} valueStyle={{ fontSize: 18 }} /></Col><Col span={8}><Statistic title="上次同步" value={lastSyncAt ? new Date(lastSyncAt).toLocaleDateString('zh-CN') : '-'} valueStyle={{ fontSize: 18 }} /></Col><Col span={8}><Statistic title="存储位置" value="浏览器本地" valueStyle={{ fontSize: 18 }} /></Col></Row>
        </div>
        {dataStats.length > 0 && <Table dataSource={dataStats} rowKey="id" pagination={false} size="small" style={{ marginBottom: 20 }} columns={[{ title: '账本', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },{ title: '记录', dataIndex: 'records', key: 'records', align: 'center' as const },{ title: '账户', dataIndex: 'accounts', key: 'accounts', align: 'center' as const },{ title: '分类', dataIndex: 'categories', key: 'categories', align: 'center' as const }]} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Space><HistoryOutlined /><Text strong>自动备份</Text><Tag color={autoBackupEnabled ? 'green' : 'default'}>{autoBackupEnabled ? '已开启' : '已关闭'}</Tag></Space><Switch checked={autoBackupEnabled} onChange={v => { setAutoBackupEnabled(v); localStorage.setItem('auto_backup_enabled_' + uid(), String(v)) }} /></div>
        {autoBackupEnabled && <Alert type="success" message="每天自动备份一份到本地存储（最多保留 10 份）" style={{ marginTop: 12 }} showIcon />}
      </Card>

      {/* Backup & Export */}
      <Card style={{ marginBottom: 24 }}><Title level={5} style={{ marginBottom: 16 }}><SaveOutlined style={{ marginRight: 8 }} />备份与导出</Title>
        <Row gutter={[12,12]}>
          <Col xs={12} sm={6}><Button icon={<DownloadOutlined />} onClick={handleExport} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>完整导出</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>JSON 备份</span></Button></Col>
          <Col xs={12} sm={6}><Button icon={<FileTextOutlined />} onClick={handleExportCSV} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>导出表格</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>CSV 格式</span></Button></Col>
          <Col xs={12} sm={6}><Button icon={<FilterOutlined />} onClick={async () => { await loadDataStats(); setSelectiveExportVisible(true) }} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>选择性导出</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>按账本筛选</span></Button></Col>
          <Col xs={12} sm={6}><Button icon={<SaveOutlined />} onClick={handleManualBackup} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>手动备份</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>存到本地</span></Button></Col>
          <Col xs={12} sm={6}><Button icon={<UploadOutlined />} onClick={() => importFileRef.current?.click()} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>导入数据</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>从备份恢复</span></Button></Col>
          <Col xs={12} sm={6}><Button icon={<SyncOutlined spin={syncLoading} />} onClick={handleSync} loading={syncLoading} block size="large" style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>同步数据</span><span style={{ fontSize: 11, color: '#8c8c8c' }}>保存到本地</span></Button></Col>
        </Row>
        {backupHistory.length > 0 && <div style={{ marginTop: 16 }}><Text type="secondary" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>备份历史</Text>{backupHistory.slice(0,5).map((item: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}><Space><HistoryOutlined style={{ color: '#667eea' }} /><Text style={{ fontSize: 13 }}>{item.label}</Text><Text type="secondary" style={{ fontSize: 11 }}>{formatBytes(item.size)}</Text></Space><Button size="small" type="link" onClick={() => handleRestoreBackup(i)}>恢复</Button></div>)}</div>}
        <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFileSelect} />
      </Card>

      {/* AI Smart Accounting */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>🤖 AI 智能记账</Title>

        {/* API Key Section */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>API Key 配置</Text>
          <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
            {showKey ? (
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="请输入智谱 API Key" />
            ) : (
              <Input.Password value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="请输入智谱 API Key" />
            )}
            <Button onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</Button>
          </Space.Compact>
          <Space style={{ marginTop: 8, marginLeft: 4 }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveApiKey}>
              {apiKey ? '更新' : '保存'}
            </Button>
            <Button onClick={() => window.open('https://open.bigmodel.cn', '_blank')} size="small" type="link">
              获取 API Key ↗
            </Button>
            {apiKey && <Tag color="green">✓ 已配置</Tag>}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持模型：GLM-4-Flash / GLM-4V-Flash / GLM-4-Voice
            </Text>
          </div>
        </div>

        <Divider />

        {/* Store Mappings Section */}
        <div>
          <Title level={5} style={{ marginBottom: 4 }}>店铺 → 类别固定映射</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            设置店铺名称到记账类别的自动映射，AI 识别后将自动归类
          </Text>
          {storeMappings.length > 0 && (
            <Table
              dataSource={storeMappings.map((m, i) => ({ ...m, key: i }))}
              pagination={false}
              size="small"
              style={{ marginBottom: 12 }}
              columns={[
                { title: '店铺名称', dataIndex: 'storeName', key: 'storeName' },
                {
                  title: '类别', dataIndex: 'categoryId', key: 'categoryId',
                  render: (categoryId: number) => {
                    const cat = categories.find(c => c.id === categoryId)
                    return cat ? <span>{cat.icon} {cat.name}</span> : '未知'
                  }
                },
                {
                  title: '操作', key: 'action', align: 'center' as const,
                  render: (_: any, record: { storeName: string }) => (
                    <Button type="link" danger size="small" onClick={() => handleRemoveMapping(record.storeName)}>
                      删除
                    </Button>
                  )
                }
              ]}
            />
          )}
          <Space>
            <Input
              placeholder="店铺名称"
              value={newStoreName}
              onChange={e => setNewStoreName(e.target.value)}
              style={{ width: 160 }}
              onPressEnter={handleAddMapping}
            />
            <Select
              placeholder="选择类别"
              value={newStoreCategory}
              onChange={v => setNewStoreCategory(v)}
              style={{ width: 160 }}
              showSearch
              optionFilterProp="label"
            >
              {categories.map(cat => (
                <Select.Option key={cat.id} value={cat.id!} label={cat.name}>
                  {cat.icon} {cat.name}
                </Select.Option>
              ))}
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddMapping}>
              添加
            </Button>
          </Space>
        </div>
      </Card>

      {/* Data Maintenance */}
      <Card style={{ marginBottom: 24 }}><Title level={5} style={{ marginBottom: 16 }}><ToolOutlined style={{ marginRight: 8 }} />数据维护</Title>
        <div style={{ marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Space><BarChartOutlined /><Text strong>数据校验</Text><Text type="secondary" style={{ fontSize: 12 }}>检查账户余额与记录是否一致</Text></Space><Button icon={<ReloadOutlined />} loading={dataLoading} onClick={handleVerifyData} size="small">校验</Button></div>
          {verifyResult && <Alert type={verifyResult.ok ? 'success' : 'warning'} showIcon style={{ marginTop: 8 }} message={verifyResult.ok ? '数据一致，无异常' : `发现 ${verifyResult.issues.length} 个不一致项`} description={!verifyResult.ok && <div>{verifyResult.issues.map((issue, i) => <div key={i} style={{ fontSize: 12 }}>• {issue}</div>)}<Button type="link" size="small" onClick={handleRepairBalances} style={{ padding: 0, marginTop: 4 }}>点击自动修复余额</Button></div>} />}
        </div>
        <Divider style={{ margin: '12px 0' }} />
        {currentUser?.username === 'demo' && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><Space><WarningOutlined style={{ color: '#faad14' }} /><Text type="secondary" style={{ fontSize: 13 }}>恢复演示数据（清除当前数据，重新加载示例）</Text></Space><Button icon={<ReloadOutlined />} onClick={handleRestoreDemo} size="small">恢复演示</Button></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Space><ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /><Text type="secondary" style={{ fontSize: 13 }}>清除所有数据（保留预设分类和默认账本）</Text></Space><Button danger icon={<DeleteOutlined />} onClick={handleClearData} size="small">清除数据</Button></div>
      </Card>

      <Card><Title level={5} style={{ marginBottom: 16 }}>关于</Title><p><Text type="secondary">个人记账助手 v1.0.0</Text></p><p><Text type="secondary">使用 React + Redux + Ant Design 构建</Text></p><p><Text type="secondary">数据存储于浏览器本地，支持导出备份和导入恢复</Text></p></Card>

      {/* Modals */}
      <Modal title="修改昵称" open={nicknameEditVisible} onOk={handleNicknameSave} onCancel={() => setNicknameEditVisible(false)} okText="保存" cancelText="取消"><Form form={nicknameForm} layout="vertical" style={{ marginTop: 16 }}><Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}><Input placeholder="请输入新昵称" /></Form.Item></Form></Modal>
      <Modal title="修改密码" open={passwordEditVisible} onOk={handlePasswordSave} onCancel={() => setPasswordEditVisible(false)} okText="保存" cancelText="取消"><Form form={passwordForm} layout="vertical" style={{ marginTop: 16 }}><Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 4, message: '密码至少4位' }]}><Input.Password placeholder="请输入新密码" /></Form.Item><Form.Item name="confirmPassword" label="确认密码" dependencies={['newPassword']} rules={[{ required: true, message: '请确认新密码' }, ({ getFieldValue }) => ({ validator(_, value) { if (!value || getFieldValue('newPassword') === value) return Promise.resolve(); return Promise.reject(new Error('两次输入的密码不一致')) } })]}><Input.Password placeholder="请再次输入新密码" /></Form.Item></Form></Modal>
      <Modal title="更换头像" open={avatarVisible} onCancel={() => setAvatarVisible(false)} footer={null} width={460}><Tabs defaultActiveKey="emoji" items={[{ key: 'emoji', label: 'Emoji 头像', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, padding: '8px 0' }}>{AVATAR_OPTIONS.map(avatar => <div key={avatar} onClick={() => handleAvatarChange(avatar)} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, cursor: 'pointer', borderRadius: 8, border: currentUser?.avatar === avatar ? '2px solid #667eea' : '2px solid transparent', background: currentUser?.avatar === avatar ? 'rgba(102,126,234,0.1)' : 'transparent' }}>{avatar}</div>)}</div> },{ key: 'upload', label: '上传图片', children: <div style={{ padding: '16px 0' }}><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }} onChange={handleFileUpload} /><div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #d9d9d9', borderRadius: 12, padding: '32px 0', textAlign: 'center', cursor: 'pointer' }}><PlusOutlined style={{ fontSize: 32, color: '#999', marginBottom: 8 }} /><div style={{ color: '#666', fontSize: 14 }}>点击上传头像图片</div><div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>支持 JPG、PNG、GIF、WebP，不超过 512KB</div></div></div> }]} /></Modal>
      <Modal title="导入数据预览" open={importPreviewVisible} onCancel={() => { setImportPreviewVisible(false); setImportPreviewData(null) }} onOk={handleImportConfirm} confirmLoading={importLoading} okText="确认导入" cancelText="取消" width={520}>
        {importPreviewData && <div><Alert type="info" showIcon icon={<InfoCircleOutlined />} message="备份文件信息" description={<div style={{ fontSize: 13 }}><div>来源：{importPreviewData.app || '未知'}</div><div>版本：{importPreviewData.version}</div><div>导出时间：{importPreviewData.exportedAt ? new Date(importPreviewData.exportedAt).toLocaleString('zh-CN') : '未知'}</div></div>} style={{ marginBottom: 16 }} />
        <div style={{ marginBottom: 16 }}><Text strong style={{ fontSize: 14 }}>数据统计</Text><div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>{[{ label: '账本', value: importPreviewData.stats.ledgers, icon: '📒' },{ label: '记录', value: importPreviewData.stats.records, icon: '📝' },{ label: '账户', value: importPreviewData.stats.accounts, icon: '💳' },{ label: '类别', value: importPreviewData.stats.categories, icon: '🏷️' },{ label: '预算', value: importPreviewData.stats.budgets, icon: '🎯' }].map((item: any) => <div key={item.label} style={{ textAlign: 'center', padding: '8px 4px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 8 }}><div style={{ fontSize: 20 }}>{item.icon}</div><div style={{ fontSize: 18, fontWeight: 700, color: '#667eea' }}>{item.value}</div><div style={{ fontSize: 11, color: SECONDARY }}>{item.label}</div></div>)}</div></div>
        <Divider style={{ margin: '12px 0' }} /><div><Text strong style={{ fontSize: 14 }}>导入模式</Text><Radio.Group value={importMode} onChange={e => setImportMode(e.target.value)} style={{ display: 'block', marginTop: 8 }}><Space direction="vertical" style={{ width: '100%' }}><Radio value="merge"><Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><span style={{ fontWeight: 500 }}>合并导入</span></Space><div style={{ marginLeft: 22, fontSize: 12, color: SECONDARY }}>保留现有数据，将备份数据追加到当前数据中（推荐）</div></Radio><Radio value="replace"><Space><WarningOutlined style={{ color: '#ff4d4f' }} /><span style={{ fontWeight: 500 }}>替换导入</span></Space><div style={{ marginLeft: 22, fontSize: 12, color: SECONDARY }}>清除当前所有数据，用备份数据完全替换（现有数据将丢失）</div></Radio></Space></Radio.Group></div>
        {importMode === 'replace' && <Alert type="warning" showIcon message="替换导入将清除当前所有数据" description="此操作不可撤销，建议先导出当前数据作为备份" style={{ marginTop: 12 }} />}</div>}
      </Modal>
      <Modal title="选择性导出" open={selectiveExportVisible} onOk={handleSelectiveExport} onCancel={() => setSelectiveExportVisible(false)} okText="导出所选" cancelText="取消" width={480}><div style={{ marginTop: 16 }}><Text>选择要导出的账本（可多选）：</Text><div style={{ marginTop: 12 }}><Checkbox.Group value={selectedExportLedgerIds} onChange={v => setSelectedExportLedgerIds(v as number[])} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{dataStats.map((s: any) => <Checkbox key={s.id} value={s.id}><Space><Text strong>{s.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{s.records} 条记录 · {s.accounts} 个账户 · {s.categories} 个分类</Text></Space></Checkbox>)}</Checkbox.Group></div></div></Modal>
    </div>
  )
}
