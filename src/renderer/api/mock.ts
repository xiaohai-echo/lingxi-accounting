import type { Record, Account, Category, Budget, Ledger, User, Log } from '../../main/database/schema'

const PW_SALT = 'expense-tracker-salt-v1'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(PW_SALT + password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const PRESET_EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', color: '#FF6B6B' },
  { name: '交通', icon: '🚗', color: '#4ECDC4' },
  { name: '购物', icon: '🛒', color: '#45B7D1' },
  { name: '娱乐', icon: '🎮', color: '#96CEB4' },
  { name: '居住', icon: '🏠', color: '#F39C12' },
  { name: '医疗', icon: '🏥', color: '#E74C3C' },
  { name: '教育', icon: '📚', color: '#DDA0DD' },
  { name: '通讯', icon: '📱', color: '#1ABC9C' },
  { name: '服饰', icon: '👗', color: '#E91E63' },
  { name: '日用', icon: '🧴', color: '#795548' },
  { name: '人情', icon: '🎁', color: '#FF9800' },
  { name: '水电燃气', icon: '⚡', color: '#FFD700' },
  { name: '数码电子', icon: '💻', color: '#3498DB' },
  { name: '运动健身', icon: '🏃', color: '#2ECC71' },
  { name: '美容美发', icon: '💇', color: '#FF69B4' },
  { name: '宠物', icon: '🐱', color: '#FFA07A' },
  { name: '旅行', icon: '✈️', color: '#00BCD4' },
  { name: '烟酒', icon: '🍺', color: '#A0522D' },
  { name: '办公', icon: '📎', color: '#607D8B' },
  { name: '其他支出', icon: '📦', color: '#9E9E9E' }
]

const PRESET_INCOME_CATEGORIES = [
  { name: '工资', icon: '💰', color: '#2ECC71' },
  { name: '奖金', icon: '🎉', color: '#F39C12' },
  { name: '投资', icon: '📈', color: '#3498DB' },
  { name: '兼职', icon: '💼', color: '#9B59B6' },
  { name: '理财', icon: '🏦', color: '#1ABC9C' },
  { name: '红包', icon: '🧧', color: '#FF4500' },
  { name: '报销', icon: '📋', color: '#8BC34A' },
  { name: '租金', icon: '🔑', color: '#FF9800' },
  { name: '退款', icon: '↩️', color: '#00BCD4' },
  { name: '其他收入', icon: '📥', color: '#7F8C8D' }
]

const PRESET_ACCOUNTS = [
  { name: '现金', type: 'cash', color: '#FFD93D', balance: 0, uniqueId: 'cash:现金' },
  { name: '储蓄卡', type: 'bank', color: '#6BCB77', balance: 0, uniqueId: 'bank:储蓄卡', bankName: '', cardNo: '' },
  { name: '信用卡', type: 'credit', color: '#FF6B6B', balance: 0, uniqueId: 'credit:信用卡', bankName: '', cardNo: '' },
  { name: '微信', type: 'wechat', color: '#07C160', balance: 0, uniqueId: 'wechat:微信', holderName: '' },
  { name: '支付宝', type: 'alipay', color: '#1677FF', balance: 0, uniqueId: 'alipay:支付宝', holderName: '' }
]

// Demo account balances (set after records are applied)
function applyDemoAccountBalances() {
  const demoConfig: { [key: string]: { balance: number; bankName?: string; cardNo?: string; holderName?: string } } = {
    '现金':   { balance: 500 },
    '储蓄卡': { balance: 50000, bankName: '中国工商银行', cardNo: '8888' },
    '信用卡': { balance: 0,     bankName: '招商银行',     cardNo: '6666' },
    '微信':   { balance: 2000,  holderName: '张三' },
    '支付宝': { balance: 3000,  holderName: '张三' }
  }
  const ledger2Config: { [key: string]: number } = { '现金': 200, '储蓄卡': 3000, '微信': 1500, '支付宝': 500 }
  for (const acc of mockAccounts) {
    const cfg = demoConfig[acc.name]
    if (cfg && acc.ledgerId === 1) {
      acc.balance = cfg.balance
      if (cfg.bankName) acc.bankName = cfg.bankName
      if (cfg.cardNo) acc.cardNo = cfg.cardNo
      if (cfg.holderName) acc.holderName = cfg.holderName
      acc.uniqueId = cfg.bankName ? `${cfg.bankName.replace(/银行$/, '').replace(/^中国/, '')}尾号${cfg.cardNo}` : acc.uniqueId
    }
    if (acc.ledgerId === 2 && ledger2Config[acc.name]) {
      acc.balance = ledger2Config[acc.name]
      if (acc.type === 'bank' || acc.type === 'credit') {
        acc.bankName = '中国建设银行'; acc.cardNo = '9999'
        acc.uniqueId = '建行尾号9999'
      }
      if (acc.type === 'wechat' || acc.type === 'alipay') {
        acc.holderName = '李四'
        const label = acc.type === 'wechat' ? '微信' : '支付宝'
        acc.uniqueId = label + '-李四'
      }
    }
  }
}

