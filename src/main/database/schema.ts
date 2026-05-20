export interface Ledger {
  id?: number
  name: string
  icon?: string
  color?: string
  isDefault?: number
  isDeleted?: number
  createdAt?: string
  updatedAt?: string
}

export interface Log {
  id?: number
  action: string
  target: string
  detail?: string
  operator?: string
  createdAt?: string
}

export interface Record {
  id?: number
  amount: number
  type: 'income' | 'expense' | 'transfer'
  categoryId: number
  accountId: number
  targetAccountId?: number
  transferType?: 'transfer' | 'withdraw' | 'recharge'
  fee?: number
  refundStatus?: 'none' | 'partial' | 'full'
  refundAmount?: number
  shippingFee?: number
  refundNote?: string
  refundDate?: string
  ledgerId?: number
  date: string
  title?: string
  note?: string
  rawFilePath?: string
  tags?: string
  attachment?: string
  source?: 'manual' | 'ai_text' | 'ai_voice' | 'ai_image'
  createdAt?: string
  updatedAt?: string
  syncedAt?: string
  isDeleted?: number
}

export interface Account {
  id?: number
  name: string
  type: string
  balance: number
  color?: string
  icon?: string
  ledgerId?: number
  uniqueId?: string
  bankName?: string
  cardNo?: string
  holderName?: string
  remark?: string
  createdAt: string
  updatedAt: string
  isDeleted: number
}

export interface Category {
  id?: number
  name: string
  type: 'income' | 'expense' | 'transfer'
  icon?: string
  color?: string
  ledgerId?: number
  isDefault: number
  sortOrder: number
  isDeleted: number
}

export interface User {
  id?: number
  username: string
  password: string
  avatar?: string
  nickname?: string
  createdAt?: string
  updatedAt?: string
}

export interface Budget {
  id?: number
  categoryId: number
  ledgerId?: number
  amount: number
  period: 'monthly' | 'quarterly' | 'yearly'
  year: number
  month?: number
  quarter?: number
  createdAt?: string
  updatedAt?: string
}
