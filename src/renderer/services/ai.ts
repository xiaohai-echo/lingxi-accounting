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
  accountId?: number | null
  categoryId?: number | null
  targetAccountId?: number | null
}

export interface RecordInput {
  amount: number
  type: 'income' | 'expense' | 'transfer'
  categoryId?: number
  accountId?: number
  date: string
  time?: string
  title: string
  note: string
  paymentMethod?: string
  cardLast4?: string | null
  transferType?: 'transfer' | 'withdraw' | 'recharge'
  targetAccountId?: number
  targetPaymentMethod?: string
  targetCardLast4?: string | null
  fee?: number
}

export interface CategoryItem {
  id: number
  name: string
  type: 'income' | 'expense' | 'transfer'
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

const EXTRACTION_SYSTEM_PROMPT = '你是灵析记账提取助手。从用户输入中提取记账信息，返回纯 JSON。'
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
  if (!timePattern.test(time) || time === '00:00:00' || time === '00:00') {
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
  const rawCardLast4 = obj.cardLast4 && obj.cardLast4 !== null ? String(obj.cardLast4).replace(/\s/g, '') : null
  const cardLast4 = rawCardLast4
    ? (rawCardLast4.length > 4 ? rawCardLast4.slice(-4) : rawCardLast4)
    : null

  const rawTransferType = obj.transferType ? String(obj.transferType) : ''
  const transferType: 'transfer' | 'withdraw' | 'recharge' | undefined =
    ['transfer', 'withdraw', 'recharge'].includes(rawTransferType) ? rawTransferType as any : undefined
  const targetPaymentMethod = obj.targetPaymentMethod ? String(obj.targetPaymentMethod) : undefined
  const rawTargetCardLast4 = obj.targetCardLast4 && obj.targetCardLast4 !== null ? String(obj.targetCardLast4).replace(/\s/g, '') : null
  const targetCardLast4 = rawTargetCardLast4
    ? (rawTargetCardLast4.length > 4 ? rawTargetCardLast4.slice(-4) : rawTargetCardLast4)
    : null

  const accountId = obj.accountId != null ? Number(obj.accountId) : null
  const categoryId = obj.categoryId != null ? Number(obj.categoryId) : null
  const targetAccountId = obj.targetAccountId != null ? Number(obj.targetAccountId) : null

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
    targetCardLast4: targetCardLast4 && targetCardLast4.length > 0 ? targetCardLast4 : null,
    accountId: accountId && !isNaN(accountId) && accountId > 0 ? accountId : null,
    categoryId: categoryId && !isNaN(categoryId) && categoryId > 0 ? categoryId : null,
    targetAccountId: targetAccountId && !isNaN(targetAccountId) && targetAccountId > 0 ? targetAccountId : null
  }
}

// ==================== Prompt Builders ====================

function buildExtractionPrompt(text: string, accounts?: AccountItem[], categories?: CategoryItem[]): string {
  const accountSection = accounts && accounts.length > 0
    ? `\n\n用户账户列表：\n${accounts.map(a => {
        const parts = [`ID:${a.id} - ${a.name}(${a.type})`]
        if (a.bankName) parts.push(`银行:${a.bankName}`)
        if (a.cardNo) parts.push(`尾号:${a.cardNo.slice(-4)}`)
        return parts.join(' ')
      }).join('\n')}\n请根据用户描述的支付方式，从以上账户列表中选择最匹配的账户，返回其 ID 作为 accountId。如用户提到"信用卡"则匹配 type 为 credit 的账户，"储蓄卡/银行卡"匹配 type 为 bank 的账户，"微信"匹配 wechat，"支付宝"匹配 alipay，"现金"匹配 cash。如为转账，还需返回 targetAccountId。`
    : ''

  const categorySection = categories && categories.length > 0
    ? `\n\n用户分类列表：\n${categories.map(c => `ID:${c.id} - ${c.name}(${c.type === 'income' ? '收入' : c.type === 'transfer' ? '转账' : '支出'})`).join('\n')}\n请根据消费描述，从以上分类列表中选择最匹配的分类，返回其 ID 作为 categoryId。注意 type 为 expense 时只能选支出分类，type 为 income 时只能选收入分类，type 为 transfer 时只能选转账分类。`
    : ''

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']
  const todayWeekday = `星期${weekdayNames[now.getDay()]}`

  return `从以下用户输入中提取记账信息，返回纯 JSON 格式（不要 markdown 代码块）：
{
  "amount": 数字（大于0）,
  "type": "income"、"expense" 或 "transfer",
  "description": "核心消费品或服务名称，只保留最精简的关键词，去除支付方式、金额、数量等无关信息。例如：'午餐买了一杯古茗奶茶，用信用卡支付12元' → '古茗奶茶'，'打车去公司花了25块' → '打车'，'超市买了水果和蔬菜' → '水果蔬菜'",
  "date": "YYYY-MM-DD 格式",
  "time": "HH:mm:ss 格式，如用户未提及具体时间则为null",
  "paymentMethod": "支付来源（如：微信、支付宝、现金、银行卡、花呗、零钱等，可选）",
  "cardLast4": "银行卡后四位（如提及银行卡尾号则提取，如'工商银行(8888)'提取8888，'****1234'提取1234，否则为null）",
  "transferType": "如type为transfer，标记为transfer/withdraw/recharge，否则为null",
  "targetPaymentMethod": "转账/提现的目标账户描述（如：银行卡、微信零钱等，可选）",
  "targetCardLast4": "目标银行卡后四位（如无则为null）",
  "accountId": 从账户列表匹配的账户ID（如无法匹配则为null）,
  "categoryId": 从分类列表匹配的分类ID（如无法匹配则为null）,
  "targetAccountId": 转账目标账户ID（如非转账则为null）
}

识别规则：
- 提现：从微信/支付宝/银行卡提到银行卡 → type: "transfer", transferType: "withdraw"
- 充值：从银行卡转到微信/支付宝 → type: "transfer", transferType: "recharge"
- 转账：账户间互转 → type: "transfer", transferType: "transfer"
- accountId 和 categoryId 必须从提供的列表中选择，不要编造不存在的 ID

日期识别规则（今天是 ${todayStr} ${todayWeekday}）：
- 未提及日期：date 为今天 ${todayStr}
- 相对日期：今天→${todayStr}，昨天→往前推1天，前天→往前推2天，大前天→往前推3天，以此类推
- 星期X：计算今天及之前最近的那个星期X的日期。例如今天是${todayWeekday}，若用户说"星期一"则找今天或之前最近的星期一
- 上周星期X：从上周一往前推算对应星期
- 具体日期：如"5月18日"或"2025-05-18"，直接转换为 YYYY-MM-DD 格式${accountSection}${categorySection}

用户输入：${text}`
}