function initDemoRecords(): Record[] {
  const d = (offset: number) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - offset)
    return dt.toISOString().split('T')[0]
  }
  const ts = (offset: number, h = 8, m = 0) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - offset)
    dt.setHours(h, m, 0, 0)
    return dt.toISOString()
  }

  // Ledger 1 (日常账本): category 1-30, account 1-5

  return [
    // ======== 账本1: 日常账本 ========

    // --- 5月 (最近7天) ---
    { id: 1, amount: 18.50, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(0), note: '早餐', createdAt: ts(0,7,30), updatedAt: ts(0,7,30), isDeleted: 0 },
    { id: 2, amount: 35.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(0), note: '午餐-黄焖鸡', createdAt: ts(0,12,0), updatedAt: ts(0,12,0), isDeleted: 0 },
    { id: 3, amount: 6.00, type: 'expense', categoryId: 2, accountId: 4, ledgerId: 1, date: d(0), note: '地铁通勤', createdAt: ts(0,8,0), updatedAt: ts(0,8,0), isDeleted: 0 },
    { id: 4, amount: 28.00, type: 'expense', categoryId: 19, accountId: 5, ledgerId: 1, date: d(0), note: '打印纸+A4文件袋', createdAt: ts(0,14,0), updatedAt: ts(0,14,0), isDeleted: 0 },

    { id: 5, amount: 22.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(1), note: '午餐', createdAt: ts(1,12,0), updatedAt: ts(1,12,0), isDeleted: 0 },
    { id: 6, amount: 89.00, type: 'expense', categoryId: 10, accountId: 5, ledgerId: 1, date: d(1), note: '洗衣液+洗洁精', createdAt: ts(1,19,0), updatedAt: ts(1,19,0), isDeleted: 0 },
    { id: 7, amount: 15.00, type: 'expense', categoryId: 16, accountId: 5, ledgerId: 1, date: d(1), note: '猫罐头', createdAt: ts(1,18,0), updatedAt: ts(1,18,0), isDeleted: 0 },
    { id: 8, amount: 199.00, type: 'expense', categoryId: 7, accountId: 2, ledgerId: 1, date: d(1), note: '技术书籍 x2', createdAt: ts(1,15,0), updatedAt: ts(1,15,0), isDeleted: 0 },

    { id: 9, amount: 45.00, type: 'expense', categoryId: 1, accountId: 3, ledgerId: 1, date: d(2), note: '外卖-烧烤', createdAt: ts(2,20,0), updatedAt: ts(2,20,0), isDeleted: 0 },
    { id: 10, amount: 380.00, type: 'expense', categoryId: 9, accountId: 2, ledgerId: 1, date: d(2), note: '春装外套', createdAt: ts(2,14,0), updatedAt: ts(2,14,0), isDeleted: 0, refundStatus: 'full', refundAmount: 380.00, shippingFee: 0, refundNote: '尺码不合适退货', refundDate: d(1) },
    { id: 11, amount: 168.00, type: 'expense', categoryId: 17, accountId: 5, ledgerId: 1, date: d(2), note: '周边游门票', createdAt: ts(2,9,0), updatedAt: ts(2,9,0), isDeleted: 0 },

    { id: 12, amount: 28.00, type: 'expense', categoryId: 1, accountId: 1, ledgerId: 1, date: d(3), note: '午餐', createdAt: ts(3,12,0), updatedAt: ts(3,12,0), isDeleted: 0 },
    { id: 13, amount: 50.00, type: 'expense', categoryId: 8, accountId: 5, ledgerId: 1, date: d(3), note: '手机话费充值', createdAt: ts(3,10,0), updatedAt: ts(3,10,0), isDeleted: 0 },
    { id: 14, amount: 120.00, type: 'expense', categoryId: 5, accountId: 2, ledgerId: 1, date: d(3), note: '物业费', createdAt: ts(3,9,0), updatedAt: ts(3,9,0), isDeleted: 0 },

    { id: 15, amount: 15.00, type: 'expense', categoryId: 2, accountId: 1, ledgerId: 1, date: d(4), note: '共享单车月卡', createdAt: ts(4,8,0), updatedAt: ts(4,8,0), isDeleted: 0 },
    { id: 16, amount: 45.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(4), note: '聚餐AA', createdAt: ts(4,19,0), updatedAt: ts(4,19,0), isDeleted: 0 },
    { id: 17, amount: 88.00, type: 'expense', categoryId: 18, accountId: 1, ledgerId: 1, date: d(4), note: '啤酒+零食', createdAt: ts(4,21,0), updatedAt: ts(4,21,0), isDeleted: 0 },

    { id: 18, amount: 56.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(5), note: '晚餐-火锅', createdAt: ts(5,19,0), updatedAt: ts(5,19,0), isDeleted: 0 },
    { id: 19, amount: 32.00, type: 'expense', categoryId: 3, accountId: 5, ledgerId: 1, date: d(5), note: '网购数据线', createdAt: ts(5,14,0), updatedAt: ts(5,14,0), isDeleted: 0 },
    { id: 20, amount: 129.00, type: 'expense', categoryId: 6, accountId: 2, ledgerId: 1, date: d(5), note: '感冒药+体温计', createdAt: ts(5,11,0), updatedAt: ts(5,11,0), isDeleted: 0 },

    { id: 21, amount: 12000.00, type: 'income', categoryId: 21, accountId: 2, ledgerId: 1, date: d(3), note: '5月份工资', createdAt: ts(3,9,0), updatedAt: ts(3,9,0), isDeleted: 0 },
    { id: 22, amount: 2000.00, type: 'income', categoryId: 22, accountId: 2, ledgerId: 1, date: d(3), note: '季度绩效奖金', createdAt: ts(3,9,0), updatedAt: ts(3,9,0), isDeleted: 0 },

    // --- 4月 ---
    { id: 23, amount: 25.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(14), note: '早餐+午餐', createdAt: ts(14,12,0), updatedAt: ts(14,12,0), isDeleted: 0 },
    { id: 24, amount: 68.00, type: 'expense', categoryId: 4, accountId: 4, ledgerId: 1, date: d(12), note: '电影院-IMAX', createdAt: ts(12,20,0), updatedAt: ts(12,20,0), isDeleted: 0 },
    { id: 25, amount: 258.00, type: 'expense', categoryId: 13, accountId: 2, ledgerId: 1, date: d(10), note: '机械键盘', createdAt: ts(10,16,0), updatedAt: ts(10,16,0), isDeleted: 0 },
    { id: 26, amount: 35.00, type: 'expense', categoryId: 3, accountId: 5, ledgerId: 1, date: d(9), note: '手机壳+贴膜', createdAt: ts(9,15,0), updatedAt: ts(9,15,0), isDeleted: 0 },
    { id: 27, amount: 200.00, type: 'expense', categoryId: 12, accountId: 2, ledgerId: 1, date: d(8), note: '4月水电费', createdAt: ts(8,10,0), updatedAt: ts(8,10,0), isDeleted: 0 },
    { id: 28, amount: 300.00, type: 'expense', categoryId: 11, accountId: 4, ledgerId: 1, date: d(8), note: '朋友结婚红包', createdAt: ts(8,11,0), updatedAt: ts(8,11,0), isDeleted: 0 },
    { id: 29, amount: 1200.00, type: 'expense', categoryId: 5, accountId: 2, ledgerId: 1, date: d(5), note: '4月房租', createdAt: ts(5,9,0), updatedAt: ts(5,9,0), isDeleted: 0 },
    { id: 30, amount: 299.00, type: 'expense', categoryId: 14, accountId: 4, ledgerId: 1, date: d(3), note: '健身房月卡', createdAt: ts(3,17,0), updatedAt: ts(3,17,0), isDeleted: 0 },
    { id: 31, amount: 58.00, type: 'expense', categoryId: 15, accountId: 5, ledgerId: 1, date: d(2), note: '理发', createdAt: ts(2,14,0), updatedAt: ts(2,14,0), isDeleted: 0 },

    { id: 32, amount: 12000.00, type: 'income', categoryId: 21, accountId: 2, ledgerId: 1, date: d(12), note: '4月份工资', createdAt: ts(12,9,0), updatedAt: ts(12,9,0), isDeleted: 0 },
    { id: 33, amount: 500.00, type: 'income', categoryId: 28, accountId: 5, ledgerId: 1, date: d(7), note: '老同事还钱', createdAt: ts(7,20,0), updatedAt: ts(7,20,0), isDeleted: 0 },

    // --- 3月 ---
    { id: 34, amount: 32.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(30), note: '午餐-麻辣烫', createdAt: ts(30,12,0), updatedAt: ts(30,12,0), isDeleted: 0 },
    { id: 35, amount: 429.00, type: 'expense', categoryId: 9, accountId: 3, ledgerId: 1, date: d(28), note: '春装连衣裙', createdAt: ts(28,15,0), updatedAt: ts(28,15,0), isDeleted: 0, refundStatus: 'partial', refundAmount: 200.00, shippingFee: 10.00, refundNote: '质量有问题部分退款', refundDate: d(22) },
    { id: 36, amount: 189.00, type: 'expense', categoryId: 12, accountId: 2, ledgerId: 1, date: d(25), note: '3月燃气费', createdAt: ts(25,10,0), updatedAt: ts(25,10,0), isDeleted: 0 },
    { id: 37, amount: 88.00, type: 'expense', categoryId: 4, accountId: 5, ledgerId: 1, date: d(23), note: '游戏充值', createdAt: ts(23,21,0), updatedAt: ts(23,21,0), isDeleted: 0 },
    { id: 38, amount: 126.00, type: 'expense', categoryId: 6, accountId: 5, ledgerId: 1, date: d(20), note: '牙科挂号+检查', createdAt: ts(20,14,0), updatedAt: ts(20,14,0), isDeleted: 0 },
    { id: 39, amount: 1200.00, type: 'expense', categoryId: 5, accountId: 2, ledgerId: 1, date: d(18), note: '3月房租', createdAt: ts(18,9,0), updatedAt: ts(18,9,0), isDeleted: 0 },
    { id: 40, amount: 500.00, type: 'expense', categoryId: 7, accountId: 2, ledgerId: 1, date: d(15), note: '英语培训课程', createdAt: ts(15,19,0), updatedAt: ts(15,19,0), isDeleted: 0 },

    { id: 41, amount: 12000.00, type: 'income', categoryId: 21, accountId: 2, ledgerId: 1, date: d(30), note: '3月份工资', createdAt: ts(30,9,0), updatedAt: ts(30,9,0), isDeleted: 0 },
    { id: 42, amount: 350.00, type: 'income', categoryId: 25, accountId: 5, ledgerId: 1, date: d(22), note: '基金分红', createdAt: ts(22,10,0), updatedAt: ts(22,10,0), isDeleted: 0 },
    { id: 43, amount: 800.00, type: 'income', categoryId: 24, accountId: 4, ledgerId: 1, date: d(12), note: '周末兼职设计', createdAt: ts(12,18,0), updatedAt: ts(12,18,0), isDeleted: 0 },

    // --- 2月 ---
    { id: 44, amount: 56.00, type: 'expense', categoryId: 1, accountId: 4, ledgerId: 1, date: d(60), note: '年夜饭聚餐', createdAt: ts(60,19,0), updatedAt: ts(60,19,0), isDeleted: 0 },
    { id: 45, amount: 1200.00, type: 'expense', categoryId: 5, accountId: 2, ledgerId: 1, date: d(58), note: '2月房租', createdAt: ts(58,9,0), updatedAt: ts(58,9,0), isDeleted: 0 },
    { id: 46, amount: 888.00, type: 'expense', categoryId: 11, accountId: 1, ledgerId: 1, date: d(55), note: '过年红包 x3', createdAt: ts(55,10,0), updatedAt: ts(55,10,0), isDeleted: 0 },
    { id: 47, amount: 320.00, type: 'expense', categoryId: 9, accountId: 2, ledgerId: 1, date: d(52), note: '新年衣服', createdAt: ts(52,14,0), updatedAt: ts(52,14,0), isDeleted: 0 },
    { id: 48, amount: 260.00, type: 'expense', categoryId: 12, accountId: 2, ledgerId: 1, date: d(50), note: '2月电费', createdAt: ts(50,10,0), updatedAt: ts(50,10,0), isDeleted: 0 },
    { id: 49, amount: 680.00, type: 'expense', categoryId: 17, accountId: 2, ledgerId: 1, date: d(48), note: '春节短途旅行', createdAt: ts(48,8,0), updatedAt: ts(48,8,0), isDeleted: 0 },
    { id: 50, amount: 45.00, type: 'expense', categoryId: 2, accountId: 4, ledgerId: 1, date: d(47), note: '网约车', createdAt: ts(47,20,0), updatedAt: ts(47,20,0), isDeleted: 0 },

    { id: 51, amount: 12000.00, type: 'income', categoryId: 21, accountId: 2, ledgerId: 1, date: d(60), note: '2月份工资+年终', createdAt: ts(60,9,0), updatedAt: ts(60,9,0), isDeleted: 0 },
    { id: 52, amount: 15000.00, type: 'income', categoryId: 22, accountId: 2, ledgerId: 1, date: d(60), note: '年终奖', createdAt: ts(60,9,0), updatedAt: ts(60,9,0), isDeleted: 0 },
    { id: 53, amount: 666.00, type: 'income', categoryId: 26, accountId: 4, ledgerId: 1, date: d(55), note: '过年微信红包', createdAt: ts(55,8,0), updatedAt: ts(55,8,0), isDeleted: 0 },

    // --- 账本1转账 ---
    { id: 54, amount: 2000.00, type: 'transfer', categoryId: 0, accountId: 2, targetAccountId: 4, ledgerId: 1, date: d(3), note: '工资转到微信零花', createdAt: ts(3,14,0), updatedAt: ts(3,14,0), isDeleted: 0 },
    { id: 55, amount: 1000.00, type: 'transfer', categoryId: 0, accountId: 2, targetAccountId: 5, ledgerId: 1, date: d(2), note: '储蓄卡转支付宝', createdAt: ts(2,10,0), updatedAt: ts(2,10,0), isDeleted: 0 },
    { id: 56, amount: 500.00, type: 'transfer', categoryId: 0, accountId: 4, targetAccountId: 1, ledgerId: 1, date: d(1), note: '微信提现现金备用', createdAt: ts(1,16,0), updatedAt: ts(1,16,0), isDeleted: 0 },

    // ======== 账本2: 旅行基金 ========

    { id: 57, amount: 3000.00, type: 'income', categoryId: 51, accountId: 7, ledgerId: 2, date: d(20), note: '5月旅行基金存入', createdAt: ts(20,9,0), updatedAt: ts(20,9,0), isDeleted: 0 },
    { id: 58, amount: 2000.00, type: 'income', categoryId: 51, accountId: 7, ledgerId: 2, date: d(50), note: '4月旅行基金存入', createdAt: ts(50,9,0), updatedAt: ts(50,9,0), isDeleted: 0 },
    { id: 59, amount: 2000.00, type: 'income', categoryId: 51, accountId: 7, ledgerId: 2, date: d(80), note: '3月旅行基金存入', createdAt: ts(80,9,0), updatedAt: ts(80,9,0), isDeleted: 0 },

    { id: 60, amount: 1280.00, type: 'expense', categoryId: 47, accountId: 7, ledgerId: 2, date: d(15), note: '三亚往返机票', createdAt: ts(15,10,0), updatedAt: ts(15,10,0), isDeleted: 0 },
    { id: 61, amount: 650.00, type: 'expense', categoryId: 35, accountId: 7, ledgerId: 2, date: d(14), note: '海景酒店2晚', createdAt: ts(14,11,0), updatedAt: ts(14,11,0), isDeleted: 0 },
    { id: 62, amount: 280.00, type: 'expense', categoryId: 31, accountId: 6, ledgerId: 2, date: d(12), note: '海鲜大餐', createdAt: ts(12,19,0), updatedAt: ts(12,19,0), isDeleted: 0 },
    { id: 63, amount: 150.00, type: 'expense', categoryId: 47, accountId: 6, ledgerId: 2, date: d(12), note: '潜水体验', createdAt: ts(12,14,0), updatedAt: ts(12,14,0), isDeleted: 0 },
    { id: 64, amount: 65.00, type: 'expense', categoryId: 32, accountId: 6, ledgerId: 2, date: d(11), note: '租电动车', createdAt: ts(11,9,0), updatedAt: ts(11,9,0), isDeleted: 0 },
    { id: 65, amount: 180.00, type: 'expense', categoryId: 33, accountId: 6, ledgerId: 2, date: d(10), note: '特产手信', createdAt: ts(10,15,0), updatedAt: ts(10,15,0), isDeleted: 0 },
    { id: 66, amount: 100.00, type: 'expense', categoryId: 40, accountId: 6, ledgerId: 2, date: d(10), note: '防晒霜+泳衣', createdAt: ts(10,10,0), updatedAt: ts(10,10,0), isDeleted: 0 },

    { id: 67, amount: 800.00, type: 'transfer', categoryId: 0, accountId: 7, targetAccountId: 6, ledgerId: 2, date: d(13), note: '储蓄卡转微信支付', createdAt: ts(13,10,0), updatedAt: ts(13,10,0), isDeleted: 0 },
  ]
}

