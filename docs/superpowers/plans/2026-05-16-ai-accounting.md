# AI 智能记账 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成智谱 AI 实现智能记账 — 文本/截图/拍照/语音四种输入方式自动解析并写入记账记录

**Architecture:** 新建 `ai.ts` Service 层封装智谱 API 调用和两步匹配流程，新建 `AIRecordModal` 组件提供多模式输入 UI，改造 Dashboard/Records/Settings 三个页面提供入口和配置。

**Tech Stack:** TypeScript, React, Ant Design, 智谱 API (GLM-4-Flash / GLM-4V-Flash / GLM-4-Voice), Web MediaRecorder API, Web getUserMedia API

**任务依赖:**
```
Task 1 (AI Service)
  ↓
Task 2 (AIRecordModal) ← Task 3 (Settings)
  ↓                        ↓
Task 4 (Dashboard)    Task 5 (Records)
  ↓                        ↓
  └──────── Task 6 (验证) ─┘
```

Task 1 必须先完成（所有模块依赖它），Task 3 可与 2 并行。

---

### Task 1: AI Service 核心逻辑

**Files:**
- Create: `src/renderer/services/ai.ts`

- [ ] **Step 1: 创建文件骨架和类型定义**

```typescript
// src/renderer/services/ai.ts

const ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4'

export interface ExtractedInfo {
  amount: number
  type: 'income' | 'expense'
  description: string
  date: string
  paymentMethod: string
  cardLast4: string | null
}

export interface RecordInput {
  amount: number
  type: 'income' | 'expense'
  categoryId: number
  accountId: number
  date: string
  note: string
}

interface CategoryItem { id: number; name: string; type: string }
interface AccountItem { id: number; name: string; type: string; cardNo?: string }

function getApiKey(): string | null {
  return localStorage.getItem('zhipu_api_key')
}

function getStoreMappings(): Array<{ storeName: string; categoryId: number }> {
  const userId = localStorage.getItem('userId') || '0'
  try {
    return JSON.parse(localStorage.getItem(`store_mappings_${userId}`) || '[]')
  } catch { return [] }
}
```

- [ ] **Step 2: 实现智谱 API 调用方法**

```typescript
async function callZhipu(
  model: string,
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  }>
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const res = await fetch(`${ZHIPU_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.1 })
  })

  if (res.status === 401 || res.status === 403) throw new Error('INVALID_API_KEY')
  if (!res.ok) throw new Error('API_ERROR')

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}
```

- [ ] **Step 3: 实现第一步 — 提取核心记账信息（文本模式）**

```typescript
const EXTRACT_PROMPT = `你是消费记账提取助手。从用户输入中提取记账信息，返回纯 JSON。

字段说明：
- amount: 金额（数字，必须 > 0）
- type: "income" 或 "expense"
- description: 消费/收入描述（简洁概括，如"午餐 食堂"、"买书"）
- date: 日期，格式 YYYY-MM-DD，如未提及则用今天
- paymentMethod: 支付方式（"现金"/"微信"/"支付宝"/银行卡名+后四位如"招商5678"），无法判断用 null
- cardLast4: 银行卡后四位数字（如"5678"），没有则为 null

只返回 JSON，不要解释。`

async function extractFromText(text: string): Promise<ExtractedInfo> {
  const messages = [
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content: text }
  ]
  const raw = await callZhipu('GLM-4-Flash', messages as any)
  return parseExtracted(raw)
}
```

- [ ] **Step 4: 实现第一步 — 提取核心记账信息（图片模式）**

```typescript
async function extractFromImage(base64: string): Promise<ExtractedInfo> {
  const messages = [
    { role: 'system', content: EXTRACT_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '识别这张账单/收据图片，提取其中的记账信息。' },
        { type: 'image_url', image_url: { url: base64 } }
      ]
    }
  ]
  const raw = await callZhipu('GLM-4V-Flash', messages as any)
  return parseExtracted(raw)
}

