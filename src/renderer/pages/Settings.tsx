import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Card, Typography, Switch, Form, Input, Button, Space, Modal, App, Tag, Tabs,
  Radio, Alert, Divider, Row, Col
} from 'antd'
import {
  MoonOutlined, SunOutlined, UserOutlined, LockOutlined, CameraOutlined, PlusOutlined,
  DownloadOutlined, UploadOutlined, SyncOutlined, CloudOutlined, DeleteOutlined,
  CheckCircleOutlined, WarningOutlined, InfoCircleOutlined
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
  '👤', '👨', '👩', '🧑', '👦', '👧', '🧒', '👶',
  '😊', '😎', '🤓', '🧐', '🤩', '🥳', '😇', '🦸',
  '🐱', '🐶', '🐼', '🐨', '🐰', '🦊', '🐸', '🐙',
  '🌟', '🔥', '💎', '🎯', '🚀', '🎨', '🎵', '⚡',
  '🍎', '🍕', '🍔', '🎂', '☕', '🍦', '🌈', '❄️'
]

function isDataUrl(s: string): boolean {
  return s.startsWith('data:')
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function Settings({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const { currentUser } = useSelector((state: RootState) => state.user)
  const dispatch = useDispatch<AppDispatch>()
  const { message: msgApi, modal } = App.useApp()

  const [nicknameEditVisible, setNicknameEditVisible] = useState(false)
  const [passwordEditVisible, setPasswordEditVisible] = useState(false)
  const [avatarVisible, setAvatarVisible] = useState(false)
  const [nicknameForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge')
  const [importPreviewVisible, setImportPreviewVisible] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [localDataSize, setLocalDataSize] = useState<number>(0)

  const loadSyncStatus = async () => {
    const api = getApi()
    if (api.getSyncStatus) {
      const status = await api.getSyncStatus()
      setLastSyncAt(status.lastSyncAt)
      setLocalDataSize(status.localDataSize)
    }
  }

  useEffect(() => { loadSyncStatus() }, [])

  const handleNicknameSave = async () => {
    try {
      const values = await nicknameForm.validateFields()
      if (currentUser) {
        await dispatch(updateProfile({ id: currentUser.id!, data: { nickname: values.nickname } })).unwrap()
        msgApi.success('昵称修改成功')
        setNicknameEditVisible(false)
        nicknameForm.resetFields()
      }
    } catch {}
  }

  const handlePasswordSave = async () => {
    try {
      const values = await passwordForm.validateFields()
      if (currentUser) {
        await dispatch(updateProfile({ id: currentUser.id!, data: { password: values.newPassword } })).unwrap()
        msgApi.success('密码修改成功')
        setPasswordEditVisible(false)
        passwordForm.resetFields()
      }
    } catch {}
  }

  const handleAvatarChange = async (avatar: string) => {
    if (currentUser) {
      await dispatch(updateProfile({ id: currentUser.id!, data: { avatar } })).unwrap()
      msgApi.success('头像更换成功')
      setAvatarVisible(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      msgApi.error('请选择图片文件')
      return
    }
    if (file.size > 512 * 1024) {
      msgApi.error('图片大小不能超过 512KB')
      return
    }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      if (dataUrl && currentUser) {
        await dispatch(updateProfile({ id: currentUser.id!, data: { avatar: dataUrl } })).unwrap()
        msgApi.success('头像上传成功')
        setAvatarVisible(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleExport = async () => {
    try {
      const api = getApi()
      const jsonStr = await api.exportData()
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `记账数据备份_${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      msgApi.success('数据导出成功！')
    } catch {
      msgApi.error('导出失败，请重试')
    }
  }

  const handleExportCSV = async () => {
    try {
      const api = getApi()
      if (api.exportCSV) {
        const csvStr = await api.exportCSV()
        const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const date = new Date().toISOString().slice(0, 10)
        a.download = `记账数据_${date}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        msgApi.success('CSV 表格导出成功！')
      }
    } catch {
      msgApi.error('导出失败，请重试')
    }
  }

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      msgApi.error('请选择 .json 格式的备份文件')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const jsonStr = ev.target?.result as string
        const parsed = JSON.parse(jsonStr)
        if (!parsed.data || !parsed.version) {
          msgApi.error('无效的备份文件格式')
          return
        }
        setImportPreviewData({
          raw: jsonStr,
          version: parsed.version,
          exportedAt: parsed.exportedAt,
          app: parsed.app,
          stats: {
            ledgers: (parsed.data.ledgers || []).filter((l: any) => !l.isDeleted).length,
            records: (parsed.data.records || []).filter((r: any) => !r.isDeleted).length,
            accounts: (parsed.data.accounts || []).filter((a: any) => !a.isDeleted).length,
            categories: (parsed.data.categories || []).filter((c: any) => !c.isDeleted).length,
            budgets: (parsed.data.budgets || []).length
          }
        })
        setImportPreviewVisible(true)
      } catch {
        msgApi.error('文件解析失败，请检查文件格式')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImportConfirm = async () => {
    if (!importPreviewData) return
    setImportLoading(true)
    try {
      const api = getApi()
      const result = await api.importData(importPreviewData.raw, importMode)
      if (result.success) {
        msgApi.success(result.message)
        setImportPreviewVisible(false)
        setImportPreviewData(null)
        await refreshAllData()
      } else {
        msgApi.error(result.message)
      }
    } catch {
      msgApi.error('导入失败，请重试')
    } finally {
      setImportLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      const api = getApi()
      if (api.syncData) {
        const result = await api.syncData()
        if (result.success) {
          msgApi.success('数据同步成功')
          setLastSyncAt(result.lastSyncAt)
        } else {
          msgApi.error(result.message)
        }
      }
    } catch {
      msgApi.error('同步失败，请重试')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleClearData = () => {
    modal.confirm({
      title: '确认清除所有数据？',
      content: '此操作将清除当前用户的所有记账数据（账本、记录、账户、类别、预算），且不可恢复。建议先导出备份。',
      okText: '确认清除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const api = getApi()
        if (api.importData) {
          await api.importData(JSON.stringify({
            version: '1.0.0',
            data: { ledgers: [], records: [], accounts: [], categories: [], budgets: [], nextIds: { record: 1, account: 1, category: 1, budget: 1, ledger: 1 } }
          }), 'replace')
          msgApi.success('数据已清除')
          await refreshAllData()
        }
      }
    })
  }

  const refreshAllData = async () => {
    await dispatch(fetchLedgers() as any)
    await dispatch(fetchRecords(undefined as any))
    await dispatch(fetchAccounts(undefined as any))
    await dispatch(fetchCategories(undefined as any))
    await dispatch(fetchBudgets(undefined as any))
    loadSyncStatus()
  }

  const renderAvatar = () => {
    const avatar = currentUser?.avatar || '👤'
    if (isDataUrl(avatar)) {
      return <img src={avatar} alt="头像" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
    }
    return (
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36
      }}>
        {avatar}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', overflowY: 'auto', padding: '0 2px' }}>
      <Title level={4} style={{ marginBottom: 24 }}>个人设置</Title>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div
            onClick={() => setAvatarVisible(true)}
            style={{ cursor: 'pointer', position: 'relative', transition: 'transform 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            title="点击更换头像"
          >
            {renderAvatar()}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 24, height: 24, borderRadius: '50%',
              background: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
            }}>
              <CameraOutlined style={{ fontSize: 12, color: '#667eea' }} />
            </div>
          </div>
          <div>
            <Title level={3} style={{ margin: 0 }}>{currentUser?.nickname || currentUser?.username}</Title>
            <Tag color="blue" style={{ marginTop: 4 }}>@{currentUser?.username}</Tag>
          </div>
        </div>
        <Space>
          <Button icon={<UserOutlined />} onClick={() => { nicknameForm.setFieldsValue({ nickname: currentUser?.nickname }); setNicknameEditVisible(true) }}>
            修改昵称
          </Button>
          <Button icon={<LockOutlined />} onClick={() => setPasswordEditVisible(true)}>
            修改密码
          </Button>
        </Space>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>主题设置</Title>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            {isDark ? <MoonOutlined style={{ fontSize: 18, color: '#f0c040' }} /> : <SunOutlined style={{ fontSize: 18, color: '#f0c040' }} />}
            <Text>{isDark ? '深色模式' : '浅色模式'}</Text>
          </Space>
          <Switch checked={isDark} onChange={onToggleTheme} checkedChildren="🌙" unCheckedChildren="☀️" />
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>
          <CloudOutlined style={{ marginRight: 8 }} />
          数据管理
        </Title>

        <div style={{ marginBottom: 20, padding: 16, background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>本地数据大小</Text>
            <Text strong>{formatBytes(localDataSize)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>上次同步时间</Text>
            <Text strong>{lastSyncAt ? new Date(lastSyncAt).toLocaleString('zh-CN') : '从未同步'}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>数据存储位置</Text>
            <Text strong>浏览器本地存储</Text>
          </div>
        </div>

        <Row gutter={[12, 12]}>
          <Col xs={12} sm={6}>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              block
              size="large"
              style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>导出表格</span>
              <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>CSV 格式</span>
            </Button>
          </Col>
          <Col xs={12} sm={6}>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              block
              size="large"
              style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>导出备份</span>
              <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>JSON 格式</span>
            </Button>
          </Col>
          <Col xs={12} sm={6}>
            <Button
              icon={<UploadOutlined />}
              onClick={() => importFileRef.current?.click()}
              block
              size="large"
              style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>导入数据</span>
              <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>从备份恢复</span>
            </Button>
          </Col>
          <Col xs={12} sm={6}>
            <Button
              icon={<SyncOutlined spin={syncLoading} />}
              onClick={handleSync}
              loading={syncLoading}
              block
              size="large"
              style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>同步数据</span>
              <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>保存到本地</span>
            </Button>
          </Col>
        </Row>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text type="secondary" style={{ fontSize: 13 }}>危险操作：清除所有数据</Text>
          </Space>
          <Button danger icon={<DeleteOutlined />} onClick={handleClearData} size="small">
            清除数据
          </Button>
        </div>

        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFileSelect}
        />
      </Card>

      <Card>
        <Title level={5} style={{ marginBottom: 16 }}>关于</Title>
        <p><Text type="secondary">个人记账助手 v1.0.0</Text></p>
        <p><Text type="secondary">使用 React + Redux + Ant Design 构建</Text></p>
        <p><Text type="secondary">数据存储于浏览器本地，支持导出备份和导入恢复</Text></p>
      </Card>

      <Modal
        title="修改昵称"
        open={nicknameEditVisible}
        onOk={handleNicknameSave}
        onCancel={() => setNicknameEditVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={nicknameForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="请输入新昵称" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修改密码"
        open={passwordEditVisible}
        onOk={handlePasswordSave}
        onCancel={() => setPasswordEditVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={passwordForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 4, message: '密码至少4位' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="更换头像"
        open={avatarVisible}
        onCancel={() => setAvatarVisible(false)}
        footer={null}
        width={460}
      >
        <Tabs
          defaultActiveKey="emoji"
          items={[
            {
              key: 'emoji',
              label: 'Emoji 头像',
              children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, padding: '8px 0' }}>
                  {AVATAR_OPTIONS.map(avatar => (
                    <div
                      key={avatar}
                      onClick={() => handleAvatarChange(avatar)}
                      style={{
                        width: 44, height: 44, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 28, cursor: 'pointer',
                        borderRadius: 8, border: currentUser?.avatar === avatar ? '2px solid #667eea' : '2px solid transparent',
                        background: currentUser?.avatar === avatar ? 'rgba(102,126,234,0.1)' : 'transparent',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => {
                        if (currentUser?.avatar !== avatar) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'
                      }}
                      onMouseLeave={e => {
                        if (currentUser?.avatar !== avatar) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {avatar}
                    </div>
                  ))}
                </div>
              )
            },
            {
              key: 'upload',
              label: '上传图片',
              children: (
                <div style={{ padding: '16px 0' }}>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed #d9d9d9', borderRadius: 12, padding: '32px 0', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#667eea'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#d9d9d9'}
                  >
                    <PlusOutlined style={{ fontSize: 32, color: '#999', marginBottom: 8 }} />
                    <div style={{ color: '#666', fontSize: 14 }}>点击上传头像图片</div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>支持 JPG、PNG、GIF、WebP，不超过 512KB</div>
                  </div>
                  {currentUser?.avatar && isDataUrl(currentUser.avatar) && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, color: '#666' }}>当前上传头像：</span>
                      <img src={currentUser.avatar} alt="当前头像" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #667eea' }} />
                    </div>
                  )}
                </div>
              )
            }
          ]}
        />
      </Modal>

      <Modal
        title="导入数据预览"
        open={importPreviewVisible}
        onCancel={() => { setImportPreviewVisible(false); setImportPreviewData(null) }}
        onOk={handleImportConfirm}
        confirmLoading={importLoading}
        okText="确认导入"
        cancelText="取消"
        width={520}
      >
        {importPreviewData && (
          <div>
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="备份文件信息"
              description={
                <div style={{ fontSize: 13 }}>
                  <div>来源：{importPreviewData.app || '未知'}</div>
                  <div>版本：{importPreviewData.version}</div>
                  <div>导出时间：{importPreviewData.exportedAt ? new Date(importPreviewData.exportedAt).toLocaleString('zh-CN') : '未知'}</div>
                </div>
              }
              style={{ marginBottom: 16 }}
            />

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 14 }}>数据统计</Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>
                {[
                  { label: '账本', value: importPreviewData.stats.ledgers, icon: '📒' },
                  { label: '记录', value: importPreviewData.stats.records, icon: '📝' },
                  { label: '账户', value: importPreviewData.stats.accounts, icon: '💳' },
                  { label: '类别', value: importPreviewData.stats.categories, icon: '🏷️' },
                  { label: '预算', value: importPreviewData.stats.budgets, icon: '🎯' }
                ].map(item => (
                  <div key={item.label} style={{
                    textAlign: 'center', padding: '8px 4px',
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 8
                  }}>
                    <div style={{ fontSize: 20 }}>{item.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#667eea' }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <div>
              <Text strong style={{ fontSize: 14 }}>导入模式</Text>
              <Radio.Group
                value={importMode}
                onChange={e => setImportMode(e.target.value)}
                style={{ display: 'block', marginTop: 8 }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Radio value="merge">
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <span style={{ fontWeight: 500 }}>合并导入</span>
                    </Space>
                    <div style={{ marginLeft: 22, fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
                      保留现有数据，将备份数据追加到当前数据中（推荐）
                    </div>
                  </Radio>
                  <Radio value="replace">
                    <Space>
                      <WarningOutlined style={{ color: '#ff4d4f' }} />
                      <span style={{ fontWeight: 500 }}>替换导入</span>
                    </Space>
                    <div style={{ marginLeft: 22, fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
                      清除当前所有数据，用备份数据完全替换（⚠️ 现有数据将丢失）
                    </div>
                  </Radio>
                </Space>
              </Radio.Group>
            </div>

            {importMode === 'replace' && (
              <Alert
                type="warning"
                showIcon
                message="替换导入将清除当前所有数据"
                description="此操作不可撤销，建议先导出当前数据作为备份"
                style={{ marginTop: 12 }}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