function buildImageExtractionPrompt(accounts?: AccountItem[], categories?: CategoryItem[]): string {
  const accountSection = accounts && accounts.length > 0
    ? `\n\n用户账户列表：\n${accounts.map(a => {
        const parts = [`ID:${a.id} - ${a.name}(${a.type})`]
        if (a.bankName) parts.push(`银行:${a.bankName}`)
        if (a.cardNo) parts.push(`尾号:${a.cardNo.slice(-4)}`)
        return parts.join(' ')
      }).join('\n')}\n请根据截图中的支付方式，从以上账户列表中选择最匹配的账户，返回其 ID 作为 accountId。如截图显示"花呗"则匹配花呗或支付宝账户，"零钱"匹配微信账户，"银行卡"匹配 type 为 bank 或 credit 的账户（根据尾号精确匹配）。如为转账/充值/提现，还需返回 targetAccountId。`
    : ''

  const categorySection = categories && categories.length > 0
    ? `\n\n用户分类列表：\n${categories.map(c => `ID:${c.id} - ${c.name}(${c.type === 'income' ? '收入' : c.type === 'transfer' ? '转账' : '支出'})`).join('\n')}\n请根据消费描述，从以上分类列表中选择最匹配的分类，返回其 ID 作为 categoryId。注意 type 为 expense 时只能选支出分类，type 为 income 时只能选收入分类，type 为 transfer 时只能选转账分类。`
    : ''

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return `你是一个支付截图识别助手。请从这张支付截图中提取记账信息，返回纯 JSON 格式（不要 markdown 代码块）：
{
  "amount": 数字（支付金额，大于0）,
  "type": "income"、"expense" 或 "transfer",
  "description": "消费的商户名称或商品描述，这是最核心的信息，用于作为记账记录的标题。例如：'瑞幸咖啡'、'美团外卖'、'滴滴出行'。如为转账/充值/提现则写'转账'/'充值'/'提现'",
  "date": "YYYY-MM-DD 格式（从截图中识别交易日期）",
  "time": "HH:mm:ss 格式（从截图中识别交易时间，如无法识别则为null）",
  "paymentMethod": "支付来源描述（如：微信零钱、微信、支付宝、花呗、银行卡、储蓄卡、信用卡等）",
  "cardLast4": "银行卡后四位（如支付方式涉及银行卡则提取，否则为null）",
  "transferType": "如type为transfer，标记为transfer/withdraw/recharge，否则为null",
  "targetPaymentMethod": "转账/充值/提现的目标账户描述（如：银行卡、微信零钱、支付宝等，非转账则为null）",
  "targetCardLast4": "目标银行卡后四位（如无则为null）",
  "accountId": 从账户列表匹配的付款账户ID（如无法匹配则为null）,
  "categoryId": 从分类列表匹配的分类ID（如无法匹配则为null）,
  "targetAccountId": 转账/充值/提现的收款账户ID（如非转账则为null）
}

识别规则：
1. **金额识别**：提取截图中的支付金额，注意区分"金额"和"余额"，取支付/转账的金额而非账户余额
2. **类型判断**：
   - 普通消费支付（买东西、吃饭等）→ type: "expense"
   - 收到款项 → type: "income"
   - 转账（账户间互转）→ type: "transfer", transferType: "transfer"
   - 充值（银行卡充到微信/支付宝）→ type: "transfer", transferType: "recharge"
   - 提现（微信/支付宝提到银行卡）→ type: "transfer", transferType: "withdraw"
3. **商户名称**：提取截图中的商户名/店名作为 description，这是记账的核心标题信息。如"瑞幸咖啡"、"美团"、"滴滴"等
4. **支付方式与银行卡尾号识别**（非常重要！）：
   - 截图中银行卡尾号通常出现在括号内或星号后，如"工商银行(8888)"、"建设银行****1234"、"尾号5678"
   - cardLast4 必须提取完整的4位数字，如"8888"、"1234"、"5678"
   - 如果截图显示"银行卡(8888)"，则 paymentMethod 为"银行卡"，cardLast4 为"8888"
   - 如果截图显示"信用卡****1234"，则 paymentMethod 为"信用卡"，cardLast4 为"1234"
   - 转账场景中目标账户的银行卡尾号同样规则提取到 targetCardLast4
5. **日期时间**：从截图中识别交易发生的日期和时间，如截图中无日期则使用今天 ${todayStr}
6. **转账场景**（特别注意双账户的尾号匹配）：
   - 充值截图：paymentMethod 为付款方（如银行卡****1234），targetPaymentMethod 为收款方（如微信/支付宝）
   - 提现截图：paymentMethod 为付款方（如微信/支付宝），targetPaymentMethod 为收款方（如银行卡****5678）
   - 转账截图：paymentMethod 为转出方，targetPaymentMethod 为转入方
   - 转账场景中必须提取双方的银行卡尾号！
7. accountId 和 categoryId 必须从提供的列表中选择，不要编造不存在的 ID
8. 如果账户列表中没有匹配尾号的银行卡账户，accountId/targetAccountId 设为 null，但 cardLast4/targetCardLast4 必须如实提取${accountSection}${categorySection}`
}

function buildCategoryPrompt(
  description: string,
  matchType: 'income' | 'expense' | 'transfer',
  categories: CategoryItem[]
): string {
  const filtered = categories.filter(c => c.type === matchType)
  const categoryList = filtered
    .map(c => `ID:${c.id} - ${c.name}`)
    .join('\n')

  return `根据消费描述，从以下分类列表中选择最匹配的分类，只返回分类 ID 数字。

消费描述：${description}
消费类型：${matchType === 'income' ? '收入' : matchType === 'transfer' ? '转账' : '支出'}

分类列表：
${categoryList}

请只返回匹配的分类 ID 数字，如无匹配返回 null。`
}