function parseExtracted(raw: string): ExtractedInfo {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('PARSE_ERROR')
  const parsed = JSON.parse(jsonMatch[0])
  return {
    amount: parseFloat(parsed.amount) || 0,
    type: parsed.type === 'income' ? 'income' : 'expense',
    description: parsed.description || '',
    date: parsed.date || new Date().toISOString().split('T')[0],
    paymentMethod: parsed.paymentMethod || '',
    cardLast4: parsed.cardLast4 || null
  }
}
```

- [ ] **Step 5: 实现语音转文字**

```typescript
export async function transcribeVoice(audioBase64: string): Promise<string> {
  const res = await fetch(`${ZHIPU_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({
      model: 'GLM-4-Voice',
      messages: [{ role: 'user', content: '请将这段语音转写成文字，只输出文字内容。' }],
      audio: audioBase64
    })
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('INVALID_API_KEY')
    throw new Error('VOICE_ERROR')
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}
```

- [ ] **Step 6: 实现第二步 — 自定义店铺映射匹配**

```typescript
function matchStoreMapping(description: string): number | null {
  const mappings = getStoreMappings()
  for (const m of mappings) {
    if (description.includes(m.storeName)) return m.categoryId
  }
  return null
}
```

- [ ] **Step 7: 实现第二步 — AI 分类匹配**

```typescript
const CATEGORY_MATCH_PROMPT = `你是记账分类助手。根据消费描述和类型，从给定分类列表中选择最合适的分类。
只返回分类名，不要解释。`

async function aiMatchCategory(
  description: string,
  type: string,
  categories: CategoryItem[]
): Promise<number | null> {
  const filtered = categories.filter(c => c.type === type)
  if (filtered.length === 0) return null

  const categoryNames = filtered.map(c => c.name).join('、')
  const messages = [
    { role: 'system', content: CATEGORY_MATCH_PROMPT },
    {
      role: 'user',
      content: `消费描述：「${description}」 类型：${type === 'expense' ? '支出' : '收入'} 可选分类：[${categoryNames}]`
    }
  ]
  const name = (await callZhipu('GLM-4-Flash', messages as any)).trim()
  const matched = filtered.find(c => c.name === name)
  return matched?.id || null
}
```

- [ ] **Step 8: 实现第二步 — 账户匹配**

```typescript
function matchAccount(
  paymentMethod: string,
  cardLast4: string | null,
  accounts: AccountItem[],
  type: string
): number | null {
  // 1. 卡号尾号精确匹配
  if (cardLast4) {
    const byCard = accounts.find(a => a.cardNo && a.cardNo.endsWith(cardLast4))
    if (byCard) return byCard.id!
  }
  // 2. 支付方式模糊匹配
  const method = paymentMethod.toLowerCase()
  const byName = accounts.find(a => {
    const name = a.name.toLowerCase()
    return (method.includes('微信') && name.includes('微信')) ||
           (method.includes('支付宝') && name.includes('支付宝')) ||
           (method.includes('现金') && name.includes('现金'))
  })
  if (byName) return byName.id!
  // 3. 默认回退
  if (type === 'income') return accounts[0]?.id || null
  return accounts.find(a => a.type !== 'credit')?.id || accounts[0]?.id || null
}
```

- [ ] **Step 9: 实现主入口方法**

```typescript
export async function analyzeAccounting(input: {
  text?: string
  imageBase64?: string
  accounts: AccountItem[]
  categories: CategoryItem[]
}): Promise<RecordInput> {
  let extracted: ExtractedInfo
  if (input.imageBase64) {
    extracted = await extractFromImage(input.imageBase64)
  } else if (input.text) {
    extracted = await extractFromText(input.text)
  } else {
    throw new Error('NO_INPUT')
  }

  if (!extracted.amount || extracted.amount <= 0) throw new Error('AMOUNT_INVALID')

  let categoryId = matchStoreMapping(extracted.description)
  if (categoryId === null) {
    categoryId = await aiMatchCategory(extracted.description, extracted.type, input.categories)
  }
  if (categoryId === null) {
    const fallback = input.categories.find(c => c.type === extracted.type)
    categoryId = fallback?.id || input.categories[0]?.id || 1
  }

  const accountId = matchAccount(extracted.paymentMethod, extracted.cardLast4, input.accounts, extracted.type)

  return {
    amount: extracted.amount,
    type: extracted.type,
    categoryId,
    accountId: accountId || input.accounts[0]?.id || 1,
    date: extracted.date,
    note: extracted.description
  }
}

export function getApiKeyStatus(): 'configured' | 'missing' {
  return getApiKey() ? 'configured' : 'missing'
}
```

- [ ] **Step 10: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 11: 提交**

```bash
git add src/renderer/services/ai.ts
git commit -m "feat: 添加AI Service核心逻辑 — 智谱API调用+两步匹配"
```

---

### Task 2: AI 记账弹窗组件

**Files:**
- Create: `src/renderer/components/AIRecordModal.tsx`

- [ ] **Step 1: 创建组件骨架**

```typescript
// src/renderer/components/AIRecordModal.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Modal, Input, Button, Upload, message, notification, Spin, Typography, Space, Select } from 'antd'
import {
  AudioOutlined, CameraOutlined, PictureOutlined,
  SendOutlined, DeleteOutlined, ReloadOutlined
} from '@ant-design/icons'
import type { RootState } from '../store'
import { analyzeAccounting, getApiKeyStatus, transcribeVoice } from '../services/ai'
import { getApi } from '../api/mock'

const { TextArea } = Input
const { Text } = Typography

export type AIMode = 'text' | 'screenshot' | 'camera' | 'voice'

interface Props {
  open: boolean
  mode: AIMode
  onClose: () => void
  onSuccess: () => void
}

export default function AIRecordModal({ open, mode, onClose, onSuccess }: Props) {
  const accounts = useSelector((state: RootState) => state.accounts.items) as any[]
  const categories = useSelector((state: RootState) => state.categories.items) as any[]
  const api = getApi()

  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [text, setText] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [photoTaken, setPhotoTaken] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)

  const handleError = (e: any) => {
    const msg = e.message
    if (msg === 'NO_API_KEY') message.error('请先在设置页配置智谱 API Key')
    else if (msg === 'INVALID_API_KEY') message.error('API Key 无效，请前往设置页重新配置')
    else if (msg === 'PARSE_ERROR') message.error('AI 解析失败，请重试')
    else if (msg === 'AMOUNT_INVALID') message.error('未能识别有效金额，请重新描述')
    else if (msg === 'VOICE_ERROR') message.error('语音识别失败，请重试')
    else if (msg === 'NO_INPUT') message.error('请输入记账描述或上传图片')
    else message.error('网络连接失败，请检查网络后重试')
  }

  const showUndoNotification = (recordId: number, record: any) => {
    const catName = categories.find((c: any) => c.id === record.categoryId)?.name || '未知'
    const accName = accounts.find((a: any) => a.id === record.accountId)?.name || '未知'
    const key = `ai-record-${recordId}`
    notification.success({
      message: `AI记账: ¥${record.amount.toFixed(2)} · ${catName} - ${accName}`,
      description: record.note,
      duration: 5,
      key,
      btn: (
        <Button type="primary" size="small" danger onClick={async () => {
          await api.deleteRecord(recordId)
          notification.close(key)
          message.info('已撤销该记账')
          onSuccess()
        }}>撤销</Button>
      )
    })
  }

  const doSubmit = async (opts: { text?: string; imageBase64?: string }) => {
    if (getApiKeyStatus() === 'missing') {
      message.error('请先在设置页配置智谱 API Key')
      return
    }
    setLoading(true)
    setLoadingText('AI 正在识别…')
    try {
      const record = await analyzeAccounting({ ...opts, accounts, categories })
      setLoadingText('正在写入…')
      const id = await api.addRecord({
        amount: record.amount, type: record.type,
        categoryId: record.categoryId, accountId: record.accountId,
        date: record.date, note: record.note
      } as any)
      showUndoNotification(id, record)
      setText('')
      setImageBase64(null)
      setImagePreview(null)
      setPhotoTaken(null)
      onClose()
      onSuccess()
    } catch (e: any) {
      handleError(e)
    } finally {
      setLoading(false)
    }
  }

  // ... rest of component
}
```

- [ ] **Step 2: 实现文本和截图模式**

```typescript
  const handleTextSubmit = () => {
    if (!text.trim()) return
    doSubmit({ text: text.trim() })
  }

  const handleImageFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      message.error('图片过大，请压缩后重试')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          handleImageFile(items[i].getAsFile()!)
          break
        }
      }
    }
  }, [handleImageFile])

  const handleImageSubmit = () => {
    if (!imageBase64) return
    doSubmit({ imageBase64 })
  }
```

- [ ] **Step 3: 实现拍照模式**

```typescript
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
      }
    } catch {
      message.error('无法访问摄像头，请检查权限设置')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setPhotoTaken(dataUrl)
    setImageBase64(dataUrl.split(',')[1])
    stopCamera()
  }

  useEffect(() => {
    if (open && mode === 'camera') startCamera()
    return () => stopCamera()
  }, [open, mode])
```

- [ ] **Step 4: 实现语音模式**

```typescript
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1]
          setLoading(true)
          setLoadingText('语音识别中…')
          try {
            const transcription = await transcribeVoice(base64)
            await doSubmit({ text: transcription })
          } catch (e: any) {
            handleError(e)
            setLoading(false)
          }
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      setRecording(true)
    } catch {
      message.error('无法访问麦克风，请检查权限设置')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }
```

- [ ] **Step 5: 渲染 Modal**

```typescript
  const modeLabel =
    mode === 'text' ? '文本' : mode === 'screenshot' ? '截图' : mode === 'camera' ? '拍照' : '语音'

  return (
    <Modal
      title={`AI 智能记账 - ${modeLabel}`}
      open={open}
      onCancel={() => { stopCamera(); onClose() }}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Spin spinning={loading} tip={loadingText}>
        {mode === 'text' && (
          <div onPaste={handlePaste}>
            <TextArea rows={4} value={text} onChange={e => setText(e.target.value)}
              placeholder="例如：今天午餐花了30元现金" style={{ marginBottom: 12 }} />
            <Button type="primary" icon={<SendOutlined />} onClick={handleTextSubmit} loading={loading} block>
              AI 记账
            </Button>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              支持粘贴截图：Ctrl+V
            </Text>
          </div>
        )}

        {mode === 'screenshot' && (
          <div onPaste={handlePaste}>
            {imagePreview ? (
              <div style={{ textAlign: 'center' }}>
                <img src={imagePreview} alt="预览" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }} />
                <div style={{ marginTop: 12 }}>
                  <Button icon={<DeleteOutlined />} onClick={() => { setImagePreview(null); setImageBase64(null) }}>重新选择</Button>
                  <Button type="primary" onClick={handleImageSubmit} loading={loading} style={{ marginLeft: 8 }}>AI 识别</Button>
                </div>
              </div>
            ) : (
              <div style={{ border: '2px dashed #d9d9d9', borderRadius: 8, padding: 40, textAlign: 'center' }}>
                <PictureOutlined style={{ fontSize: 32, color: '#999', marginBottom: 12 }} />
                <div>点击上传或拖拽图片，或直接粘贴截图</div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }} />
                <Button onClick={() => fileRef.current?.click()} style={{ marginTop: 12 }}>选择图片</Button>
              </div>
            )}
          </div>
        )}

        {mode === 'camera' && (
          <div style={{ textAlign: 'center' }}>
            {photoTaken ? (
              <div>
                <img src={photoTaken} alt="拍摄" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }} />
                <div style={{ marginTop: 12 }}>
                  <Button icon={<ReloadOutlined />} onClick={() => { setPhotoTaken(null); setImageBase64(null); startCamera() }}>重新拍摄</Button>
                  <Button type="primary" onClick={handleImageSubmit} loading={loading} style={{ marginLeft: 8 }}>AI 识别</Button>
                </div>
              </div>
            ) : cameraActive ? (
              <div>
                <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 360, borderRadius: 8 }} />
                <Button type="primary" icon={<CameraOutlined />} onClick={takePhoto} style={{ marginTop: 12 }} size="large">拍照</Button>
              </div>
            ) : (
              <Spin tip="启动摄像头…" />
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        )}

        {mode === 'voice' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Button
              type={recording ? 'default' : 'primary'}
              shape="circle"
              size="large"
              icon={<AudioOutlined />}
              onClick={recording ? stopRecording : startRecording}
              style={{
                width: 80, height: 80, fontSize: 32,
                ...(recording ? { borderColor: '#ff4d4f', color: '#ff4d4f' } : {})
              }}
            />
            <div style={{ marginTop: 16, fontSize: 14 }}>
              {recording ? '正在录音… 点击停止' : '点击开始录音'}
            </div>
          </div>
        )}
      </Spin>
    </Modal>
  )
}
```

- [ ] **Step 6: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/AIRecordModal.tsx
git commit -m "feat: 添加AI记账弹窗 — 文本/截图/拍照/语音"
```

---

### Task 3: Settings — AI 设置卡片

**Files:**
- Modify: `src/renderer/pages/Settings.tsx`

- [ ] **Step 1: 添加 AI 状态变量和存储函数**

在 Settings 组件的 state 声明区域添加：

```typescript
const [apiKey, setApiKey] = useState(() => localStorage.getItem('zhipu_api_key') || '')
const [showKey, setShowKey] = useState(false)
const [storeMappings, setStoreMappings] = useState<Array<{ storeName: string; categoryId: number }>>(() => {
  const userId = localStorage.getItem('userId') || '0'
  try { return JSON.parse(localStorage.getItem(`store_mappings_${userId}`) || '[]') } catch { return [] }
})
const [newStoreName, setNewStoreName] = useState('')
const [newStoreCategory, setNewStoreCategory] = useState<number | null>(null)

const handleSaveApiKey = () => {
  if (apiKey) {
    localStorage.setItem('zhipu_api_key', apiKey)
    message.success('API Key 已保存')
  } else {
    localStorage.removeItem('zhipu_api_key')
    message.info('API Key 已清除')
  }
}

const handleAddMapping = () => {
  if (!newStoreName.trim() || !newStoreCategory) return
  const exists = storeMappings.find(m => m.storeName === newStoreName.trim())
  if (exists) { message.warning('该店铺映射已存在'); return }
  const updated = [...storeMappings, { storeName: newStoreName.trim(), categoryId: newStoreCategory }]
  setStoreMappings(updated)
  const userId = localStorage.getItem('userId') || '0'
  localStorage.setItem(`store_mappings_${userId}`, JSON.stringify(updated))
  setNewStoreName('')
  setNewStoreCategory(null)
}

const handleRemoveMapping = (storeName: string) => {
  const updated = storeMappings.filter(m => m.storeName !== storeName)
  setStoreMappings(updated)
  const userId = localStorage.getItem('userId') || '0'
  localStorage.setItem(`store_mappings_${userId}`, JSON.stringify(updated))
}
```

- [ ] **Step 2: 添加 AI 设置卡片 JSX**

在数据管理卡片之前插入：

```typescript
<Card title="🤖 AI 智能记账" style={{ marginBottom: 16 }}>
  <div style={{ marginBottom: 24 }}>
    <Typography.Title level={5} style={{ marginBottom: 8 }}>智谱 API Key</Typography.Title>
    <Space.Compact style={{ width: '100%' }}>
      <Input.Password
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        placeholder="输入智谱 API Key"
        visibilityToggle={{ visible: showKey, onVisibleChange: setShowKey }}
      />
      <Button type="primary" onClick={handleSaveApiKey}>保存</Button>
    </Space.Compact>
    <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
      免费获取 Key：<a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer">open.bigmodel.cn</a>
      {' '}· 免费模型：GLM-4-Flash / GLM-4V-Flash / GLM-4-Voice
    </div>
    {apiKey && <Tag color="green" style={{ marginTop: 8 }}>✓ 已配置</Tag>}
  </div>

  <Divider />

  <div>
    <Typography.Title level={5}>店铺 → 类别固定映射</Typography.Title>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      配置后，AI 识别到特定店铺时直接使用对应分类
    </Typography.Text>

    {storeMappings.length > 0 ? (
      <Table
        dataSource={storeMappings.map((m, i) => ({ ...m, _key: i }))}
        rowKey="_key"
        columns={[
          { title: '店铺名', dataIndex: 'storeName' },
          { title: '类别', dataIndex: 'categoryId', render: (id: number) => categories.find((c: any) => c.id === id)?.name || '未知' },
          { title: '操作', render: (_: any, r: any) => <Button type="link" danger size="small" onClick={() => handleRemoveMapping(r.storeName)}>删除</Button> }
        ]}
        size="small"
        pagination={false}
        style={{ marginTop: 12 }}
      />
    ) : (
      <div style={{ color: '#999', fontSize: 13, marginTop: 8 }}>暂无映射</div>
    )}

    <Space style={{ marginTop: 12, width: '100%' }}>
      <Input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="店铺名（如：星巴克）" style={{ width: 180 }} />
      <Select
        value={newStoreCategory}
        onChange={setNewStoreCategory}
        placeholder="选择分类"
        style={{ width: 180 }}
        options={categories.filter((c: any) => !c.isDeleted).map((c: any) => ({ value: c.id, label: `${c.icon || ''} ${c.name}` }))}
      />
      <Button type="primary" onClick={handleAddMapping} disabled={!newStoreName.trim() || !newStoreCategory}>添加</Button>
    </Space>
  </div>
</Card>
```

- [ ] **Step 3: 验证编译 + 测试**

```bash
npx tsc --noEmit
npm test
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/pages/Settings.tsx
git commit -m "feat: Settings添加AI配置卡片 — API Key + 店铺映射"
```

---

### Task 4: Dashboard — AI 快速记账入口

**Files:**
- Modify: `src/renderer/pages/Dashboard.tsx`

- [ ] **Step 1: 添加 import 和 state**

```typescript
// 顶部额外 import
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import { fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import AIRecordModal, { AIMode } from '../components/AIRecordModal'

// 组件内：
const dispatch = useDispatch<AppDispatch>()
const [aiModalOpen, setAiModalOpen] = useState(false)
const [aiMode, setAiMode] = useState<AIMode>('text')
```

- [ ] **Step 2: 替换快速记账卡片**

将现有「快速记账」Card（onQuickRecord 那个 Col）替换为：

```typescript
const aiEntryButtons: Array<{ key: AIMode; icon: string; label: string; color: string }> = [
  { key: 'text', icon: '💬', label: '文本记账', color: '#667eea' },
  { key: 'screenshot', icon: '📷', label: '截图记账', color: '#52c41a' },
  { key: 'camera', icon: '📸', label: '拍照识别', color: '#fa8c16' },
  { key: 'voice', icon: '🎤', label: '语音记账', color: '#f5222d' },
]

{/* 替换原来的快速记账 Col */}
<Col xs={24} sm={24} md={12}>
  <Card title="🤖 AI 智能记账" bodyStyle={{ padding: '12px 16px' }}>
    <Row gutter={[12, 12]}>
      {aiEntryButtons.map(btn => (
        <Col xs={12} sm={12} md={6} key={btn.key}>
          <Card hoverable
            style={{ textAlign: 'center', borderColor: btn.color, borderWidth: 1 }}
            bodyStyle={{ padding: '12px 8px' }}
            onClick={() => { setAiMode(btn.key); setAiModalOpen(true) }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>{btn.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: btn.color }}>{btn.label}</div>
          </Card>
        </Col>
      ))}
    </Row>
  </Card>
</Col>
```

- [ ] **Step 3: 添加 AIRecordModal 到 JSX**

在 Dashboard return 末尾的最后一个 `</div>` 之前：

```typescript
<AIRecordModal
  open={aiModalOpen}
  mode={aiMode}
  onClose={() => setAiModalOpen(false)}
  onSuccess={() => {
    dispatch(fetchRecords() as any)
    dispatch(fetchAccounts() as any)
  }}
/>
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit && npm run build:vite
```

- [ ] **Step 5: 提交**

```bash
git add src/renderer/pages/Dashboard.tsx
git commit -m "feat: Dashboard AI智能记账入口面板"
```

---

### Task 5: Records — 记一笔弹窗 AI Tab

**Files:**
- Modify: `src/renderer/pages/Records.tsx`

- [ ] **Step 1: 添加 import 和 state**

```typescript
// 顶部添加
import { Tabs } from 'antd'

// state 区域添加
const [addModalTab, setAddModalTab] = useState<'manual' | 'ai'>('manual')
```

- [ ] **Step 2: 改造 Modal 为 Tabs 结构**

```typescript
<Modal
  title={editingRecord ? "编辑记录" : "添加记录"}
  open={isModalOpen}
  onOk={addModalTab === 'manual' ? handleOk : undefined}
  onCancel={() => setIsModalOpen(false)}
  okText={addModalTab === 'manual' ? "确定" : undefined}
  cancelText="取消"
  width={520}
  footer={addModalTab === 'manual' ? undefined : null}
>
  <Tabs activeKey={addModalTab} onChange={(k: string) => setAddModalTab(k as 'manual' | 'ai')}>
    <Tabs.TabPane tab="手动记账" key="manual">
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* 原有所有 Form.Item 保持不变 */}
      </Form>
    </Tabs.TabPane>
    <Tabs.TabPane tab="🤖 AI 记账" key="ai">
      <div style={{ padding: '16px 0', textAlign: 'center', color: '#999' }}>
        请从 Dashboard 或导航栏进入 AI 智能记账
        <br />
        <Button type="primary" style={{ marginTop: 12 }} onClick={() => {
          setIsModalOpen(false)
          // 切换到 Dashboard
        }}>前往 AI 记账</Button>
      </div>
    </Tabs.TabPane>
  </Tabs>
</Modal>
```

- [ ] **Step 3: 验证编译 + 测试**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/pages/Records.tsx
git commit -m "feat: Records弹窗添加AI记账Tab入口"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 完整构建**

```bash
npm run build:vite
```
Expected: `✓ built in Xs`

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```
Expected: 无错误

- [ ] **Step 3: 运行测试**

```bash
npm test
```
Expected: 14 tests passed

- [ ] **Step 4: 提交**

```bash
git commit -m "chore: AI智能记账最终验证通过"
```
