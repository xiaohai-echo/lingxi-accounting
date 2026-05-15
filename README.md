# 消费记账 — 智能桌面/移动记账应用

基于 Electron + React + TypeScript 构建，支持 AI 图片识别、飞书云同步和多平台运行（Windows / macOS / Linux / Android）。

> **AI 开发声明**  
> 本项目 **90% 的代码由 [TraeSolo](https://www.trae.ai/) AI 编程助手自动生成**，包括初始架构搭建、页面组件、状态管理、数据层、测试用例及多平台适配。  
> 最后的完善工作（数据库 Schema 统一、密码哈希安全、代码分割优化、Android 适配、文档完善）由 **Claude Code** 完成。  
> 项目体现了 AI 辅助开发的完整工作流：AI 负责批量代码生成与重构，人工（通过 Claude Code）负责架构审查、安全加固和最终质量把关。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **UI 组件**: Ant Design 5
- **状态管理**: Redux Toolkit
- **桌面框架**: Electron
- **移动端**: Capacitor (Android)
- **数据库**: SQLite (better-sqlite3) / localStorage (Web 开发模式)
- **构建工具**: Vite
- **测试**: Vitest + jsdom

## 功能特性

### 已实现
- **收支记录管理** — 添加 / 编辑 / 删除，支持转账和退款
- **多账户管理** — 现金 / 银行卡 / 微信 / 支付宝 / 信用卡统一管理
- **多账本支持** — 日常账本、旅行基金等多场景独立记账，支持账本合并
- **分类管理** — 预设 12 种支出 + 6 种收入分类，支持自定义
- **预算管理** — 月度 / 季度 / 年度预算，超支红色标记和进度条
- **数据统计图表** — 收支趋势 / 分类饼图+柱图 / 账户分布
- **退款管理** — 全额 / 部分退款 + 退货运费处理
- **数据导入导出** — JSON 完整备份 / CSV 表格导出
- **深色/浅色模式** — 自动检测系统主题偏好
- **响应式布局** — 桌面侧边栏 / 移动端底部 Tab 自动切换
- **用户系统** — 注册 / 登录，密码 SHA-256 加盐哈希存储
- **操作日志** — 完整记录增删改操作历史

### 规划中
- AI OCR 智能识别（本地 PaddleOCR + 云端混合方案）
- 飞书多维表格双向同步
- 系统通知（超支提醒等）
- 应用自动更新

## 项目结构

```
.
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── main.ts            # 主进程入口
│   │   ├── preload.ts         # 预加载脚本（contextBridge）
│   │   ├── database/          # SQLite 数据库模块
│   │   │   ├── index.ts       # 初始化 + 全部 CRUD（ledgers/users/logs/records/accounts/categories/budgets）
│   │   │   └── schema.ts      # TypeScript 类型定义
│   │   └── ipc/               # IPC 通信处理（全部 handler 注册）
│   │       └── index.ts
│   ├── renderer/              # React 渲染进程
│   │   ├── main.tsx           # React 入口
│   │   ├── App.tsx            # 主组件（路由/布局/代码分割/Suspense）
│   │   ├── index.html         # HTML 模板
│   │   ├── index.css          # 全局样式
│   │   ├── pages/             # 页面组件（9 个）
│   │   │   ├── Login.tsx      # 登录/注册（品牌展示 + 核心特色）
│   │   │   ├── Dashboard.tsx  # 首页仪表盘（趋势图/饼图/柱图）
│   │   │   ├── Records.tsx    # 记账记录（筛选/搜索/退款）
│   │   │   ├── Accounts.tsx   # 账户管理（转账/提现/充值）
│   │   │   ├── Categories.tsx # 分类管理
│   │   │   ├── Budgets.tsx    # 预算管理
│   │   │   ├── Settings.tsx   # 个人设置（头像/昵称/密码/数据管理）
│   │   │   ├── LedgerManage.tsx # 账本管理（创建/合并/删除）
│   │   │   └── Logs.tsx       # 操作日志
│   │   ├── store/             # Redux 状态管理
│   │   │   ├── index.ts       # Store 配置
│   │   │   └── slices/        # 7 个 Slice（records/accounts/categories/budgets/ledgers/logs/user）
│   │   ├── api/
│   │   │   └── mock.ts        # Mock API（localStorage 数据层，800+ 行）
│   │   ├── utils/
│   │   │   └── constants.ts   # 公共常量（账户类型/图标/颜色映射）
│   │   └── assets/            # 静态资源（logo 等）
│   └── __tests__/             # 单元测试
│       └── mock-api.test.ts   # Mock API 测试（14 个用例全部通过）
├── android/                   # Capacitor Android 项目（自动生成）
│   └── app/src/main/          # Android 原生配置
├── docs/
│   ├── specs/                 # 需求说明书
│   └── design/                # 系统设计文档
├── package.json
├── tsconfig.json / tsconfig.main.json
├── vite.config.ts / vitest.config.ts
├── electron-builder.yml       # Electron 打包配置
├── capacitor.config.ts        # Capacitor 移动端配置
└── .gitignore
```

## 快速开始

### 安装

```bash
npm install
```

### Web 开发模式

```bash
npm run dev:vite
# 浏览器访问 http://localhost:5173
# 演示账号: demo / demo123
```

### Electron 桌面端开发

```bash
npm run dev
```

### 运行测试

```bash
npm test              # 运行 14 个单元测试
npm run test:watch    # 监听模式
npm run typecheck     # TypeScript 类型检查
```

### 构建

```bash
npm run build:vite     # Web 应用 → dist/renderer/
npm run build          # Electron 桌面端
npm run build:android  # Android APK（需 Android Studio）
npm run open:android   # 在 Android Studio 中打开项目
```

## 多平台支持

| 平台 | 技术方案 | 构建产物 |
|------|---------|---------|
| Windows | Electron + NSIS | .exe 安装包 |
| macOS | Electron + DMG | .dmg |
| Linux | Electron + AppImage/deb | .AppImage / .deb |
| Android | Capacitor + WebView | .apk |

> Android 构建需安装 Android Studio。首次 `npm run build:android` 后 `npm run open:android`，在 Android Studio 中 Build → Build APK。

## 使用指南

| 功能 | 操作入口 |
|------|---------|
| 快速记账 | Dashboard 卡片 / 记录页「记一笔」 |
| 账户转账 | 账户页 → 卡片底部「转账」按钮 |
| 账户提现 | 账户页顶部「提现」按钮 |
| 消费退款 | 记录列表 → 退款按钮（仅支出记录） |
| 账本切换 | 顶部 Header 下拉选择 |
| 账本合并 | 账本管理页 → 合并到目标账本 |
| 导入导出 | 设置页 → 数据管理 |
| 切换主题 | 顶部 Header 太阳/月亮图标 |

## 更新日志

### v1.1.0 (2026-05-15) — Claude Code 完善

- **数据层统一**：主进程 SQLite Schema 与 Mock API 完全对齐（ledgers/users/logs 表，refund/transfer 字段）
- **预置分类扩展**：从 18 个增至 30 个（20 支出 + 10 收入），覆盖日常生活全场景
- **数据管理面板**：数据统计概览、自动备份（按用户隔离）、手动备份与历史恢复、选择性导出、数据校验与余额修复
- **操作日志全覆盖**：CRUD、登录/登出、导入导出、备份恢复全部记录，含操作者、分类名、账户名、银行卡尾号
- **密码安全**：SHA-256 + 盐值哈希存储，演示账户密码已哈希
- **数据隔离**：多用户数据按 userId 完全隔离，备份历史按用户独立
- **新建用户数据干净**：账户余额为 0，无消费记录，仅含 30 个预设分类和默认账本
- **清除数据保留预设**：清除操作保留 30 个预设分类和默认账本
- **恢复演示数据**：仅演示账户可见，一键恢复初始演示数据
- **转账手续费记录**：手续费自动生成支出记录，在筛选支出中可见
- **账户按账本过滤**：账户列表按当前账本显示，切换账本不混淆
- **分类图标选择器**：40 个预设 emoji + 自定义输入
- **保存防抖**：50ms 防抖合并连续写入，避免重复存储
- **操作后自动刷新**：转账/提现/充值/退款后账户余额和记录立即更新
- **导出文件名含账号**：`记账数据_demo_2026-05-15.json`
- **日志详情**：转账日志含来源/目标账户和银行卡尾号
- **数据库修复**：categories 表补充 created_at/updated_at、synced_at 同步修复
- **打包脚本**：双击 `pack-exe.bat` / `pack-apk.bat` 一键出包

### v1.0.0 (2026-05-14) — TraeSolo 初始生成

- Electron + React + TypeScript 架构搭建
- 记账记录 CRUD、多账户管理、分类管理、预算管理
- 数据统计图表（趋势/饼图/柱图）、深色/浅色模式
- 用户注册/登录、数据导入导出（JSON/CSV）
- 退款管理、账本管理、操作日志
- Android Capacitor 适配

## 设计文档

- [需求说明书](./docs/specs/2026-05-12-需求说明书.md)
- [系统设计文档](./docs/design/2026-05-12-系统设计文档.md)

## License

MIT