// ==================== Text Extraction ====================

export async function extractFromText(text: string, accounts?: AccountItem[], categories?: CategoryItem[]): Promise<ExtractedInfo> {
  const content = await callZhipu('glm-4-flash', [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildExtractionPrompt(text, accounts, categories) }
  ])
  return parseExtracted(content)
}

// ==================== Image Extraction ====================

export async function extractFromImage(base64: string, accounts?: AccountItem[], categories?: CategoryItem[]): Promise<ExtractedInfo> {
  const imageUrl = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`

  const content = await callZhipu('glm-4v-flash', [
    {
      role: 'user',
      content: [
        { type: 'text', text: buildImageExtractionPrompt(accounts, categories) },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ])
  return parseExtracted(content)
}

// ==================== Voice Transcription ====================

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  return buffer
}

async function convertToWavBlob(audioBlob: Blob): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioCtx = new AudioContext()
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const samples = audioBuffer.getChannelData(0)
    const wavBuffer = encodeWav(samples, audioBuffer.sampleRate)
    return new Blob([wavBuffer], { type: 'audio/wav' })
  } finally {
    audioCtx.close()
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

export async function transcribeVoice(audioBase64: string, mimeType?: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API_KEY_MISSING')

  let base64Data = audioBase64
  if (audioBase64.startsWith('data:')) {
    const commaIdx = audioBase64.indexOf(',')
    if (commaIdx !== -1) base64Data = audioBase64.substring(commaIdx + 1)
  }

  let audioBlob = base64ToBlob(base64Data, mimeType || 'audio/webm')

  const needsConversion = !mimeType?.includes('wav') && !mimeType?.includes('mp3')
  if (needsConversion) {
    try {
      audioBlob = await convertToWavBlob(audioBlob)
      console.log('[ASR] audio converted to WAV successfully, size:', audioBlob.size)
    } catch (e) {
      console.warn('[ASR] audio conversion failed, sending original format:', e)
    }
  }

  const formData = new FormData()
  formData.append('model', 'glm-asr-2512')
  formData.append('file', audioBlob, 'audio.wav')
  formData.append('stream', 'false')

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('[ASR] API error:', response.status, errorText)
    throw new Error(`ASR_ERROR: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return (data.text || '').trim()
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
  type: 'income' | 'expense' | 'transfer',
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

  if (cardLast4 && cardLast4.length > 0) {
    const method = (paymentMethod || '').toLowerCase()

    const preferCredit = method.includes('信用卡') || method.includes('credit')
    const preferBank = method.includes('储蓄卡') || method.includes('借记卡') || method.includes('debit')

    if (preferCredit) {
      const creditMatch = accounts.find(
        a => a.type === 'credit' && a.cardNo && typeof a.cardNo === 'string' && a.cardNo.endsWith(cardLast4)
      )
      if (creditMatch) return creditMatch
    }

    if (preferBank) {
      const bankMatch = accounts.find(
        a => a.type === 'bank' && a.cardNo && typeof a.cardNo === 'string' && a.cardNo.endsWith(cardLast4)
      )
      if (bankMatch) return bankMatch
    }

    const cardMatch = accounts.find(
      a => a.cardNo && typeof a.cardNo === 'string' && a.cardNo.endsWith(cardLast4)
    )
    if (cardMatch) return cardMatch
  }

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
    if (method.includes('信用卡') || method.includes('credit card')) {
      const credit = accounts.find(a => a.type === 'credit')
      if (credit) return credit
    }
    if (method.includes('储蓄卡') || method.includes('借记卡') || method.includes('debit')) {
      const bank = accounts.find(a => a.type === 'bank')
      if (bank) return bank
    }
    if (method.includes('银行') || method.includes('卡') || method.includes('bank') || method.includes('card')) {
      const credit = accounts.find(a => a.type === 'credit')
      if (credit) return credit
      const bank = accounts.find(a => a.type === 'bank')
      if (bank) return bank
    }
  }

  if (type === 'income') {
    const bank = accounts.find(a => a.type === 'bank')
    if (bank) return bank
  }
  const wechat = accounts.find(a => a.type === 'wechat')
  if (wechat) return wechat
  const cash = accounts.find(a => a.type === 'cash')
  if (cash) return cash
  return accounts[0] || null
}

// ==================== Account Auto-Creation ====================

export interface AccountToCreate {
  name: string
  type: string
  cardNo: string
  bankName?: string
  balance: number
  uniqueId?: string
}

export function findMissingAccounts(
  extracted: ExtractedInfo,
  accounts: AccountItem[]
): AccountToCreate[] {
  const toCreate: AccountToCreate[] = []

  const checkAndAdd = (paymentMethod: string | undefined, cardLast4: string | null | undefined) => {
    if (!cardLast4 || cardLast4.length === 0) return
    const existing = accounts.find(
      a => a.cardNo && typeof a.cardNo === 'string' && a.cardNo.endsWith(cardLast4)
    )
    if (existing) return

    const alreadyQueued = toCreate.some(a => a.cardNo.endsWith(cardLast4!))
    if (alreadyQueued) return

    const method = (paymentMethod || '').toLowerCase()
    const isCredit = method.includes('信用卡') || method.includes('credit')
    const accountType = isCredit ? 'credit' : 'bank'
    const typeLabel = isCredit ? '信用卡' : '储蓄卡'

    let bankFullName: string | undefined
    const bankMatch = paymentMethod?.match(/([\u4e00-\u9fa5]+银行)/)
    if (bankMatch) bankFullName = bankMatch[1]

    const bankShortName = bankFullName
      ? (bankFullName === '中国银行' ? '中国银行' : bankFullName.replace(/^中国/, ''))
      : undefined

    let bankMinimalName: string | undefined
    if (bankShortName) {
      if (bankShortName === '中国银行') {
        bankMinimalName = '中行'
      } else {
        bankMinimalName = bankShortName.replace(/银行$/, '')
      }
    }

    const name = bankMinimalName
      ? `${bankMinimalName} ${cardLast4}`
      : `${typeLabel} ${cardLast4}`

    const uniqueId = bankMinimalName
      ? `${bankMinimalName}${cardLast4}`
      : `${typeLabel}${cardLast4}`

    toCreate.push({
      name,
      type: accountType,
      cardNo: cardLast4,
      bankName: bankFullName,
      balance: 0,
      uniqueId,
    })
  }

  checkAndAdd(extracted.paymentMethod, extracted.cardLast4)
  if (extracted.type === 'transfer') {
    checkAndAdd(extracted.targetPaymentMethod, extracted.targetCardLast4)
  }

  return toCreate
}

