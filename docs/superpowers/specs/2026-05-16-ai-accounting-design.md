# 智能记账 — 设计文档

日期：2026-05-16 | 状态：已确认

## 概述

调用智谱 GLM-4-Flash 免费模型 API，实现文本记账、截图记账、拍照识别和语音记账四个 AI 功能。用户输入自然语言描述或图片后，AI 自动解析并直接写入记账记录。

## 架构

```
UI 层:  Dashboard AI面板  +  Records 弹窗 AI Tab
              ↓
Service 层:  src/renderer/services/ai.ts
              ├─ analyzeText(text) → RecordData
              ├─ analyzeImage(base64) → RecordData
              └─ 内部匹配分类/账户
              ↓
API 层:  智谱 GLM-4-Flash (open.bigmodel.cn)
          ├─ chat/completions (文本解析)
          └─ chat/completions + vision (图片识别)
              ↓
存储层:  mockApi.addRecord() → localStorage
```

## 功能入口

| 入口 | Dashboard | Records 弹窗 AI Tab |
|------|:---:|:---:|
| 文本记账 | ✅ | ✅ |
| 截图记账 | ✅ | ✅ |
| 拍照识别 | ✅ | ✅ |
| 语音记账 | ✅ | ❌ |

## 模块设计

### 1. AI Service — `src/renderer/services/ai.ts`（新建）

核心方法：
- `analyzeAccounting(input: { text?: string; imageBase64?: string })` — 调用智谱 API，返回结构化记账数据
- 使用 GLM-4-Flash Function Calling，强制模型返回 JSON：`{ amount, type, categoryName, accountName, date, note }`
- 内部匹配：返回的 categoryName/accountName 与现有数据做模糊匹配（包含匹配即可），匹配不到用默认值
- API Key 从 localStorage `zhipu_api_key` 读取

### 2. AI 记账弹窗 — `src/renderer/components/AIRecordModal.tsx`（新建）

四种模式共用同一弹窗，通过 props.mode 切换：

- **文本模式**：textarea + 发送按钮，底部提示「例如：今天午餐花了30元现金」
- **截图模式**：拖拽/粘贴图片区域 + 文件选择按钮，上传后预览
- **拍照模式**：`navigator.mediaDevices.getUserMedia` 打开摄像头，实时预览 + 拍照按钮
- **语音模式**：Web Speech API SpeechRecognition，录音按钮（仅 Chrome/Edge 支持）

交互流程：
```
用户输入 → loading 状态 → AI 解析成功 → 直接写入记账
                                    → notification: "AI记账: ¥XX 类别 - 账户 [撤销]"
                                    → 点击撤销 → deleteRecord(id)
          → AI 解析失败 → notification.error 显示错误信息
```

### 3. Dashboard AI 面板 — 改造 `Dashboard.tsx`

- 「快速记账」卡片替换为展开区域：4 个按钮横向排列（文本/截图/拍照/语音）
- 点击任一按钮 → 弹出 AIRecordModal
- 移动端适配：2x2 网格排列

### 4. Records 弹窗 AI Tab — 改造 `Records.tsx`

- 「记一笔」弹窗增加 Tab：「手动记账」|「AI 记账」
- AI 记账 Tab 内嵌文本输入框和截图/拍照按钮
- 不包含语音（语音在 Records 场景不常用）

### 5. Settings AI 配置 — 改造 `Settings.tsx`

新增「AI 设置」卡片：
- 智谱 API Key 输入框（密码型，有「显示/隐藏」切换）
- 获取 Key 引导链接：`https://open.bigmodel.cn`
- 模型选择（默认 GLM-4-Flash，预留其他选项）

## 数据流

```
用户输入(文本/图片/语音)
  → AIRecordModal: 显示 loading
  → ai.ts analyzeAccounting():
      1. 构造 prompt（文本模式直接发，图片模式 base64 内嵌）
      2. fetch POST → open.bigmodel.cn/api/paas/v4/chat/completions
      3. 解析 JSON 响应 → { amount, type, categoryName, accountName, date, note }
      4. 模糊匹配 categoryName → mockCategories.find()
      5. 模糊匹配 accountName → mockAccounts.find()
      6. 返回 RecordInput
  → mockApi.addRecord(recordInput)
  → dispatch(fetchRecords()) + dispatch(fetchAccounts()) 刷新
  → notification.success + 撤销按钮
```

## 撤销机制

- AI 记账成功后显示 notification，duration 延长到 5 秒
- 通知内包含「撤销」按钮（用 notification 的 btn 属性）
- 撤销调用 `mockApi.deleteRecord(id)` 并刷新数据

## 错误处理

- 网络错误 → 「网络连接失败，请检查网络后重试」
- API Key 无效 → 「API Key 无效，请前往设置页配置」
- API 返回格式异常 → 「AI 解析失败：{原始错误}」
- 语音识别不支持 → 「当前浏览器不支持语音识别，请使用 Chrome 或 Edge」
- 摄像头权限拒绝 → 「无法访问摄像头，请检查权限设置」

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/services/ai.ts` | **新建** — AI Service 核心逻辑 |
| `src/renderer/components/AIRecordModal.tsx` | **新建** — 多模式 AI 记账弹窗 |
| `src/renderer/pages/Dashboard.tsx` | 改造 — 快速记账→4入口按钮 |
| `src/renderer/pages/Records.tsx` | 改造 — 弹窗增加 AI Tab |
| `src/renderer/pages/Settings.tsx` | 改造 — 新增 AI 设置卡片 |
| `src/renderer/store/slices/recordsSlice.ts` | 微调 — 撤销逻辑 |
