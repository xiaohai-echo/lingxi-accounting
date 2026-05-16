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
              └─ analyzeVoice(audioBase64) → GLM-4-Voice 转文字 → analyzeText()
              ↓
API 层:  智谱 (open.bigmodel.cn)
          ├─ GLM-4-Flash     → 文本解析（免费）
          ├─ GLM-4V-Flash    → 图片识别（免费）
          └─ GLM-4-Voice     → 语音转文字（免费）
              ↓
存储层:  mockApi.addRecord() → localStorage
```

## 模型选择

| 记账方式 | 模型 | 说明 |
|---------|------|------|
| 文本记账 | GLM-4-Flash | 免费文本模型，解析自然语言描述 |
| 截图记账 | GLM-4V-Flash | 免费视觉模型，识别账单截图中的金额/商户/日期 |
| 拍照识别 | GLM-4V-Flash | 同截图，摄像头实时拍摄后上传识别 |
| 语音记账 | GLM-4-Voice → GLM-4-Flash | 语音模型转文字 → 文本模型解析 |

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
  "paymentMethod": "现金",
  "cardLast4": null
}
```

- `cardLast4`：银行卡消费/转账/提现时，识别卡号后四位（如「招商5678」→ `"5678"`），无则为 null

- 文本模式：prompt 要求 GLM-4-Flash 返回上述 JSON
- 图片模式：prompt 要求 GLM-4V-Flash 识别图片中的金额、商户名、日期、银行卡尾号，返回同样 JSON
- 语音模式：GLM-4-Voice 将录音 base64 转文字后再走文本流程

### 第二步：匹配类别和账户

#### 2a. 自定义店铺映射（优先）

用户可在设置页维护店铺→类别的固定映射表，存储于 localStorage：

```json
// store_mappings_{userId}
[
  { "storeName": "星巴克", "categoryId": 5 },
  { "storeName": "滴滴出行", "categoryId": 2 },
  { "storeName": "美团外卖", "categoryId": 5 }
]
```

第一步提取的 `description` 中如包含映射表里的店铺名 → 直接采用对应分类，跳过 AI 匹配。

#### 2b. AI 分类匹配

自定义映射未命中时，调用 **GLM-4-Flash** 进行语义匹配：

- 输入：第一步提取的 `{ description, type }` + 当前账本全部分类列表 `[{ name, type }]`
- Prompt 要求模型从给定分类中选择最合适的，返回分类名
- 模型只需要从已有选项中「选择」，不「发明」新分类

```
系统: 你是记账分类助手。根据消费描述，从给定分类列表中选择最合适的分类。
      只返回分类名，不要解释。

用户: 消费描述：「午餐 公司楼下食堂」 类型：expense
      可选分类：[餐饮, 交通出行, 购物消费, 居家生活, 医疗健康, 教育培训, 人情往来, 其他支出]
```

#### 2c. 账户识别

匹配优先级：

1. **卡号尾号精确匹配**：如果 `cardLast4` 不为 null，在账户列表中查找 `cardNo` 结尾匹配的银行卡账户。精确匹配到唯一账户后直接使用，跳过后续步骤。

2. **支付方式模糊匹配**：根据 `paymentMethod` 匹配账户名（「现金」→现金账户，「微信」→微信，「支付宝」→支付宝）

3. **默认回退**：匹配不到 → 当前账本默认账户；收入 → 第一个资产类账户

```
示例：「用招商5678消费了200元买书」
  → cardLast4: "5678"
  → 账户匹配：遍历账户，cardNo 以 "5678" 结尾 → 招商银行(****5678)
  → 精准命中 ✅
```

#### 2d. 写入记录

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
  ├─ step1_extract(text?, imageBase64?) → { amount, type, description, date, paymentMethod, cardLast4 }
  ├─ step2_matchStoreMapping(description) → categoryId | null (查自定义映射)
  ├─ step3_aiMatchCategory(description, type, categories[]) → categoryId
  └─ step4_matchAccount(paymentMethod, cardLast4, accounts[], type) → accountId
  └─ return { amount, type, categoryId, accountId, date, description }
```

- API Key 从 localStorage `zhipu_api_key` 读取
- 文本/分类匹配 → GLM-4-Flash
- 图片识别 → GLM-4V-Flash
- 语音转文字 → GLM-4-Voice

### 2. AI 记账弹窗 — `src/renderer/components/AIRecordModal.tsx`（新建）

四种模式共用同一弹窗，通过 props.mode 切换：

- **文本模式**：textarea + 发送按钮，底部提示「例如：今天午餐花了30元现金」
- **截图模式**：拖拽/粘贴图片区域 + 文件选择按钮，上传后预览
- **拍照模式**：`navigator.mediaDevices.getUserMedia` 打开摄像头，实时预览 + 拍照按钮
- **语音模式**：MediaRecorder 录音 → base64 → GLM-4-Voice 转文字 → GLM-4-Flash 解析

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
- 模型展示：GLM-4-Flash / GLM-4V-Flash / GLM-4-Voice（免费标签）
- **店铺→类别映射表**：列表展示已有映射，可添加/删除
  - 添加：下拉选店铺名（手动输入）+ 下拉选分类 → 保存
  - 删除：点击 ❌ 移除映射
  - 数据存储在 localStorage `store_mappings_{userId}`

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
| 麦克风权限拒绝 | 「无法访问麦克风，请检查权限设置」 |
| 语音识别失败 | 「语音识别失败，请重试」 |
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