// ==================== Main Orchestrator ====================

export async function analyzeAccounting(options: {
  text?: string
  imageBase64?: string
  accounts: AccountItem[]
  categories: CategoryItem[]
}): Promise<RecordInput> {
  let extracted: ExtractedInfo

  if (options.text) {
    extracted = await extractFromText(options.text, options.accounts, options.categories)
  } else if (options.imageBase64) {
    extracted = await extractFromImage(options.imageBase64, options.accounts, options.categories)
  } else {
    throw new Error('请提供文本或图片输入')
  }

  const { amount, type, description, date, time, paymentMethod, cardLast4, transferType, targetPaymentMethod, targetCardLast4 } = extracted

  let categoryId: number | undefined
  if (extracted.categoryId != null) {
    const found = options.categories.find(c => c.id === extracted.categoryId && c.type === type)
    if (found) categoryId = extracted.categoryId
  }
  if (categoryId === undefined) {
    const storeMatch = matchStoreMapping(description)
    if (storeMatch !== null) categoryId = storeMatch
  }
  if (categoryId === undefined) {
    const aiMatch = await aiMatchCategory(description, type, options.categories)
    if (aiMatch !== null) categoryId = aiMatch
  }

  let accountId: number | undefined
  if (extracted.accountId != null) {
    const found = options.accounts.find(a => a.id === extracted.accountId)
    if (found) accountId = extracted.accountId
  }
  if (accountId === undefined) {
    const account = matchAccount(paymentMethod, cardLast4, options.accounts, type)
    accountId = account?.id
  }

  let targetAccountId: number | undefined
  if (type === 'transfer') {
    if (extracted.targetAccountId != null) {
      const found = options.accounts.find(a => a.id === extracted.targetAccountId)
      if (found) targetAccountId = extracted.targetAccountId
    }
    if (targetAccountId === undefined) {
      const targetAccount = matchAccount(targetPaymentMethod, targetCardLast4, options.accounts, 'expense')
      targetAccountId = targetAccount?.id
    }
  }

  let title: string
  if (type === 'transfer') {
    const sourceAccount = options.accounts.find(a => a.id === accountId)
    const targetAccount = options.accounts.find(a => a.id === targetAccountId)
    const sourceLabel = sourceAccount ? sourceAccount.name : (paymentMethod || '未知账户')
    const targetLabel = targetAccount ? targetAccount.name : (targetPaymentMethod || '未知账户')
    if (transferType === 'recharge') {
      title = `充值-${sourceLabel}→${targetLabel}`
    } else if (transferType === 'withdraw') {
      title = `提现-${sourceLabel}→${targetLabel}`
    } else {
      title = `转账-${sourceLabel}→${targetLabel}`
    }
  } else {
    title = description
  }

  return {
    amount,
    type,
    categoryId,
    accountId,
    targetAccountId,
    date,
    time,
    title,
    note: description,
    transferType,
    paymentMethod,
    cardLast4,
    targetPaymentMethod,
    targetCardLast4
  }
}

// ==================== Smart Visualization ====================

export interface VisualizationData {
  records: { date: string; type: string; amount: number; categoryId: number; accountId: number; note?: string; title?: string }[]
  accounts: { id: number; name: string; type: string; balance: number }[]
  categories: { id: number; name: string; type: string; icon?: string; color?: string }[]
}

