# 智能记账 — 设计文档

日期：2026-05-16 | 状态：已确认

## 概述

调用智谱免费模型 API，实现文本记账、截图记账、拍照识别和语音记账四个 AI 功能。不同输入类型使用不同模型，分两步完成：先提取核心记账信息，再匹配类别/账户后写入。

## 架构

```
UI 层:  Dashboard AI面板  +  Records 弹窗 AI Tab
              ↓
Service 层:  src/renderer/services/ai.ts
              ├─ analyzeText(text) → 提取记账信息 → 匹配分类/账户 → 写入
              ├─ analyzeImage(base64) → GLM-4V-Flash 识别 → 提取记账信息 → 匹配 → 写入
              └─ transcribeVoice() → Web Speech API → analyzeText()
              ↓
API 层:  智谱 (open.bigmodel.cn)
          ├─ GLM-4-Flash     → 文本解析（免费）
          ├─ GLM-4V-Flash    → 图片识别（免费）
          └─ Web Speech API  → 浏览器语音识别（无需API Key）
              ↓
存储层:  mockApi.addRecord() → localStorage
```

## 模型选择

| 记账方式 | 模型 | 说明 |
|---------|------|------|
| 文本记账 | GLM-4-Flash | 免费文本模型，解析自然语言描述 |
| 截图记账 | GLM-4V-Flash | 免费视觉模型，识别账单截图中的金额/商户/日期 |
| 拍照识别 | GLM-4V-Flash | 同截图，摄像头实时拍摄后上传识别 |
| 语音记账 | Web Speech API → GLM-4-Flash | 浏览器语音转文字 → 文本模型解析 |

## 功能入口

| 入口 | Dashboard | Records 弹窗 AI Tab |
|------|:---:|:---:|
| 文本记账 | ✅ | ✅ |
| 截图记账 | ✅ | ✅ |
| 拍照识别 | ✅ | ✅ |
| 语音记账 | ✅ | ❌ |

## 两步处理流程

### 第一步：提取核心记账信息

AI 从输入中提取结构化数据，**不直接指定最终类别**，而是输出：

```json
{
  "amount": 30.00,
  "type": "expense",
  "description": "午餐 - 公司楼下食堂",
  "date": "2026-05-16",
  "paymentMethod": "现金"
}
```

- 文本模式：prompt 要求 GLM-4-Flash 返回上述 JSON
- 图片模式：prompt 要求 GLM-4V-Flash 识别图片中的金额、商户名、日期，返回同样 JSON
- 语音模式：Web Speech API 转文字后再走文本流程

### 第二步：匹配类别和账户

AI Service 拿到第一步的结果后，在本地执行匹配：

1. **类别识别**：
   - 根据 `description` + `type` 在现有分类中做语义匹配
   - 匹配策略：按关键词包含匹配（如「午餐」→「餐饮」，「公交」→「交通出行」，「工资」→「工资收入」）
   - 预设关键词映射表 + 模糊回退（description 包含分类名即可）
   - 匹配不到 → 使用默认分类（支出→「其他支出」，收入→「其他收入」）

2. **账户识别**：
   - 根据 `paymentMethod` 匹配现有账户（「现金」→现金账户，「微信」→微信，「支付宝」→支付宝）
   - 匹配不到 → 使用当前账本默认账户
   - 收入默认记入第一个资产类账户

3. **写入记录**：

```typescript
const record = {
  amount: extracted.amount,
  type: extracted.type,
  categoryId: matchedCategory.id,
  accountId: matchedAccount.id,
  date: extracted.date,
  note: extracted.description
}
mockApi.addRecord(record)
```

## 模块设计

### 1. AI Service — `src/renderer/services/ai.ts`（新建）

```typescript
// 核心方法
analyzeAccounting(input: { text?: string; imageBase64?: string }): Promise<RecordInput>
  ├─ step1_extract(text?, imageBase64?)  → { amount, type, description, date, paymentMethod }
  ├─ step2_matchCategory(description, type) → categoryId
  ├─ step3_matchAccount(paymentMethod, type) → accountId
  └─ return { amount, type, categoryId, accountId, date, description }
```

- API Key 从 localStorage `zhipu_api_key` 读取
- 文本调用 `open.bigmodel.cn/api/paas/v4/chat/completions`（model: GLM-4-Flash）
- 图片调用同样 endpoint（model: GLM-4V-Flash），图片以 base64 内嵌在 content 中

### 2. AI 记账弹窗 — `src/renderer/components/AIRecordModal.tsx`（新建）

四种模式共用同一弹窗，通过 props.mode 切换：

- **文本模式**：textarea + 发送按钮，底部提示「例如：今天午餐花了30元现金」
- **截图模式**：拖拽/粘贴图片区域 + 文件选择按钮，上传后预览
- **拍照模式**：`navigator.mediaDevices.getUserMedia` 打开摄像头，实时预览 + 拍照按钮
- **语音模式**：Web Speech API SpeechRecognition，录音按钮（仅 Chrome/Edge 支持）

交互流程：
```
用户输入 → loading「AI 正在识别…」→ 第一步提取成功
  → loading「正在分类匹配…」→ 第二步匹配完成 → 写入记录
  → notification: "AI记账: ¥XX · 类别 - 账户 [撤销]"
  → 点击撤销 → deleteRecord(id)
```

### 3. Dashboard AI 面板 — 改造 `Dashboard.tsx`

- 「快速记账」卡片替换为展开区域：4 个按钮横向排列（文本/截图/拍照/语音）
- 每个按钮带图标和简短标签
- 移动端适配：2x2 网格排列

### 4. Records 弹窗 AI Tab — 改造 `Records.tsx`

- 「记一笔」弹窗增加 Tab：「手动记账」|「AI 记账」
- AI 记账 Tab 内嵌文本输入框和截图/拍照按钮
- 不含语音入口

### 5. Settings AI 配置 — 改造 `Settings.tsx`

新增「AI 设置」卡片：
- 智谱 API Key 输入框（密码型，有「显示/隐藏」切换）
- 获取 Key 引导链接：`https://open.bigmodel.cn`
- 模型展示：GLM-4-Flash / GLM-4V-Flash（免费标签）

## 撤销机制

- AI 记账成功后 notification duration 设为 5 秒
- 通知内显示记账详情 +「撤销」按钮
- 撤销 → `mockApi.deleteRecord(id)` → 刷新列表和账户余额

## 错误处理

| 错误场景 | 提示信息 |
|---------|---------|
| 网络错误 | 「网络连接失败，请检查网络后重试」 |
| API Key 未配置 | 「请先在设置页配置智谱 API Key」 |
| API Key 无效（401/403） | 「API Key 无效，请前往设置页重新配置」 |
| API 返回格式异常 | 「AI 解析失败，请重试」 |
| 语音识别不支持 | 「当前浏览器不支持语音识别，请使用 Chrome 或 Edge」 |
| 摄像头权限拒绝 | 「无法访问摄像头，请检查权限设置」 |
| 图片过大（>10MB） | 「图片过大，请压缩后重试」 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/services/ai.ts` | **新建** — 两步提取+匹配，多模型调度 |
| `src/renderer/components/AIRecordModal.tsx` | **新建** — 多模式 AI 记账弹窗 |
| `src/renderer/pages/Dashboard.tsx` | 改造 — 快速记账→4入口按钮 |
| `src/renderer/pages/Records.tsx` | 改造 — 弹窗增加 AI Tab |
| `src/renderer/pages/Settings.tsx` | 改造 — 新增 AI 设置卡片 |
| `src/renderer/store/slices/recordsSlice.ts` | 微调 — 撤销逻辑 |
