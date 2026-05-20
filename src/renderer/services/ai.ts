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

export async function transcribeVoice(audioBase64: string, _mimeType?: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API_KEY_MISSING')

  let base64Data = audioBase64
  if (audioBase64.startsWith('data:')) {
    const commaIdx = audioBase64.indexOf(',')
    if (commaIdx !== -1) base64Data = audioBase64.substring(commaIdx + 1)
  }

  const formData = new FormData()
  formData.append('model', 'glm-asr-2512')
  formData.append('file_base64', base64Data)
  formData.append('stream', 'false')

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
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