function initDemoBudgets(): Budget[] {
  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  return [
    { id: 1, categoryId: 1, ledgerId: 1, amount: 2000, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 2, categoryId: 3, ledgerId: 1, amount: 1500, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 3, categoryId: 5, ledgerId: 1, amount: 3000, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 4, categoryId: 2, ledgerId: 1, amount: 500, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 5, categoryId: 4, ledgerId: 1, amount: 800, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 6, categoryId: 1, ledgerId: 1, amount: 24000, period: 'yearly', year: y, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 7, categoryId: 47, ledgerId: 2, amount: 5000, period: 'monthly', year: y, month: m, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]
}

function buildPresetCategories(ledgerId: number, startId: number): { categories: Category[]; nextId: number } {
  let id = startId
  const categories: Category[] = []
  let sortOrder = 0

  PRESET_EXPENSE_CATEGORIES.forEach(c => {
    categories.push({ id, name: c.name, type: 'expense', icon: c.icon, color: c.color, ledgerId, isDefault: 1, sortOrder, isDeleted: 0 })
    id++; sortOrder++
  })

  PRESET_INCOME_CATEGORIES.forEach(c => {
    categories.push({ id, name: c.name, type: 'income', icon: c.icon, color: c.color, ledgerId, isDefault: 1, sortOrder, isDeleted: 0 })
    id++; sortOrder++
  })

  return { categories, nextId: id }
}

function buildPresetAccounts(ledgerId: number, startId: number): { accounts: Account[]; nextId: number } {
  let id = startId
  const now = new Date().toISOString()
  const accounts: Account[] = []

  PRESET_ACCOUNTS.forEach(a => {
    accounts.push({
      id, name: a.name, type: a.type, balance: a.balance, color: a.color, icon: '',
      ledgerId, uniqueId: a.uniqueId, bankName: a.bankName || '', cardNo: a.cardNo || '',
      holderName: a.holderName || '', remark: '', createdAt: now, updatedAt: now, isDeleted: 0
    })
    id++
  })

  return { accounts, nextId: id }
}

function buildDemoLedgers(): Ledger[] {
  return [
    { id: 1, name: '日常账本', icon: '📒', color: '#667eea', isDefault: 1, isDeleted: 0, createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' },
    { id: 2, name: '旅行基金', icon: '✈️', color: '#FF6B6B', isDefault: 0, isDeleted: 0, createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' }
  ]
}

function applyRecordToBalance(record: { amount: number; type: string; accountId: number; targetAccountId?: number }, reverse: boolean = false): void {
  const account = mockAccounts.find(a => a.id === record.accountId)
  if (!account) return
  const multiplier = reverse ? -1 : 1
  if (record.type === 'income') {
    account.balance += record.amount * multiplier
  } else if (record.type === 'transfer') {
    account.balance -= record.amount * multiplier
    const targetAccount = mockAccounts.find(a => a.id === record.targetAccountId)
    if (targetAccount) {
      targetAccount.balance += record.amount * multiplier
    }
  } else {
    account.balance -= record.amount * multiplier
  }
}

function initNewUserData(): void {
  const now = new Date().toISOString()
  const ledger: Ledger = { id: 1, name: '日常账本', icon: '📒', color: '#667eea', isDefault: 1, isDeleted: 0, createdAt: now, updatedAt: now }
  mockLedgers = [ledger]

  const { categories, nextId: catNextId } = buildPresetCategories(1, 1)
  mockCategories = categories

  const { accounts, nextId: accNextId } = buildPresetAccounts(1, 1)
  mockAccounts = accounts

  mockRecords = []
  mockBudgets = []

  nextIds = { record: 1, account: accNextId, category: catNextId, budget: 1, ledger: 2, log: 1 }
}

function initDemoUserData(): void {
  mockLedgers = buildDemoLedgers()

  const catResult1 = buildPresetCategories(1, 1)
  mockCategories = [...catResult1.categories]

  const catResult2 = buildPresetCategories(2, catResult1.nextId)
  mockCategories.push(...catResult2.categories)

  const accResult1 = buildPresetAccounts(1, 1)
  mockAccounts = [...accResult1.accounts]

  const accResult2 = buildPresetAccounts(2, accResult1.nextId)
  mockAccounts.push(...accResult2.accounts)

  mockRecords = initDemoRecords()
  mockBudgets = initDemoBudgets()

  // Apply initial demo balances first, then records adjust them
  applyDemoAccountBalances()

  mockRecords.forEach(r => { if (!r.isDeleted) applyRecordToBalance(r) })

  mockRecords.forEach(r => {
    if (!r.isDeleted && r.type === 'expense' && r.refundAmount) {
      const account = mockAccounts.find(a => a.id === r.accountId)
      if (account) {
        account.balance += r.refundAmount - (r.shippingFee || 0)
      }
    }
  })

  nextIds = { record: 68, account: accResult2.nextId, category: catResult2.nextId, budget: 8, ledger: 3, log: 1 }
}

let mockUsers: User[] = []
let nextUserId = 1

let mockLedgers: Ledger[] = []
let mockRecords: Record[] = []
let mockAccounts: Account[] = []
let mockCategories: Category[] = []
let mockBudgets: Budget[] = []
let mockLogs: Log[] = []
let nextIds = { record: 1, account: 1, category: 1, budget: 1, ledger: 1, log: 1 }

let currentUserId: number | null = null

const DEMO_HASHED_PASSWORD = '3dd10607a89a5079316fe173d99d474c5ff15eb67f3cc57e5b18a04b424791a0'

function createDemoUser() {
  const now = '2026-05-01T00:00:00.000Z'
  return {
    id: 1, username: 'demo',
    password: DEMO_HASHED_PASSWORD,
    avatar: '👤', nickname: '演示用户',
    createdAt: now, updatedAt: now
  }
}

function loadMockUsers(): void {
  try {
    const stored = localStorage.getItem('expense_users')
    if (stored) {
      const data = JSON.parse(stored)
      mockUsers = data.users || []
      nextUserId = data.nextId || 1
    } else {
      mockUsers = [createDemoUser()]
      nextUserId = 2
      saveMockUsers()
    }
  } catch {
    mockUsers = [createDemoUser()]
    nextUserId = 2
    saveMockUsers()
  }
}

function saveMockUsers(): void {
  try {
    localStorage.setItem('expense_users', JSON.stringify({ users: mockUsers, nextId: nextUserId }))
  } catch {}
}

let saveTimer: any = null
function saveCurrentUserData(): void {
  if (currentUserId === null) return
  // Debounce rapid saves — collapse multiple writes into one
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const key = `expense_data_${currentUserId}`
      localStorage.setItem(key, JSON.stringify({
        version: 6,
        ledgers: mockLedgers, records: mockRecords, accounts: mockAccounts,
        categories: mockCategories, budgets: mockBudgets, logs: mockLogs, nextIds
      }))
    } catch {}
  }, 50)
}


