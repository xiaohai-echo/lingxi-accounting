// AI Service - Zhipu API integration for intelligent accounting
// Handles: text/image extraction, voice transcription, store/category/account matching

// ==================== Types ====================

export interface ExtractedInfo {
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  date: string
  time?: string
  paymentMethod?: string
  cardLast4?: string | null
  transferType?: 'transfer' | 'withdraw' | 'recharge'
  targetPaymentMethod?: string
  targetCardLast4?: string | null
}

export interface RecordInput {
  amount: number
  type: 'income' | 'expense' | 'transfer'
  categoryId?: number
  accountId?: number
  date: string
  time?: string
  note: string
  paymentMethod?: string
  cardLast4?: string | null
  transferType?: 'transfer' | 'withdraw' | 'recharge'
  targetAccountId?: number
  fee?: number
}

export interface CategoryItem {
  id: number
  name: string
  type: 'income' | 'expense'
  icon?: string
  color?: string
}

export interface AccountItem {
  id?: number
  name: string
  type: string
  cardNo?: string
  bankName?: string
  holderName?: string
}

// ==================== Message Types ====================

interface ZhipuContentPart {
  type: 'text' | 'image_url' | 'audio_url'
  text?: string
  image_url?: { url: string }
  audio_url?: { url: string }
}

interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ZhipuContentPart[]
}

// ==================== Config ====================

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const ZHIPU_ENDPOINT = '/chat/completions'

const EXTRACTION_SYSTEM_PROMPT = '你是消费记账提取助手。从用户输入中提取记账信息，返回纯 JSON。'
const CATEGORY_SYSTEM_PROMPT = '你是记账分类助手。根据消费描述选择最合适的分类。'

// ==================== Key & Config Helpers ====================

export function getApiKey(): string | null {
  try {
    return localStorage.getItem('zhipu_api_key')
  } catch {
    return null
  }
}

export function getApiKeyStatus(): 'configured' | 'missing' {
  return getApiKey() ? 'configured' : 'missing'
}

function getCurrentUserId(): number | null {
  try {
    const stored = localStorage.getItem('userId')
    if (stored) {
      const id = parseInt(stored, 10)
      return isNaN(id) ? null : id
    }
  } catch { /* localStorage unavailable */ }
  return null
}

export function getStoreMappings(): Record<string, number> {
  const userId = getCurrentUserId()
  if (!userId) return {}
  try {
    const stored = localStorage.getItem(`store_mappings_${userId}`)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Convert string values to numbers if needed
      const result: Record<string, number> = {}
      for (const [key, val] of Object.entries(parsed)) {
        result[key] = typeof val === 'number' ? val : Number(val)
      }
      return result
    }
  } catch { /* corrupted data */ }
  return {}
}

// ==================== Core API Caller ====================