function aggregateForVisualization(data: VisualizationData) {
  const dailyIncome = new Map<string, number>()
  const dailyExpense = new Map<string, number>()
  const categoryExpense = new Map<string, { amount: number; icon?: string; color?: string }>()
  const categoryIncome = new Map<string, { amount: number; icon?: string; color?: string }>()
  const accountExpense = new Map<string, number>()

  const monthlyCategoryExpense = new Map<string, Map<string, { amount: number; icon?: string; color?: string }>>()
  const monthlyCategoryIncome = new Map<string, Map<string, { amount: number; icon?: string; color?: string }>>()
  const monthlyAccountExpense = new Map<string, Map<string, number>>()
  const monthlyIncome = new Map<string, number>()
  const monthlyExpense = new Map<string, number>()
  const monthlyIncomeCount = new Map<string, number>()
  const monthlyExpenseCount = new Map<string, number>()
  const dailyExpenseCount = new Map<string, number>()
  const dailyIncomeCount = new Map<string, number>()

  const getMonthKey = (date: string) => date.substring(0, 7)

  data.records.forEach(r => {
    const cat = data.categories.find(c => c.id === r.categoryId)
    const acc = data.accounts.find(a => a.id === r.accountId)
    const catName = cat?.name || '其他'
    const accName = acc?.name || '其他'
    const monthKey = getMonthKey(r.date)

    if (r.type === 'income') {
      dailyIncome.set(r.date, (dailyIncome.get(r.date) || 0) + r.amount)
      dailyIncomeCount.set(r.date, (dailyIncomeCount.get(r.date) || 0) + 1)
      categoryIncome.set(catName, { amount: (categoryIncome.get(catName)?.amount || 0) + r.amount, icon: cat?.icon, color: cat?.color })
      monthlyIncome.set(monthKey, (monthlyIncome.get(monthKey) || 0) + r.amount)
      monthlyIncomeCount.set(monthKey, (monthlyIncomeCount.get(monthKey) || 0) + 1)
      if (!monthlyCategoryIncome.has(monthKey)) monthlyCategoryIncome.set(monthKey, new Map())
      const mci = monthlyCategoryIncome.get(monthKey)!
      mci.set(catName, { amount: (mci.get(catName)?.amount || 0) + r.amount, icon: cat?.icon, color: cat?.color })
    } else if (r.type === 'expense') {
      dailyExpense.set(r.date, (dailyExpense.get(r.date) || 0) + r.amount)
      dailyExpenseCount.set(r.date, (dailyExpenseCount.get(r.date) || 0) + 1)
      categoryExpense.set(catName, { amount: (categoryExpense.get(catName)?.amount || 0) + r.amount, icon: cat?.icon, color: cat?.color })
      accountExpense.set(accName, (accountExpense.get(accName) || 0) + r.amount)
      monthlyExpense.set(monthKey, (monthlyExpense.get(monthKey) || 0) + r.amount)
      monthlyExpenseCount.set(monthKey, (monthlyExpenseCount.get(monthKey) || 0) + 1)
      if (!monthlyCategoryExpense.has(monthKey)) monthlyCategoryExpense.set(monthKey, new Map())
      const mce = monthlyCategoryExpense.get(monthKey)!
      mce.set(catName, { amount: (mce.get(catName)?.amount || 0) + r.amount, icon: cat?.icon, color: cat?.color })
      if (!monthlyAccountExpense.has(monthKey)) monthlyAccountExpense.set(monthKey, new Map())
      const mae = monthlyAccountExpense.get(monthKey)!
      mae.set(accName, (mae.get(accName) || 0) + r.amount)
    }
  })

  const dates = [...new Set(data.records.map(r => r.date))].sort()
  const daily = dates.map(d => ({
    date: d,
    income: Math.round((dailyIncome.get(d) || 0) * 100) / 100,
    expense: Math.round((dailyExpense.get(d) || 0) * 100) / 100,
    incomeCount: dailyIncomeCount.get(d) || 0,
    expenseCount: dailyExpenseCount.get(d) || 0
  }))

  const totalIncome = data.records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = data.records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)

  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

  const buildMonthlyCategories = (monthlyMap: Map<string, Map<string, { amount: number; icon?: string; color?: string }>>) => {
    const result: Record<string, Record<string, { amount: number; icon?: string; color?: string }>> = {}
    monthlyMap.forEach((catMap, month) => {
      result[month] = Object.fromEntries(
        [...catMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => [k, { ...v, amount: Math.round(v.amount * 100) / 100 }])
      )
    })
    return result
  }

  const buildMonthlyAccounts = (monthlyMap: Map<string, Map<string, number>>) => {
    const result: Record<string, Record<string, number>> = {}
    monthlyMap.forEach((accMap, month) => {
      result[month] = Object.fromEntries(
        [...accMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v * 100) / 100])
      )
    })
    return result
  }

  const monthlySummary: Record<string, { income: number; expense: number; balance: number; incomeCount: number; expenseCount: number }> = {}
  const allMonths = [...new Set(data.records.map(r => getMonthKey(r.date)))].sort()
  allMonths.forEach(m => {
    monthlySummary[m] = {
      income: Math.round((monthlyIncome.get(m) || 0) * 100) / 100,
      expense: Math.round((monthlyExpense.get(m) || 0) * 100) / 100,
      balance: Math.round(((monthlyIncome.get(m) || 0) - (monthlyExpense.get(m) || 0)) * 100) / 100,
      incomeCount: monthlyIncomeCount.get(m) || 0,
      expenseCount: monthlyExpenseCount.get(m) || 0
    }
  })

  return {
    thisMonth: thisMonthKey,
    lastMonth: lastMonthKey,
    summary: {
      totalRecords: data.records.length,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      balance: Math.round((totalIncome - totalExpense) * 100) / 100
    },
    monthlySummary,
    daily,
    expenseByCategory: Object.fromEntries(
      [...categoryExpense.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => [k, { ...v, amount: Math.round(v.amount * 100) / 100 }])
    ),
    incomeByCategory: Object.fromEntries(
      [...categoryIncome.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => [k, { ...v, amount: Math.round(v.amount * 100) / 100 }])
    ),
    expenseByAccount: Object.fromEntries(
      [...accountExpense.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    monthlyExpenseByCategory: buildMonthlyCategories(monthlyCategoryExpense),
    monthlyIncomeByCategory: buildMonthlyCategories(monthlyCategoryIncome),
    monthlyExpenseByAccount: buildMonthlyAccounts(monthlyAccountExpense),
    accounts: data.accounts.map(a => ({ name: a.name, type: a.type, balance: Math.round(a.balance * 100) / 100 }))
  }
}

export interface VizSeries {
  dataKey: string
  name: string
  color: string
  type?: 'bar' | 'line'
  unit?: 'yuan' | 'count'
  icon?: string
}

export interface VizConfig {
  title: string
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'composed'
  data: Record<string, any>[]
  xKey?: string
  series?: VizSeries[]
  rightSeries?: VizSeries[]
  layout?: 'horizontal' | 'vertical'
  stack?: boolean
}

const DEFAULT_COLORS = ['#667eea', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911', '#f5222d']

function generateVizLocally(query: string, agg: ReturnType<typeof aggregateForVisualization>): VizConfig {
  const q = query.toLowerCase()
  const isLastMonth = q.includes('上月') || q.includes('上个月') || q.includes('上个')
  const isThisMonth = q.includes('本月') || q.includes('这个月')
  const isIncome = q.includes('收入')
  const isAccount = q.includes('账户') || q.includes('账号')
  const isTrend = q.includes('趋势') || q.includes('变化') || q.includes('走势') || q.includes('对比')
  const isPie = q.includes('占比') || q.includes('比例') || q.includes('分布')
  const isCount = q.includes('数量') || q.includes('次数') || q.includes('笔数') || q.includes('条数')
  const isMonthly = q.includes('各月') || q.includes('每月') || q.includes('月度') || q.includes('月份') || q.includes('几个月')
  const isBalance = q.includes('结余') || q.includes('余额') || q.includes('攒下') || q.includes('存下')
  const isCompare = q.includes('对比') || q.includes('比较') || q.includes('同比') || q.includes('环比')
  const isCategoryTrend = q.includes('类别趋势') || q.includes('分类趋势') || q.includes('各类别月') || q.includes('各分类月')
  const isExpense = q.includes('支出') || q.includes('消费') || q.includes('花费') || q.includes('开销')

  const monthKey = isLastMonth ? agg.lastMonth : agg.thisMonth
  const monthLabel = isLastMonth ? '上月' : isThisMonth ? '本月' : ''

  if (isMonthly && !isPie) {
    const months = Object.keys(agg.monthlySummary).sort()
    if (months.length === 0) {
      return { title: '暂无月度数据', chartType: 'bar', data: [{ name: '暂无数据', amount: 0 }], xKey: 'name', series: [{ dataKey: 'amount', name: '金额', color: '#667eea' }] }
    }

    if (isCategoryTrend) {
      const topCategories = Object.entries(agg.expenseByCategory)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 5)
        .map(([name, info]) => ({ name, color: info.color, icon: info.icon }))
      if (topCategories.length === 0) {
        return { title: '暂无类别数据', chartType: 'bar', data: [{ name: '暂无数据', amount: 0 }], xKey: 'name', series: [{ dataKey: 'amount', name: '金额', color: '#667eea' }] }
      }
      const fallbackColors = ['#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96']
      return {
        title: '各类别月度支出趋势',
        chartType: 'bar',
        data: months.map(m => {
          const row: Record<string, any> = { month: m }
          topCategories.forEach(cat => {
            const monthCats = agg.monthlyExpenseByCategory[m]
            row[cat.name] = monthCats && monthCats[cat.name] ? monthCats[cat.name].amount : 0
          })
          return row
        }),
        xKey: 'month',
        series: topCategories.map((cat, i) => ({
          dataKey: cat.name, name: cat.name, color: cat.color || fallbackColors[i % fallbackColors.length], icon: cat.icon
        })),
        stack: true
      }
    }

    if (isBalance || (isCompare && !isCount)) {
      return {
        title: '各月收支及结余',
        chartType: 'composed',
        data: months.map(m => ({
          month: m,
          income: agg.monthlySummary[m].income,
          expense: agg.monthlySummary[m].expense,
          balance: agg.monthlySummary[m].balance,
        })),
        xKey: 'month',
        series: [
          { dataKey: 'income', name: '收入金额', color: '#52c41a', type: 'bar', unit: 'yuan' },
          { dataKey: 'expense', name: '支出金额', color: '#ff4d4f', type: 'bar', unit: 'yuan' },
        ],
        rightSeries: [
          { dataKey: 'balance', name: '结余', color: '#667eea', type: 'line', unit: 'yuan' },
        ]
      }
    }

    if (isCount || q.includes('金额') || q.includes('总额') || q.includes('总金额')) {
      return {
        title: '各月消费金额及数量',
        chartType: 'composed',
        data: months.map(m => ({
          month: m,
          expense: agg.monthlySummary[m].expense,
          income: agg.monthlySummary[m].income,
          expenseCount: agg.monthlySummary[m].expenseCount,
          incomeCount: agg.monthlySummary[m].incomeCount,
        })),
        xKey: 'month',
        series: [
          { dataKey: 'expense', name: '支出金额', color: '#ff4d4f', type: 'bar', unit: 'yuan' },
          { dataKey: 'income', name: '收入金额', color: '#52c41a', type: 'bar', unit: 'yuan' },
        ],
        rightSeries: [
          { dataKey: 'expenseCount', name: '支出笔数', color: '#faad14', type: 'line', unit: 'count' },
          { dataKey: 'incomeCount', name: '收入笔数', color: '#13c2c2', type: 'line', unit: 'count' },
        ]
      }
    }

    if (isIncome) {
      return {
        title: '各月收入趋势',
        chartType: 'bar',
        data: months.map(m => ({ month: m, income: agg.monthlySummary[m].income })),
        xKey: 'month',
        series: [{ dataKey: 'income', name: '收入金额', color: '#52c41a' }]
      }
    }

    if (isExpense && isCompare) {
      return {
        title: '各月支出对比',
        chartType: 'composed',
        data: months.map(m => ({
          month: m,
          expense: agg.monthlySummary[m].expense,
          expenseCount: agg.monthlySummary[m].expenseCount,
        })),
        xKey: 'month',
        series: [
          { dataKey: 'expense', name: '支出金额', color: '#ff4d4f', type: 'bar', unit: 'yuan' },
        ],
        rightSeries: [
          { dataKey: 'expenseCount', name: '支出笔数', color: '#faad14', type: 'line', unit: 'count' },
        ]
      }
    }

    return {
      title: '各月收支对比',
      chartType: 'bar',
      data: months.map(m => ({
        month: m,
        expense: agg.monthlySummary[m].expense,
        income: agg.monthlySummary[m].income,
      })),
      xKey: 'month',
      series: [
        { dataKey: 'expense', name: '支出', color: '#ff4d4f' },
        { dataKey: 'income', name: '收入', color: '#52c41a' },
      ]
    }
  }

  if (isTrend || (!isPie && !isAccount && !isMonthly && (q.includes('最近') || q.includes('天') || q.includes('周')))) {
    const days = parseInt(q.match(/最近(\d+)/)?.[1] || '7')
    const recentDaily = agg.daily.slice(-days)
    if (isCount) {
      return {
        title: `最近${days}天消费金额及数量`,
        chartType: 'composed',
        data: recentDaily.map(d => ({
          date: d.date.substring(5),
          expense: d.expense,
          income: d.income,
          expenseCount: d.expenseCount,
          incomeCount: d.incomeCount,
        })),
        xKey: 'date',
        series: [
          { dataKey: 'expense', name: '支出金额', color: '#ff4d4f', type: 'bar', unit: 'yuan' },
          { dataKey: 'income', name: '收入金额', color: '#52c41a', type: 'bar', unit: 'yuan' },
        ],
        rightSeries: [
          { dataKey: 'expenseCount', name: '支出笔数', color: '#faad14', type: 'line', unit: 'count' },
          { dataKey: 'incomeCount', name: '收入笔数', color: '#13c2c2', type: 'line', unit: 'count' },
        ]
      }
    }
    if (isBalance) {
      let runningBalance = 0
      return {
        title: `最近${days}天收支及结余`,
        chartType: 'composed',
        data: recentDaily.map(d => {
          runningBalance += d.income - d.expense
          return {
            date: d.date.substring(5),
            income: d.income,
            expense: d.expense,
            balance: Math.round(runningBalance * 100) / 100,
          }
        }),
        xKey: 'date',
        series: [
          { dataKey: 'income', name: '收入', color: '#52c41a', type: 'bar', unit: 'yuan' },
          { dataKey: 'expense', name: '支出', color: '#ff4d4f', type: 'bar', unit: 'yuan' },
        ],
        rightSeries: [
          { dataKey: 'balance', name: '累计结余', color: '#667eea', type: 'line', unit: 'yuan' },
        ]
      }
    }
    return {
      title: `最近${days}天收支趋势`,
      chartType: 'area',
      data: recentDaily.map(d => ({ date: d.date.substring(5), income: d.income, expense: d.expense })),
      xKey: 'date',
      series: [
        { dataKey: 'income', name: '收入', color: '#52c41a' },
        { dataKey: 'expense', name: '支出', color: '#ff4d4f' }
      ]
    }
  }

  if (isAccount) {
    const source = isLastMonth || isThisMonth
      ? agg.monthlyExpenseByAccount[monthKey] || {}
      : agg.expenseByAccount
    const entries = Object.entries(source)
    if (entries.length === 0) {
      return { title: `${monthLabel}各账户支出`, chartType: 'bar', data: [{ name: '暂无数据', amount: 0 }], xKey: 'name', series: [{ dataKey: 'amount', name: '金额', color: '#667eea' }] }
    }
    return {
      title: `${monthLabel}各账户支出`,
      chartType: 'bar',
      data: entries.map(([name, amount]) => ({ name, amount })),
      xKey: 'name',
      series: [{ dataKey: 'amount', name: '支出金额', color: '#667eea' }],
      layout: 'horizontal'
    }
  }

  if (isPie || (!isTrend && !isAccount && !isMonthly)) {
    const source = isIncome
      ? (isLastMonth || isThisMonth ? agg.monthlyIncomeByCategory[monthKey] || {} : agg.incomeByCategory)
      : (isLastMonth || isThisMonth ? agg.monthlyExpenseByCategory[monthKey] || {} : agg.expenseByCategory)
    const entries = Object.entries(source) as [string, { amount: number; icon?: string; color?: string }][]
    if (entries.length === 0) {
      return { title: `${monthLabel}${isIncome ? '收入' : '支出'}类别占比`, chartType: 'pie', data: [{ name: '暂无数据', value: 0, color: '#667eea' }] }
    }
    return {
      title: `${monthLabel}${isIncome ? '收入' : '支出'}类别占比`,
      chartType: 'pie',
      data: entries.map(([name, info], i) => ({
        name,
        value: info.amount,
        color: info.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        icon: info.icon
      }))
    }
  }

  return {
    title: '支出类别占比',
    chartType: 'pie',
    data: Object.entries(agg.expenseByCategory).map(([name, info], i) => ({
      name,
      value: info.amount,
      color: info.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      icon: info.icon
    }))
  }
}

export async function generateVisualization(userQuery: string, data: VisualizationData, isDark: boolean): Promise<VizConfig> {
  const apiKey = getApiKey()
  const agg = aggregateForVisualization(data)

  if (!apiKey) {
    console.log('[Viz] No API key, using local rule-based generation')
    return generateVizLocally(userQuery, agg)
  }
  const dataSummary = JSON.stringify(agg)

  console.log('[Viz] Aggregated data size:', dataSummary.length, 'chars')

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const categoryNames = Object.keys(agg.expenseByCategory)
  const incomeCategoryNames = Object.keys(agg.incomeByCategory)
  const accountNames = Object.keys(agg.expenseByAccount)
  const dateRange = agg.daily.length > 0 ? `${agg.daily[0].date} ~ ${agg.daily[agg.daily.length - 1].date}` : '无数据'

  const systemPrompt = `你是数据可视化配置生成器。根据用户需求和提供的统计数据，生成图表配置 JSON。

当前日期：${todayStr}
本月标识：${agg.thisMonth}
上月标识：${agg.lastMonth}
数据时间范围：${dateRange}
可用支出类别：${categoryNames.join('、')}
可用收入类别：${incomeCategoryNames.join('、')}
可用账户：${accountNames.join('、')}

【关键】数据结构说明：
- expenseByCategory / incomeByCategory / expenseByAccount = 全部时间的汇总
- monthlyExpenseByCategory / monthlyIncomeByCategory / monthlyExpenseByAccount = 按月拆分的汇总，key为月份标识如"${agg.thisMonth}"
- monthlySummary = 每月收支汇总（含 income/expense/balance/incomeCount/expenseCount）
- daily = 每日收支明细（含 income/expense/incomeCount/expenseCount）
- 当用户指定"本月"时，必须使用 monthlyExpenseByCategory["${agg.thisMonth}"] 等带月份key的数据
- 当用户指定"上月"时，必须使用 monthlyExpenseByCategory["${agg.lastMonth}"] 等带月份key的数据
- 当用户未指定时间范围时，使用 expenseByCategory 等全量汇总数据
- 当用户要求同时展示金额和数量/笔数时，使用 composed 图表类型

需求识别规则：
- "本月" = 使用月份标识"${agg.thisMonth}"的数据
- "上月/上个月" = 使用月份标识"${agg.lastMonth}"的数据
- "最近N天" = 从daily数据中筛选最近N天
- "各月/每月/月度" = 使用monthlySummary数据，按月展示
- "各类别/分类" = 按支出类别分组
- "各账户" = 按账户分组
- "收支趋势/变化" = 按日期展示收入和支出变化
- "对比/比较" = 使用柱状图或分组柱状图
- "占比/比例/分布" = 使用饼图
- "趋势/变化/走势" = 使用折线图或面积图
- "金额+数量/笔数/次数" = 使用composed复合图表（柱状+折线，双Y轴）
- "结余/余额/攒下/存下" = 使用composed图表，左Y轴收支柱状+右Y轴结余折线
- "类别趋势/分类趋势" = 使用堆叠柱状图，展示各类别按月变化
- "支出对比+笔数" = 使用composed图表，左Y轴支出柱状+右Y轴笔数折线
- 用户提到特定类别（如"餐饮"、"交通"），只展示该类别的数据

规则：
1. 输出纯 JSON，不要 markdown 代码块标记
2. 根据需求选择最合适的图表类型
3. 直接使用提供的数据，不要编造
4. 颜色使用现代配色
5. 仔细分析用户需求中的时间范围和类别筛选条件
6. 如果用户指定了特定类别，只从数据中提取该类别
7. 标题要简洁明确，反映用户需求（包含时间范围）
8. 【最重要】必须根据用户指定的时间范围，从正确的月份数据中取值！本月用"${agg.thisMonth}"，上月用"${agg.lastMonth}"

支持的图表类型和对应格式：

柱状图(bar)：
{"title":"标题","chartType":"bar","data":[{"name":"餐饮","amount":500}],"xKey":"name","series":[{"dataKey":"amount","name":"金额","color":"#667eea"}],"layout":"horizontal","stack":false}

折线图(line)：
{"title":"标题","chartType":"line","data":[{"date":"05-01","income":100,"expense":80}],"xKey":"date","series":[{"dataKey":"income","name":"收入","color":"#52c41a"},{"dataKey":"expense","name":"支出","color":"#ff4d4f"}]}

面积图(area)：格式同折线图，chartType改为"area"

饼图(pie)：
{"title":"标题","chartType":"pie","data":[{"name":"餐饮","value":500,"color":"#ff4d4f"},{"name":"交通","value":200,"color":"#faad14"}]}

复合图(composed)：柱状+折线组合，双Y轴。series为左Y轴（柱状），rightSeries为右Y轴（折线）
{"title":"各月消费金额及数量","chartType":"composed","data":[{"month":"2026-03","expense":3000,"expenseCount":15},{"month":"2026-04","expense":2500,"expenseCount":12}],"xKey":"month","series":[{"dataKey":"expense","name":"支出金额","color":"#ff4d4f","type":"bar"}],"rightSeries":[{"dataKey":"expenseCount","name":"支出笔数","color":"#faad14","type":"line"}]}

复合图-收支结余：左Y轴收支柱状+右Y轴结余折线
{"title":"各月收支及结余","chartType":"composed","data":[{"month":"2026-03","income":5000,"expense":3000,"balance":2000}],"xKey":"month","series":[{"dataKey":"income","name":"收入","color":"#52c41a","type":"bar"},{"dataKey":"expense","name":"支出","color":"#ff4d4f","type":"bar"}],"rightSeries":[{"dataKey":"balance","name":"结余","color":"#667eea","type":"line"}]}

堆叠柱状图：各类别按月趋势，stack为true
{"title":"各类别月度支出趋势","chartType":"bar","data":[{"month":"2026-03","餐饮":1500,"交通":500},{"month":"2026-04","餐饮":1200,"交通":600}],"xKey":"month","series":[{"dataKey":"餐饮","name":"餐饮","color":"#ff4d4f"},{"dataKey":"交通","name":"交通","color":"#faad14"}],"stack":true}

配色：${isDark ? '深色背景(#1a1a2e)，使用明亮鲜艳的颜色' : '浅色背景(#fff)，使用饱和适中的颜色'}
推荐颜色：#667eea #52c41a #ff4d4f #faad14 #13c2c2 #722ed1 #eb2f96 #fa8c16 #2f54eb #a0d911`

  const messages: ZhipuMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `统计数据：\n${dataSummary}\n\n需求：${userQuery}` }
  ]

  const url = `${ZHIPU_BASE_URL}${ZHIPU_ENDPOINT}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages,
        temperature: 0.2,
        max_tokens: 4096
      }),
      signal: controller.signal
    })
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error('请求超时，请重试')
    throw new Error('API_ERROR')
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('[Viz] API error:', response.status, errText)
    throw new Error('API_ERROR')
  }

  const result = await response.json()
  let content = result?.choices?.[0]?.message?.content || ''

  if (!content) {
    console.error('[Viz] Empty response:', JSON.stringify(result))
    throw new Error('AI 返回了空内容，请重试')
  }

  content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

  let config: VizConfig
  try {
    config = JSON.parse(content)
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        config = JSON.parse(jsonMatch[0])
      } catch {
        console.error('[Viz] JSON parse failed, raw:', content.substring(0, 500))
        throw new Error('AI 返回的配置格式有误，请重试')
      }
    } else {
      console.error('[Viz] No JSON found in response:', content.substring(0, 500))
      throw new Error('AI 返回的配置格式有误，请重试')
    }
  }

  if (!config.chartType || !['bar', 'line', 'area', 'pie', 'composed'].includes(config.chartType)) {
    config.chartType = 'bar'
  }
  if (!config.data || !Array.isArray(config.data) || config.data.length === 0) {
    throw new Error('AI 生成的图表数据为空，请重试')
  }
  if (!config.title) {
    config.title = userQuery.substring(0, 20)
  }
  if (config.chartType !== 'pie') {
    if (!config.xKey) config.xKey = Object.keys(config.data[0])[0]
    if (!config.series || !Array.isArray(config.series) || config.series.length === 0) {
      const keys = Object.keys(config.data[0]).filter(k => typeof config.data[0][k] === 'number')
      const defaultColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16']
      config.series = keys.map((k, i) => ({ dataKey: k, name: k, color: defaultColors[i % defaultColors.length] }))
    }
    const inferUnit = (s: any): 'yuan' | 'count' => {
      if (s.unit === 'count' || s.unit === 'yuan') return s.unit
      const name = (s.name || s.dataKey || '').toLowerCase()
      if (name.includes('笔数') || name.includes('数量') || name.includes('次数') || name.includes('count')) return 'count'
      return 'yuan'
    }
    config.series = config.series.map((s: any) => ({ ...s, unit: inferUnit(s) }))
    if (config.rightSeries && Array.isArray(config.rightSeries)) {
      config.rightSeries = config.rightSeries.map((s: any) => ({ ...s, unit: inferUnit(s) }))
    }
  } else {
    const defaultColors = ['#667eea', '#52c41a', '#ff4d4f', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911']
    config.data = config.data.map((item: any, i: number) => ({
      ...item,
      color: item.color || defaultColors[i % defaultColors.length]
    }))
  }

  console.log('[Viz] Parsed config:', config.chartType, 'data points:', config.data.length, 'series:', config.series?.length)
  return config
}