function loadOrInitUserData(userId: number): void {
  currentUserId = userId
  try {
    const key = `expense_data_${userId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      const data = JSON.parse(stored)
      const dataVersion = data.version || 0
      if (dataVersion < 6) {
        localStorage.removeItem(key)
        if (userId === 1) {
          initDemoUserData()
        } else {
          initNewUserData()
        }
        saveCurrentUserData()
        return
      }
      mockLedgers = data.ledgers || []
      mockRecords = data.records || []
      mockAccounts = data.accounts || []
      mockCategories = data.categories || []
      mockBudgets = data.budgets || []
      mockLogs = data.logs || []
      nextIds = data.nextIds || { record: 1, account: 1, category: 1, budget: 1, ledger: 1, log: 1 }
    } else {
      if (userId === 1) {
        initDemoUserData()
      } else {
        initNewUserData()
      }
      saveCurrentUserData()
    }
  } catch {}
}

function addPresetDataForLedger(ledgerId: number): void {
  const { categories, nextId: catNextId } = buildPresetCategories(ledgerId, nextIds.category)
  mockCategories.push(...categories)
  nextIds.category = catNextId

  const { accounts, nextId: accNextId } = buildPresetAccounts(ledgerId, nextIds.account)
  mockAccounts.push(...accounts)
  nextIds.account = accNextId
}

loadMockUsers()

const mockApi = {
  getLedgers: (): Promise<Ledger[]> =>
    Promise.resolve(mockLedgers.filter(l => !l.isDeleted)),

  addLedger: (ledger: Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> => {
    const id = nextIds.ledger++
    const now = new Date().toISOString()
    mockLedgers.push({ ...ledger, id, createdAt: now, updatedAt: now })
    addPresetDataForLedger(id)
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  updateLedger: (_id: number, ledger: Partial<Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    const idx = mockLedgers.findIndex(l => l.id === _id)
    if (idx !== -1) mockLedgers[idx] = { ...mockLedgers[idx], ...ledger }
    saveCurrentUserData()
    return Promise.resolve()
  },

  deleteLedger: (id: number): Promise<void> => {
    const idx = mockLedgers.findIndex(l => l.id === id)
    if (idx !== -1) mockLedgers[idx].isDeleted = 1
    saveCurrentUserData()
    return Promise.resolve()
  },

  getRecords: (ledgerId?: number): Promise<Record[]> => {
    let result = mockRecords.filter(r => !r.isDeleted)
    if (ledgerId !== undefined) result = result.filter(r => r.ledgerId === ledgerId)
    return Promise.resolve(result)
  },

  addRecord: (record: Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<number> => {
    const id = nextIds.record++
    const now = new Date().toISOString()
    mockRecords.push({ ...record, id, createdAt: record.createdAt || now, updatedAt: now })
    applyRecordToBalance(record)
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  updateRecord: (_id: number, record: Partial<Omit<Record, 'id' | 'updatedAt'> & { createdAt?: string }>): Promise<void> => {
    const oldRecord = mockRecords.find(r => r.id === _id)
    const idx = mockRecords.findIndex(r => r.id === _id)
    if (idx !== -1) mockRecords[idx] = { ...mockRecords[idx], ...record }
    if (oldRecord && !oldRecord.isDeleted) {
      applyRecordToBalance(oldRecord, true)
      if (oldRecord.type === 'expense' && oldRecord.refundAmount) {
        const account = mockAccounts.find(a => a.id === oldRecord.accountId)
        if (account) {
          account.balance -= (oldRecord.refundAmount - (oldRecord.shippingFee || 0))
        }
      }
    }
    if (mockRecords[idx] && !mockRecords[idx].isDeleted) {
      applyRecordToBalance(mockRecords[idx])
      if (mockRecords[idx].type === 'expense' && mockRecords[idx].refundAmount) {
        const account = mockAccounts.find(a => a.id === mockRecords[idx].accountId)
        if (account) {
          account.balance += (mockRecords[idx].refundAmount - (mockRecords[idx].shippingFee || 0))
        }
      }
    }
    saveCurrentUserData()
    return Promise.resolve()
  },

  deleteRecord: (id: number): Promise<void> => {
    const record = mockRecords.find(r => r.id === id)
    const idx = mockRecords.findIndex(r => r.id === id)
    if (idx !== -1) mockRecords[idx].isDeleted = 1
    if (record && !record.isDeleted) {
      applyRecordToBalance(record, true)
      if (record.type === 'expense' && record.refundAmount) {
        const account = mockAccounts.find(a => a.id === record.accountId)
        if (account) {
          account.balance -= (record.refundAmount - (record.shippingFee || 0))
        }
      }
    }
    saveCurrentUserData()
    return Promise.resolve()
  },

  getAccounts: (ledgerId?: number): Promise<Account[]> => {
    let result = mockAccounts.filter(a => !a.isDeleted)
    if (ledgerId !== undefined) result = result.filter(a => a.ledgerId === ledgerId)
    return Promise.resolve(result)
  },

  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> => {
    const id = nextIds.account++
    const now = new Date().toISOString()
    mockAccounts.push({ ...account, id, createdAt: now, updatedAt: now })
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  updateAccount: (_id: number, account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    const idx = mockAccounts.findIndex(a => a.id === _id)
    if (idx !== -1) mockAccounts[idx] = { ...mockAccounts[idx], ...account }
    saveCurrentUserData()
    return Promise.resolve()
  },

  deleteAccount: (id: number): Promise<void> => {
    const idx = mockAccounts.findIndex(a => a.id === id)
    if (idx !== -1) mockAccounts[idx].isDeleted = 1
    saveCurrentUserData()
    return Promise.resolve()
  },

  getCategories: (ledgerId?: number): Promise<Category[]> => {
    let result = mockCategories.filter(c => !c.isDeleted)
    if (ledgerId !== undefined) result = result.filter(c => c.ledgerId === ledgerId)
    return Promise.resolve(result)
  },

  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> => {
    const id = nextIds.category++
    mockCategories.push({ ...category, id })
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  updateCategory: (_id: number, category: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    const idx = mockCategories.findIndex(c => c.id === _id)
    if (idx !== -1) mockCategories[idx] = { ...mockCategories[idx], ...category }
    saveCurrentUserData()
    return Promise.resolve()
  },

  deleteCategory: (id: number): Promise<void> => {
    const idx = mockCategories.findIndex(c => c.id === id)
    if (idx !== -1) mockCategories[idx].isDeleted = 1
    saveCurrentUserData()
    return Promise.resolve()
  },

  getBudgets: (ledgerId?: number): Promise<Budget[]> => {
    let result = mockBudgets
    if (ledgerId !== undefined) result = result.filter(b => b.ledgerId === ledgerId)
    return Promise.resolve(result)
  },

  addBudget: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> => {
    const id = nextIds.budget++
    const now = new Date().toISOString()
    mockBudgets.push({ ...budget, id, createdAt: now, updatedAt: now })
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  updateBudget: (_id: number, budget: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> => {
    const idx = mockBudgets.findIndex(b => b.id === _id)
    if (idx !== -1) mockBudgets[idx] = { ...mockBudgets[idx], ...budget }
    saveCurrentUserData()
    return Promise.resolve()
  },

  deleteBudget: (id: number): Promise<void> => {
    mockBudgets = mockBudgets.filter(b => b.id !== id)
    saveCurrentUserData()
    return Promise.resolve()
  },

  exportData: (): Promise<string> => {
    const exportPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: '个人记账助手',
      data: {
        ledgers: mockLedgers, records: mockRecords, accounts: mockAccounts,
        categories: mockCategories, budgets: mockBudgets, nextIds
      }
    }
    return Promise.resolve(JSON.stringify(exportPayload, null, 2))
  },

  exportCSV: (): Promise<string> => {
    const ledgerMap = new Map(mockLedgers.map(l => [l.id, l.name]))
    const categoryMap = new Map(mockCategories.map(c => [c.id, c]))
    const accountMap = new Map(mockAccounts.map(a => [a.id, a]))

    const escapeCSV = (val: any): string => {
      const s = val === null || val === undefined ? '' : String(val)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    const headers = ['日期', '类型', '分类', '金额', '账户', '账户类型', '账户详情', '账本', '备注', '创建时间']
    const rows = mockRecords
      .filter(r => !r.isDeleted)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => {
        const cat = categoryMap.get(r.categoryId)
        const acc = accountMap.get(r.accountId)
        const typeLabel = r.type === 'income' ? '收入' : '支出'
        const accDetail = acc ? [acc.bankName, acc.cardNo, acc.holderName].filter(Boolean).join(' ') : ''
        return [
          escapeCSV(r.date), escapeCSV(typeLabel),
          escapeCSV(cat ? `${cat.icon || ''} ${cat.name}` : ''),
          escapeCSV(r.amount.toFixed(2)), escapeCSV(acc?.name || ''),
          escapeCSV(acc?.type || ''), escapeCSV(accDetail),
          escapeCSV(ledgerMap.get(r.ledgerId) || ''),
          escapeCSV(r.note || ''), escapeCSV(r.createdAt || '')
        ].join(',')
      })

    const accountsHeaders = ['账户名称', '账户类型', '当前余额', '开户行', '卡号/尾号', '持有人', '唯一标识', '备注']
    const accountsRows = mockAccounts
      .filter(a => !a.isDeleted)
      .map(a => [
        escapeCSV(a.name), escapeCSV(a.type),
        escapeCSV(a.balance.toFixed(2)),
        escapeCSV(a.bankName || ''), escapeCSV(a.cardNo || ''),
        escapeCSV(a.holderName || ''), escapeCSV(a.uniqueId || ''),
        escapeCSV(a.remark || '')
      ].join(','))

    const categoriesHeaders = ['分类名称', '类型', '图标', '颜色', '是否默认']
    const categoriesRows = mockCategories
      .filter(c => !c.isDeleted)
      .map(c => [
        escapeCSV(c.name), escapeCSV(c.type === 'income' ? '收入' : '支出'),
        escapeCSV(c.icon || ''), escapeCSV(c.color || ''),
        escapeCSV(c.isDefault ? '是' : '否')
      ].join(','))

    const csv = [
      '记账记录', headers.join(','), ...rows,
      '', '账户列表', accountsHeaders.join(','), ...accountsRows,
      '', '分类列表', categoriesHeaders.join(','), ...categoriesRows
    ].join('\n')

    return Promise.resolve('\uFEFF' + csv)
  },

  importData: (jsonStr: string, mode: 'replace' | 'merge'): Promise<{ success: boolean; message: string; stats: { ledgers: number; records: number; accounts: number; categories: number; budgets: number } }> => {
    try {
      const parsed = JSON.parse(jsonStr)
      if (!parsed.data || !parsed.version) {
        return Promise.resolve({ success: false, message: '无效的备份文件格式', stats: { ledgers: 0, records: 0, accounts: 0, categories: 0, budgets: 0 } })
      }
      const imported = parsed.data

      if (mode === 'replace') {
        mockLedgers = imported.ledgers || []
        mockRecords = imported.records || []
        mockAccounts = imported.accounts || []
        mockCategories = imported.categories || []
        mockBudgets = imported.budgets || []
        nextIds = imported.nextIds || { record: 1, account: 1, category: 1, budget: 1, ledger: 1 }
      } else {
        const idOffset = { ledger: nextIds.ledger, record: nextIds.record, account: nextIds.account, category: nextIds.category, budget: nextIds.budget }
        const remapId = (id: number | undefined, offset: number): number | undefined => id === undefined ? undefined : id + offset

        const importedLedgers: Ledger[] = (imported.ledgers || []).map((l: Ledger) => ({ ...l, id: remapId(l.id, idOffset.ledger), isDeleted: l.isDeleted || 0 }))
        const importedRecords: Record[] = (imported.records || []).map((r: Record) => ({ ...r, id: remapId(r.id, idOffset.record), ledgerId: remapId(r.ledgerId, idOffset.ledger), categoryId: remapId(r.categoryId, idOffset.category) || r.categoryId, accountId: remapId(r.accountId, idOffset.account) || r.accountId, isDeleted: r.isDeleted || 0 }))
        const importedAccounts: Account[] = (imported.accounts || []).map((a: Account) => ({ ...a, id: remapId(a.id, idOffset.account), ledgerId: remapId(a.ledgerId, idOffset.ledger), isDeleted: a.isDeleted || 0 }))
        const importedCategories: Category[] = (imported.categories || []).map((c: Category) => ({ ...c, id: remapId(c.id, idOffset.category), ledgerId: remapId(c.ledgerId, idOffset.ledger), isDeleted: c.isDeleted || 0 }))
        const importedBudgets: Budget[] = (imported.budgets || []).map((b: Budget) => ({ ...b, id: remapId(b.id, idOffset.budget), ledgerId: remapId(b.ledgerId, idOffset.ledger), categoryId: remapId(b.categoryId, idOffset.category) || b.categoryId }))

        mockLedgers.push(...importedLedgers)
        mockRecords.push(...importedRecords)
        mockAccounts.push(...importedAccounts)
        mockCategories.push(...importedCategories)
        mockBudgets.push(...importedBudgets)

        const importedNextIds = imported.nextIds || { record: 1, account: 1, category: 1, budget: 1, ledger: 1 }
        nextIds.ledger += importedNextIds.ledger || 0
        nextIds.record += importedNextIds.record || 0
        nextIds.account += importedNextIds.account || 0
        nextIds.category += importedNextIds.category || 0
        nextIds.budget += importedNextIds.budget || 0
      }

      saveCurrentUserData()
      const stats = {
        ledgers: (imported.ledgers || []).filter((l: Ledger) => !l.isDeleted).length,
        records: (imported.records || []).filter((r: Record) => !r.isDeleted).length,
        accounts: (imported.accounts || []).filter((a: Account) => !a.isDeleted).length,
        categories: (imported.categories || []).filter((c: Category) => !c.isDeleted).length,
        budgets: (imported.budgets || []).length
      }
      return Promise.resolve({ success: true, message: mode === 'replace' ? '数据已替换导入' : '数据已合并导入', stats })
    } catch (e: any) {
      return Promise.resolve({ success: false, message: `导入失败：${e.message || '文件格式错误'}`, stats: { ledgers: 0, records: 0, accounts: 0, categories: 0, budgets: 0 } })
    }
  },

  syncData: (): Promise<{ success: boolean; message: string; lastSyncAt: string }> => {
    const now = new Date().toISOString()
    saveCurrentUserData()
    try { localStorage.setItem(`expense_sync_${currentUserId}`, JSON.stringify({ lastSyncAt: now })) } catch {}
    mockRecords.forEach(r => { r.syncedAt = now })
    saveCurrentUserData()
    return Promise.resolve({ success: true, message: '数据同步成功', lastSyncAt: now })
  },

  getSyncStatus: (): Promise<{ lastSyncAt: string | null; localDataSize: number }> => {
    let lastSyncAt: string | null = null
    try {
      const syncInfo = localStorage.getItem(`expense_sync_${currentUserId}`)
      if (syncInfo) lastSyncAt = JSON.parse(syncInfo).lastSyncAt
    } catch {}
    const localDataSize = JSON.stringify({ ledgers: mockLedgers, records: mockRecords, accounts: mockAccounts, categories: mockCategories, budgets: mockBudgets }).length
    return Promise.resolve({ lastSyncAt, localDataSize })
  },

	  login: async (username: string, password: string): Promise<User | null> => {
	    const hashed = await hashPassword(password)
	    const user = mockUsers.find(u => u.username === username && u.password === hashed)
    if (user && user.id) loadOrInitUserData(user.id)
    return Promise.resolve(user ? { ...user } : null)
  },

	  register: async (username: string, password: string, nickname?: string): Promise<User> => {
    const existing = mockUsers.find(u => u.username === username)
    if (existing) return Promise.reject(new Error('用户名已存在'))
    const id = nextUserId++
    const now = new Date().toISOString()
	    const hashedPw = await hashPassword(password)
	    const user: User = { id, username, password: hashedPw, avatar: '👤', nickname: nickname || username, createdAt: now, updatedAt: now }
    mockUsers.push(user)
    saveMockUsers()
    initNewUserData()
    currentUserId = id
    saveCurrentUserData()
    return Promise.resolve({ ...user })
  },

	  updateUser: async (id: number, data: Partial<User>): Promise<void> => {
	    const idx = mockUsers.findIndex(u => u.id === id)
	    if (idx !== -1) {
	      const updateData = { ...data }
	      if (updateData.password) {
	        updateData.password = await hashPassword(updateData.password as string)
	      }
	      mockUsers[idx] = { ...mockUsers[idx], ...updateData, updatedAt: new Date().toISOString() }
	      saveMockUsers()
	    }
	    return Promise.resolve()
	  },

  mergeLedger: (sourceId: number, targetId: number): Promise<{ mergedCategories: number; mergedAccounts: number; mergedRecords: number }> => {
    let mergedCategories = 0
    let mergedAccounts = 0

    const sourceCategories = mockCategories.filter(c => c.ledgerId === sourceId && !c.isDeleted)
    const targetCategories = mockCategories.filter(c => c.ledgerId === targetId && !c.isDeleted)

    const categoryRemap = new Map<number, number>()
    sourceCategories.forEach(srcCat => {
      const existingTarget = targetCategories.find(tgtCat => tgtCat.name === srcCat.name && tgtCat.type === srcCat.type)
      if (existingTarget && existingTarget.id) {
        categoryRemap.set(srcCat.id!, existingTarget.id)
        srcCat.isDeleted = 1
        mergedCategories++
      } else {
        srcCat.ledgerId = targetId
      }
    })

    const sourceAccounts = mockAccounts.filter(a => a.ledgerId === sourceId && !a.isDeleted)
    const targetAccounts = mockAccounts.filter(a => a.ledgerId === targetId && !a.isDeleted)

    const accountRemap = new Map<number, number>()
    sourceAccounts.forEach(srcAcc => {
      const srcKey = srcAcc.uniqueId || `${srcAcc.type}:${srcAcc.name}`
      const existingTarget = targetAccounts.find(tgtAcc => {
        const tgtKey = tgtAcc.uniqueId || `${tgtAcc.type}:${tgtAcc.name}`
        return tgtKey === srcKey
      })
      if (existingTarget && existingTarget.id) {
        accountRemap.set(srcAcc.id!, existingTarget.id)
        existingTarget.balance = existingTarget.balance + srcAcc.balance
        srcAcc.isDeleted = 1
        mergedAccounts++
      } else {
        srcAcc.ledgerId = targetId
      }
    })

    mockRecords.forEach(r => {
      if (r.ledgerId === sourceId) {
        r.ledgerId = targetId
        if (r.categoryId && categoryRemap.has(r.categoryId)) r.categoryId = categoryRemap.get(r.categoryId)!
        if (r.accountId && accountRemap.has(r.accountId)) r.accountId = accountRemap.get(r.accountId)!
      }
    })

    mockBudgets.forEach(b => {
      if (b.ledgerId === sourceId) {
        b.ledgerId = targetId
        if (b.categoryId && categoryRemap.has(b.categoryId)) b.categoryId = categoryRemap.get(b.categoryId)!
      }
    })

    const idx = mockLedgers.findIndex(l => l.id === sourceId)
    if (idx !== -1) mockLedgers[idx].isDeleted = 1
    saveCurrentUserData()

    const mergedRecords = mockRecords.filter(r => r.ledgerId === targetId && !r.isDeleted).length
    return Promise.resolve({ mergedCategories, mergedAccounts, mergedRecords })
  },

  getLedgerStats: (): Promise<Map<number, { records: number; accounts: number; categories: number }>> => {
    const map = new Map<number, { records: number; accounts: number; categories: number }>()
    mockLedgers.forEach(l => { if (!l.isDeleted && l.id) map.set(l.id, { records: 0, accounts: 0, categories: 0 }) })
    mockRecords.forEach(r => { if (!r.isDeleted && r.ledgerId && map.has(r.ledgerId)) map.get(r.ledgerId)!.records++ })
    mockAccounts.forEach(a => { if (!a.isDeleted && a.ledgerId && map.has(a.ledgerId)) map.get(a.ledgerId)!.accounts++ })
    mockCategories.forEach(c => { if (!c.isDeleted && c.ledgerId && map.has(c.ledgerId)) map.get(c.ledgerId)!.categories++ })
    return Promise.resolve(map)
  },

  transferBetweenAccounts: (sourceAccountId: number, targetAccountId: number, amount: number, note?: string, fee?: number): Promise<number> => {
    const id = nextIds.record++
    const now = new Date().toISOString()
    const sourceAccount = mockAccounts.find(a => a.id === sourceAccountId)
    const targetAccount = mockAccounts.find(a => a.id === targetAccountId)
    const actualFee = fee || 0
    const ledgerId = sourceAccount?.ledgerId ?? targetAccount?.ledgerId
    const record: Record = {
      id, amount, type: 'transfer',
      categoryId: 0, accountId: sourceAccountId, targetAccountId,
      fee: actualFee,
      ledgerId,
      date: new Date().toISOString().split('T')[0],
      note: note || `转账：${sourceAccount?.name || ''} → ${targetAccount?.name || ''}`,
      tags: '', attachment: '',
      createdAt: now, updatedAt: now,
      syncedAt: undefined, isDeleted: 0
    }
    mockRecords.push(record)
    // If there's a fee, create an expense record for it
    if (actualFee > 0 && sourceAccount) {
      const feeCategory = mockCategories.find(c => c.type === 'expense' && c.ledgerId === ledgerId && !c.isDeleted)
      if (feeCategory) {
        const feeId = nextIds.record++
        mockRecords.push({
          id: feeId, amount: actualFee, type: 'expense',
          categoryId: feeCategory.id!, accountId: sourceAccountId,
          ledgerId,
          date: new Date().toISOString().split('T')[0],
          note: `转账手续费：${note || ''}`,
          tags: '', attachment: '',
          createdAt: now, updatedAt: now,
          syncedAt: undefined, isDeleted: 0
        })
      }
    }
    if (sourceAccount) sourceAccount.balance -= amount + actualFee
    if (targetAccount) targetAccount.balance += amount
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  refundRecord: (originalRecordId: number, refundAmount: number, shippingFee: number, note?: string): Promise<number> => {
    const originalRecord = mockRecords.find(r => r.id === originalRecordId)
    if (!originalRecord || originalRecord.type !== 'expense' || originalRecord.isDeleted) {
      return Promise.reject(new Error('只能对支出记录进行退款'))
    }

    const now = new Date().toISOString()
    const actualRefund = refundAmount - shippingFee
    const account = mockAccounts.find(a => a.id === originalRecord.accountId)
    if (account) {
      account.balance += actualRefund
    }

    originalRecord.refundAmount = refundAmount
    originalRecord.shippingFee = shippingFee
    originalRecord.refundNote = note || ''
    originalRecord.refundDate = new Date().toISOString().split('T')[0]
    originalRecord.refundStatus = refundAmount >= originalRecord.amount ? 'full' : 'partial'
    originalRecord.updatedAt = now

    saveCurrentUserData()
    return Promise.resolve(originalRecordId)
  },

  addLog: (action: string, target: string, detail?: string): Promise<number> => {
    const id = nextIds.log++
    const now = new Date().toISOString()
    const operator = currentUserId ? (mockUsers.find(u => u.id === currentUserId)?.username || String(currentUserId)) : 'system'
    const log: Log = { id, action, target, detail, operator, createdAt: now }
    mockLogs.push(log)
    saveCurrentUserData()
    return Promise.resolve(id)
  },

  getLogs: (limit?: number): Promise<Log[]> => {
    const sorted = [...mockLogs].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    return Promise.resolve(limit ? sorted.slice(0, limit) : sorted)
  },

  clearLogs: (): Promise<void> => {
    mockLogs = []
    nextIds.log = 1
    saveCurrentUserData()
    return Promise.resolve()
  }
}

export function getApi() {
  if ((window as any).electronAPI) return (window as any).electronAPI
  return mockApi
}