export async function callZhipu(
  model: string,
  messages: ZhipuMessage[]
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  const url = `${ZHIPU_BASE_URL}${ZHIPU_ENDPOINT}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 1024
      })
    })
  } catch {
    throw new Error('API_ERROR')
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('INVALID_API_KEY')
  }

  if (!response.ok) {
    throw new Error('API_ERROR')
  }

  try {
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      throw new Error('API_ERROR')
    }
    return content
  } catch (e) {
    if (e instanceof Error && e.message !== 'API_ERROR') {
      throw new Error('API_ERROR')
    }
    throw e
  }
}

// ==================== JSON Parsing ====================

export function parseExtracted(raw: string): ExtractedInfo {
  let jsonStr = raw.trim()

  // Remove markdown code block wrapping (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('PARSE_ERROR')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PARSE_ERROR')
  }

  const obj = parsed as Record<string, unknown>

  // Validate amount
  const amount = Number(obj.amount)
  if (!amount || amount <= 0 || isNaN(amount)) {
    throw new Error('PARSE_ERROR')
  }

  // Validate type
  const rawType = obj.type
  if (rawType !== 'income' && rawType !== 'expense' && rawType !== 'transfer') {
    throw new Error('PARSE_ERROR')
  }
  const type: 'income' | 'expense' | 'transfer' = rawType

  // Validate description
  const description = String(obj.description || obj.desc || '')
  if (!description.trim()) {
    throw new Error('PARSE_ERROR')
  }

  // Validate date format YYYY-MM-DD, fallback to today
  let date = String(obj.date || '')
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(date)) {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    date = `${y}-${m}-${d}`
  }

  // Validate time format HH:mm:ss, fallback to current time
  let time = String(obj.time || '')
  const timePattern = /^\d{2}:\d{2}(:\d{2})?$/
  if (!timePattern.test(time)) {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    time = `${hh}:${mm}:${ss}`
  } else if (time.length === 5) {
    time += ':00'
  }

  // Optional fields
  const paymentMethod = obj.paymentMethod ? String(obj.paymentMethod) : undefined
  const cardLast4 = obj.cardLast4 && obj.cardLast4 !== null ? String(obj.cardLast4) : null

  const rawTransferType = obj.transferType ? String(obj.transferType) : ''
  const transferType: 'transfer' | 'withdraw' | 'recharge' | undefined =
    ['transfer', 'withdraw', 'recharge'].includes(rawTransferType) ? rawTransferType as any : undefined
  const targetPaymentMethod = obj.targetPaymentMethod ? String(obj.targetPaymentMethod) : undefined
  const targetCardLast4 = obj.targetCardLast4 && obj.targetCardLast4 !== null ? String(obj.targetCardLast4) : null

  return {
    amount,
    type,
    description: description.trim(),
    date,
    time,
    paymentMethod: paymentMethod || undefined,
    cardLast4: cardLast4 && cardLast4.length > 0 ? cardLast4 : null,
    transferType,
    targetPaymentMethod,
    targetCardLast4: targetCardLast4 && targetCardLast4.length > 0 ? targetCardLast4 : null
  }
}

// ==================== Prompt Builders ====================

function buildExtractionPrompt(text: string): string {
  return `从以下用户输入中提取记账信息，返回纯 JSON 格式（不要 markdown 代码块）：
{
  "amount": 数字（大于0）,
  "type": "income"、"expense" 或 "transfer",
  "description": "简短描述消费内容或转账说明",
  "date": "YYYY-MM-DD 格式",
  "time": "HH:mm:ss 格式，如无提及则用00:00:00",
  "paymentMethod": "支付来源（如：微信、支付宝、现金、银行卡、花呗、零钱等，可选）",
  "cardLast4": "银行卡后四位（如无则为null）",
  "transferType": "如type为transfer，标记为transfer/withdraw/recharge，否则为null",
  "targetPaymentMethod": "转账/提现的目标账户描述（如：银行卡、微信零钱等，可选）",
  "targetCardLast4": "目标银行卡后四位（如无则为null）"
}

识别规则：
- 提现：从微信/支付宝/银行卡提到银行卡 → type: "transfer", transferType: "withdraw"
- 充值：从银行卡转到微信/支付宝 → type: "transfer", transferType: "recharge"
- 转账：账户间互转 → type: "transfer", transferType: "transfer"

用户输入：${text}`
}

function buildCategoryPrompt(
  description: string,
  matchType: 'income' | 'expense',
  categories: CategoryItem[]
): string {
  const filtered = categories.filter(c => c.type === matchType)
  const categoryList = filtered
    .map(c => `ID:${c.id} - ${c.name}`)
    .join('\n')

  return `根据消费描述，从以下分类列表中选择最匹配的分类，只返回分类 ID 数字。

消费描述：${description}
消费类型：${matchType === 'income' ? '收入' : '支出'}

分类列表：
${categoryList}

请只返回匹配的分类 ID 数字，如无匹配返回 null。`
}

// ==================== Text Extraction ====================

export async function extractFromText(text: string): Promise<ExtractedInfo> {
  const content = await callZhipu('glm-4-flash', [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildExtractionPrompt(text) }
  ])
  return parseExtracted(content)
}

// ==================== Image Extraction ====================

export async function extractFromImage(base64: string): Promise<ExtractedInfo> {
  // Ensure base64 has proper data URI prefix
  const imageUrl = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`

  const content = await callZhipu('glm-4v-flash', [
    {
      role: 'user',
      content: [
        { type: 'text', text: buildExtractionPrompt('请从这张图片中提取记账信息。') },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ])
  return parseExtracted(content)
}

// ==================== Voice Transcription ====================

export async function transcribeVoice(audioBase64: string, mimeType?: string): Promise<string> {
  const mime = mimeType || 'audio/webm'
  const audioUrl = audioBase64.startsWith('data:') ? audioBase64 : `data:${mime};base64,${audioBase64}`

  const content = await callZhipu('glm-4-voice', [
    {
      role: 'user',
      content: [
        { type: 'text', text: '请将这段音频转写为文字，只返回转写结果，不要添加任何解释。' },
        { type: 'audio_url', audio_url: { url: audioUrl } }
      ]
    }
  ]).catch(() => '')
  return content.trim()
}

// ==================== Store Mapping Match ====================

export function matchStoreMapping(description: string): number | null {
  const mappings = getStoreMappings()
  const entries = Object.entries(mappings)

  if (entries.length === 0) return null

  // Sort by key length descending so longer (more specific) store names match first
  entries.sort((a, b) => b[0].length - a[0].length)

  for (const [storeName, categoryId] of entries) {
    if (description.includes(storeName)) {
      if (typeof categoryId === 'number' && !isNaN(categoryId) && categoryId > 0) {
        return categoryId
      }
    }
  }

  return null
}

// ==================== AI Category Matching ====================

export async function aiMatchCategory(
  description: string,
  type: 'income' | 'expense',
  categories: CategoryItem[]
): Promise<number | null> {
  const matchingCategories = categories.filter(c => c.type === type)
  if (matchingCategories.length === 0) return null

  // Fast path: single category
  if (matchingCategories.length === 1) {
    return matchingCategories[0].id
  }

  const prompt = buildCategoryPrompt(description, type, categories)

  try {
    const content = await callZhipu('glm-4-flash', [
      { role: 'system', content: CATEGORY_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ])

    const cleaned = content.trim()
    if (cleaned === 'null' || cleaned === '' || cleaned === '无') return null

    const id = parseInt(cleaned, 10)
    if (isNaN(id) || id <= 0) return null

    // Verify the ID exists in our matching categories
    const found = matchingCategories.find(c => c.id === id)
    if (!found) return null

    return id
  } catch {
    return null
  }
}

// ==================== Account Matching ====================

export function matchAccount(
  paymentMethod: string | undefined,
  cardLast4: string | null | undefined,
  accounts: AccountItem[],
  type: 'income' | 'expense' | 'transfer' = 'expense'
): AccountItem | null {
  if (!accounts || accounts.length === 0) return null

  // Tier 1: cardLast4 exact match against account.cardNo
  if (cardLast4 && cardLast4.length > 0) {
    const cardMatch = accounts.find(
      a => a.cardNo && typeof a.cardNo === 'string' && a.cardNo.endsWith(cardLast4)
    )
    if (cardMatch) return cardMatch
  }

  // Tier 2: paymentMethod fuzzy match
  if (paymentMethod) {
    const method = paymentMethod.toLowerCase()

    if (method.includes('花呗')) {
      const huabei = accounts.find(a => a.name && (a.name.includes('花呗') || a.name.includes('花贝')))
      if (huabei) return huabei
      const alipay = accounts.find(a => a.type === 'alipay')
      if (alipay) return alipay
    }
    if (method.includes('零钱')) {
      const wechat = accounts.find(a => a.type === 'wechat' || (a.name && a.name.includes('微信')))
      if (wechat) return wechat
    }
    if (method.includes('微信') || method.includes('wechat')) {
      const wechat = accounts.find(a => a.type === 'wechat')
      if (wechat) return wechat
    }
    if (method.includes('支付宝') || method.includes('alipay')) {
      const alipay = accounts.find(a => a.type === 'alipay')
      if (alipay) return alipay
    }
    if (method.includes('现金') || method.includes('cash')) {
      const cash = accounts.find(a => a.type === 'cash')
      if (cash) return cash
    }
    if (method.includes('银行') || method.includes('卡') || method.includes('bank') || method.includes('card')) {
      // Prefer bank over credit for most cases
      const bank = accounts.find(a => a.type === 'bank')
      if (bank) return bank
      const credit = accounts.find(a => a.type === 'credit')
      if (credit) return credit
    }
  }

  // Tier 3: default fallback
  if (type === 'income') {
    const bank = accounts.find(a => a.type === 'bank')
    if (bank) return bank
  }
  // For expense, default to wechat
  const wechat = accounts.find(a => a.type === 'wechat')
  if (wechat) return wechat
  // Next: cash
  const cash = accounts.find(a => a.type === 'cash')
  if (cash) return cash
  // Last resort: first available account
  return accounts[0] || null
}

// ==================== Main Orchestrator ====================

export async function analyzeAccounting(options: {
  text?: string
  imageBase64?: string
  accounts: AccountItem[]
  categories: CategoryItem[]
}): Promise<RecordInput> {
  // Step 1: Extract accounting info from text or image
  let extracted: ExtractedInfo

  if (options.text) {
    extracted = await extractFromText(options.text)
  } else if (options.imageBase64) {
    extracted = await extractFromImage(options.imageBase64)
  } else {
    throw new Error('请提供文本或图片输入')
  }

  const { amount, type, description, date, time, paymentMethod, cardLast4, transferType, targetPaymentMethod, targetCardLast4 } = extracted

  // Step 2: Try store mapping match first (local, no API call)
  let categoryId: number | undefined
  if (type !== 'transfer') {
    const storeMatch = matchStoreMapping(description)
    if (storeMatch !== null) {
      categoryId = storeMatch
    }
  }

  // Step 3: AI match category (only if no store mapping found, and not transfer)
  if (categoryId === undefined && type !== 'transfer') {
    const aiMatch = await aiMatchCategory(description, type, options.categories)
    if (aiMatch !== null) {
      categoryId = aiMatch
    }
  }

  // Step 4: Match accounts
  const account = matchAccount(paymentMethod, cardLast4, options.accounts, type)
  let targetAccountId: number | undefined
  if (type === 'transfer') {
    const targetAccount = matchAccount(targetPaymentMethod, targetCardLast4, options.accounts, 'expense')
    targetAccountId = targetAccount?.id
  }

  return {
    amount,
    type,
    categoryId,
    accountId: account?.id,
    targetAccountId,
    date,
    time,
    note: description,
    transferType,
    paymentMethod,
    cardLast4
  }
}
