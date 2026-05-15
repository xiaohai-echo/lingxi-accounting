import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { Record, Account, Category, Budget, Ledger, User, Log } from './schema'
import { createHash } from 'node:crypto'

let db: SqlJsDatabase
let SQL: any

export async function initDatabase() {
  try {
    console.log('[Database] Initializing sql.js...')

    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'expense-tracker.db')
    // Resolve WASM path relative to app root (works in both dev and packaged)
    const appPath = app.getAppPath()
    const wasmPath = path.join(appPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

    console.log('[Database] User data path:', userDataPath)
    console.log('[Database] Database path:', dbPath)
    console.log('[Database] App path:', appPath)
    console.log('[Database] WASM path:', wasmPath)

    // Load SQL.js with WASM binary — avoids path resolution issues in asar
    const wasmBinary = fs.readFileSync(wasmPath)
    SQL = await initSqlJs({ wasmBinary })

    console.log('[Database] sql.js initialized successfully')

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
    } else {
      db = new SQL.Database()
    }

    createTables()
    runMigrations()
    seedInitialData()
    saveDatabase()
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error)
    throw error
  }
}

function saveDatabase() {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'expense-tracker.db')
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}


// Helper: execute a parameterized query and return rows as array of arrays
function execQuery(sql: string, params: any[] = []): any[][] {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows: any[][] = []
  while (stmt.step()) {
    rows.push(stmt.get())
  }
  stmt.free()
  return rows
}

// Helper: execute a parameterized query and return raw sql.js QueryExecResult[]
function execQueryResult(sql: string, params: any[] = []): { columns: string[]; values: any[][] }[] {
  const values = execQuery(sql, params)
  if (values.length === 0) return []
  // Build generic column names from first row width
  const colCount = values[0] ? values[0].length : 0
  const columns: string[] = []
  for (let i = 0; i < colCount; i++) columns.push('col' + i)
  return [{ columns, values }]
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      avatar TEXT,
      nickname TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT,
      operator TEXT,
      created_at TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      color TEXT,
      icon TEXT,
      ledger_id INTEGER,
      unique_id TEXT,
      bank_name TEXT,
      card_no TEXT,
      holder_name TEXT,
      remark TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      ledger_id INTEGER,
      is_default INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      target_account_id INTEGER,
      fee REAL DEFAULT 0,
      ledger_id INTEGER,
      date TEXT NOT NULL,
      note TEXT,
      tags TEXT,
      attachment TEXT,
      refund_status TEXT DEFAULT 'none',
      refund_amount REAL DEFAULT 0,
      shipping_fee REAL DEFAULT 0,
      refund_note TEXT,
      refund_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      ledger_id INTEGER,
      amount REAL NOT NULL,
      period TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER,
      quarter INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

function runMigrations() {
  const migrations: string[] = [
    "ALTER TABLE categories ADD COLUMN created_at TEXT",
    "ALTER TABLE categories ADD COLUMN updated_at TEXT",
    "CREATE TABLE IF NOT EXISTS ledgers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT, color TEXT, is_default INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, avatar TEXT, nickname TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT, operator TEXT, created_at TEXT NOT NULL)",
    "ALTER TABLE accounts ADD COLUMN ledger_id INTEGER",
    "ALTER TABLE accounts ADD COLUMN unique_id TEXT",
    "ALTER TABLE accounts ADD COLUMN bank_name TEXT",
    "ALTER TABLE accounts ADD COLUMN card_no TEXT",
    "ALTER TABLE accounts ADD COLUMN holder_name TEXT",
    "ALTER TABLE accounts ADD COLUMN remark TEXT",
    "ALTER TABLE categories ADD COLUMN ledger_id INTEGER",
    "ALTER TABLE records ADD COLUMN target_account_id INTEGER",
    "ALTER TABLE records ADD COLUMN fee REAL DEFAULT 0",
    "ALTER TABLE records ADD COLUMN ledger_id INTEGER",
    "ALTER TABLE records ADD COLUMN refund_status TEXT DEFAULT 'none'",
    "ALTER TABLE records ADD COLUMN refund_amount REAL DEFAULT 0",
    "ALTER TABLE records ADD COLUMN shipping_fee REAL DEFAULT 0",
    "ALTER TABLE records ADD COLUMN refund_note TEXT",
    "ALTER TABLE records ADD COLUMN refund_date TEXT",
    "ALTER TABLE budgets ADD COLUMN ledger_id INTEGER",
  ]

  for (const sql of migrations) {
    try { db.run(sql) } catch { /* Column/table already exists */ }
  }
  saveDatabase()
}

function seedInitialData() {
  const now = new Date().toISOString()

  const ledgerCount = db.exec('SELECT COUNT(*) as count FROM ledgers WHERE is_deleted = 0')
  if (ledgerCount.length === 0 || ledgerCount[0].values[0][0] === 0) {
    db.run(
      'INSERT INTO ledgers (name, icon, color, is_default, is_deleted, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)',
      ['日常账本', '📒', '#667eea', now, now]
    )
  }

  const ledgerResult = db.exec('SELECT id FROM ledgers WHERE is_deleted = 0 LIMIT 1')
  const defaultLedgerId = ledgerResult.length > 0 ? ledgerResult[0].values[0][0] as number : null

  const categoryCount = db.exec('SELECT COUNT(*) as count FROM categories WHERE is_deleted = 0')
  if (categoryCount.length === 0 || categoryCount[0].values[0][0] === 0) {
    const defaultCategories = [
      { name: '餐饮', type: 'expense', icon: '🍜', color: '#FF6B6B' },
      { name: '交通', type: 'expense', icon: '🚗', color: '#4ECDC4' },
      { name: '购物', type: 'expense', icon: '🛒', color: '#45B7D1' },
      { name: '娱乐', type: 'expense', icon: '🎮', color: '#96CEB4' },
      { name: '居住', type: 'expense', icon: '🏠', color: '#F39C12' },
      { name: '医疗', type: 'expense', icon: '🏥', color: '#E74C3C' },
      { name: '教育', type: 'expense', icon: '📚', color: '#DDA0DD' },
      { name: '通讯', type: 'expense', icon: '📱', color: '#1ABC9C' },
      { name: '服饰', type: 'expense', icon: '👗', color: '#E91E63' },
      { name: '日用', type: 'expense', icon: '🧴', color: '#795548' },
      { name: '人情', type: 'expense', icon: '🎁', color: '#FF9800' },
      { name: '水电燃气', type: 'expense', icon: '⚡', color: '#FFD700' },
      { name: '数码电子', type: 'expense', icon: '💻', color: '#3498DB' },
      { name: '运动健身', type: 'expense', icon: '🏃', color: '#2ECC71' },
      { name: '美容美发', type: 'expense', icon: '💇', color: '#FF69B4' },
      { name: '宠物', type: 'expense', icon: '🐱', color: '#FFA07A' },
      { name: '旅行', type: 'expense', icon: '✈️', color: '#00BCD4' },
      { name: '烟酒', type: 'expense', icon: '🍺', color: '#A0522D' },
      { name: '办公', type: 'expense', icon: '📎', color: '#607D8B' },
      { name: '其他支出', type: 'expense', icon: '📦', color: '#9E9E9E' },
      { name: '工资', type: 'income', icon: '💰', color: '#2ECC71' },
      { name: '奖金', type: 'income', icon: '🎉', color: '#F39C12' },
      { name: '投资', type: 'income', icon: '📈', color: '#3498DB' },
      { name: '兼职', type: 'income', icon: '💼', color: '#9B59B6' },
      { name: '理财', type: 'income', icon: '🏦', color: '#1ABC9C' },
      { name: '红包', type: 'income', icon: '🧧', color: '#FF4500' },
      { name: '报销', type: 'income', icon: '📋', color: '#8BC34A' },
      { name: '租金', type: 'income', icon: '🔑', color: '#FF9800' },
      { name: '退款', type: 'income', icon: '↩️', color: '#00BCD4' },
      { name: '其他收入', type: 'income', icon: '📥', color: '#7F8C8D' }
    ]

    const insertStmt = db.prepare(
      'INSERT INTO categories (name, type, icon, color, ledger_id, is_default, sort_order, is_deleted) VALUES (?, ?, ?, ?, ?, 1, ?, 0)'
    )
    defaultCategories.forEach((cat, index) => {
      insertStmt.run([cat.name, cat.type, cat.icon, cat.color, defaultLedgerId, index])
    })
    insertStmt.free()
  }

  const accountCount = db.exec('SELECT COUNT(*) as count FROM accounts WHERE is_deleted = 0')
  if (accountCount.length === 0 || accountCount[0].values[0][0] === 0) {
    const defaultAccounts = [
      { name: '现金', type: 'cash', balance: 0, color: '#FFD93D' },
      { name: '银行卡', type: 'bank', balance: 0, color: '#6BCB77' },
      { name: '微信', type: 'wechat', balance: 0, color: '#07C160' },
      { name: '支付宝', type: 'alipay', balance: 0, color: '#1677FF' }
    ]

    const insertStmt = db.prepare(
      'INSERT INTO accounts (name, type, balance, color, ledger_id, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    )
    defaultAccounts.forEach(acc => {
      insertStmt.run([acc.name, acc.type, acc.balance, acc.color, defaultLedgerId, now, now])
    })
    insertStmt.free()
  }
}

// ─── Balance helpers ────────────────────────────────────────

function updateAccountBalance(accountId: number, delta: number) {
  db.run('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?', [
    delta, new Date().toISOString(), accountId
  ])
}

function reverseRecordBalance(r: Record) {
  if (r.isDeleted) return
  if (r.type === 'income') {
    updateAccountBalance(r.accountId, -r.amount)
  } else if (r.type === 'expense') {
    const adj = (r.refundAmount || 0) - (r.shippingFee || 0)
    updateAccountBalance(r.accountId, r.amount - adj)
  } else if (r.type === 'transfer') {
    updateAccountBalance(r.accountId, r.amount + (r.fee || 0))
    if (r.targetAccountId) updateAccountBalance(r.targetAccountId, -r.amount)
  }
}

function applyRecordBalance(r: Record) {
  if (r.isDeleted) return
  if (r.type === 'income') {
    updateAccountBalance(r.accountId, r.amount)
  } else if (r.type === 'expense') {
    const adj = (r.refundAmount || 0) - (r.shippingFee || 0)
    updateAccountBalance(r.accountId, -r.amount + adj)
  } else if (r.type === 'transfer') {
    updateAccountBalance(r.accountId, -(r.amount + (r.fee || 0)))
    if (r.targetAccountId) updateAccountBalance(r.targetAccountId, r.amount)
  }
}

// ─── Record mappers ─────────────────────────────────────────

function mapRecordRow(row: any[]): Record {
  return {
    id: row[0] as number,
    amount: row[1] as number,
    type: row[2] as 'income' | 'expense' | 'transfer',
    categoryId: row[3] as number,
    accountId: row[4] as number,
    targetAccountId: (row[5] ?? undefined) as number | undefined,
    fee: (row[6] ?? undefined) as number | undefined,
    ledgerId: (row[7] ?? undefined) as number | undefined,
    date: row[8] as string,
    note: row[9] as string,
    tags: row[10] as string,
    attachment: row[11] as string,
    refundStatus: (row[12] as 'none' | 'partial' | 'full') || 'none',
    refundAmount: (row[13] ?? undefined) as number | undefined,
    shippingFee: (row[14] ?? undefined) as number | undefined,
    refundNote: (row[15] ?? undefined) as string | undefined,
    refundDate: (row[16] ?? undefined) as string | undefined,
    createdAt: row[17] as string,
    updatedAt: row[18] as string,
    syncedAt: row[19] as string,
    isDeleted: row[20] as number
  }
}

// ─── Records CRUD ───────────────────────────────────────────

export function getRecords(ledgerId?: number): Record[] {
  let sql = 'SELECT * FROM records WHERE is_deleted = 0 ORDER BY date DESC'
  const params: any[] = []
  if (ledgerId !== undefined) {
    sql = 'SELECT * FROM records WHERE is_deleted = 0 AND ledger_id = ? ORDER BY date DESC'
    params.push(ledgerId)
  }
  const result = execQueryResult(sql, params)
  if (result.length === 0) return []
  return result[0].values.map(row => mapRecordRow(row))
}

export function addRecord(record: Omit<Record, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO records (amount, type, category_id, account_id, target_account_id, fee, ledger_id, date, note, tags, attachment, refund_status, refund_amount, shipping_fee, refund_note, refund_date, created_at, updated_at, synced_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)'
  )
  stmt.run([
    record.amount, record.type, record.categoryId, record.accountId,
    record.targetAccountId ?? null, record.fee ?? 0, record.ledgerId ?? null,
    record.date, record.note ?? '', record.tags ?? '', record.attachment ?? '',
    record.refundStatus || 'none', record.refundAmount ?? 0,
    record.shippingFee ?? 0, record.refundNote ?? null, record.refundDate ?? null,
    now, now
  ])
  stmt.free()

  const result = db.exec('SELECT last_insert_rowid()')
  const newId = result[0].values[0][0] as number

  applyRecordBalance({
    ...record, id: newId, createdAt: now, updatedAt: now,
    accountId: record.accountId, amount: record.amount, type: record.type,
    targetAccountId: record.targetAccountId, fee: record.fee ?? 0,
    ledgerId: record.ledgerId, note: record.note ?? '',
    tags: record.tags ?? '', attachment: record.attachment ?? '',
    refundStatus: record.refundStatus || 'none',
    refundAmount: record.refundAmount ?? 0,
    shippingFee: record.shippingFee ?? 0,
    refundNote: record.refundNote, refundDate: record.refundDate,
    syncedAt: undefined, isDeleted: 0
  })
  saveDatabase()
  return newId
}

export function updateRecord(id: number, record: Partial<Omit<Record, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const oldRows = execQueryResult('SELECT * FROM records WHERE id = ?', [id])
  if (oldRows.length > 0 && oldRows[0].values.length > 0) {
    reverseRecordBalance(mapRecordRow(oldRows[0].values[0]))
  }

  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (record.amount !== undefined) { setClauses.push('amount = ?'); values.push(record.amount) }
  if (record.type !== undefined) { setClauses.push('type = ?'); values.push(record.type) }
  if (record.categoryId !== undefined) { setClauses.push('category_id = ?'); values.push(record.categoryId) }
  if (record.accountId !== undefined) { setClauses.push('account_id = ?'); values.push(record.accountId) }
  if (record.targetAccountId !== undefined) { setClauses.push('target_account_id = ?'); values.push(record.targetAccountId) }
  if (record.fee !== undefined) { setClauses.push('fee = ?'); values.push(record.fee) }
  if (record.date !== undefined) { setClauses.push('date = ?'); values.push(record.date) }
  if (record.note !== undefined) { setClauses.push('note = ?'); values.push(record.note) }
  if (record.tags !== undefined) { setClauses.push('tags = ?'); values.push(record.tags) }
  if (record.attachment !== undefined) { setClauses.push('attachment = ?'); values.push(record.attachment) }
  if (record.refundStatus !== undefined) { setClauses.push('refund_status = ?'); values.push(record.refundStatus) }
  if (record.refundAmount !== undefined) { setClauses.push('refund_amount = ?'); values.push(record.refundAmount) }
  if (record.shippingFee !== undefined) { setClauses.push('shipping_fee = ?'); values.push(record.shippingFee) }
  if (record.refundNote !== undefined) { setClauses.push('refund_note = ?'); values.push(record.refundNote) }
  if (record.refundDate !== undefined) { setClauses.push('refund_date = ?'); values.push(record.refundDate) }
  if ((record as any).syncedAt !== undefined) { setClauses.push('synced_at = ?'); values.push((record as any).syncedAt) }

  values.push(id)
  const stmt = db.prepare(`UPDATE records SET ${setClauses.join(', ')} WHERE id = ?`)
  stmt.run(values)
  stmt.free()

  const newRows = execQueryResult('SELECT * FROM records WHERE id = ?', [id])
  if (newRows.length > 0 && newRows[0].values.length > 0) {
    applyRecordBalance(mapRecordRow(newRows[0].values[0]))
  }

  saveDatabase()
}

export function deleteRecord(id: number): void {
  const oldRows = execQueryResult('SELECT * FROM records WHERE id = ?', [id])
  if (oldRows.length > 0 && oldRows[0].values.length > 0) {
    reverseRecordBalance(mapRecordRow(oldRows[0].values[0]))
  }

  const stmt = db.prepare('UPDATE records SET is_deleted = 1, updated_at = ? WHERE id = ?')
  stmt.run([new Date().toISOString(), id])
  stmt.free()
  saveDatabase()
}

// ─── Transfers & Refunds ────────────────────────────────────

export function transferBetweenAccounts(
  sourceAccountId: number, targetAccountId: number, amount: number,
  note?: string, fee?: number, ledgerId?: number
): number {
  const actualFee = fee || 0
  const transferId = addRecord({
    amount, type: 'transfer', categoryId: 0,
    accountId: sourceAccountId, targetAccountId,
    fee: actualFee, ledgerId,
    date: new Date().toISOString().split('T')[0],
    note: note || ''
  })
  if (actualFee > 0) {
    const cats = getCategories(ledgerId)
    const feeCat = cats.find(c => c.type === 'expense')
    if (feeCat) {
      addRecord({
        amount: actualFee, type: 'expense',
        categoryId: feeCat.id!, accountId: sourceAccountId,
        ledgerId,
        date: new Date().toISOString().split('T')[0],
        note: `转账手续费：${note || ''}`
      })
    }
  }
  return transferId
}

export function refundRecord(originalRecordId: number, refundAmount: number, shippingFee: number, note?: string): void {
  const oldRows = execQueryResult('SELECT * FROM records WHERE id = ?', [originalRecordId])
  if (oldRows.length === 0 || oldRows[0].values.length === 0) {
    throw new Error('Record not found')
  }
  const record = mapRecordRow(oldRows[0].values[0])
  if (record.type !== 'expense' || record.isDeleted) {
    throw new Error('只能对支出记录进行退款')
  }

  reverseRecordBalance(record)

  const refundStatus = refundAmount >= record.amount ? 'full' : 'partial'
  const now = new Date().toISOString()
  updateAccountBalance(record.accountId, refundAmount - shippingFee)

  const stmt = db.prepare(
    'UPDATE records SET refund_status = ?, refund_amount = ?, shipping_fee = ?, refund_note = ?, refund_date = ?, updated_at = ? WHERE id = ?'
  )
  stmt.run([refundStatus, refundAmount, shippingFee, note || '', now.split('T')[0], now, originalRecordId])
  stmt.free()
  saveDatabase()
}

// ─── Accounts CRUD ──────────────────────────────────────────

function mapAccountRow(row: any[]): Account {
  return {
    id: row[0] as number,
    name: row[1] as string,
    type: row[2] as string,
    balance: row[3] as number,
    color: row[4] as string,
    icon: row[5] as string,
    ledgerId: (row[6] ?? undefined) as number | undefined,
    uniqueId: (row[7] ?? undefined) as string | undefined,
    bankName: (row[8] ?? undefined) as string | undefined,
    cardNo: (row[9] ?? undefined) as string | undefined,
    holderName: (row[10] ?? undefined) as string | undefined,
    remark: (row[11] ?? undefined) as string | undefined,
    createdAt: row[12] as string,
    updatedAt: row[13] as string,
    isDeleted: row[14] as number
  }
}

export function getAccounts(ledgerId?: number): Account[] {
  let sql = 'SELECT * FROM accounts WHERE is_deleted = 0'
  const params: any[] = []
  if (ledgerId !== undefined) { sql += ' AND ledger_id = ?'; params.push(ledgerId) }
  const result = execQueryResult(sql, params)
  if (result.length === 0) return []
  return result[0].values.map(row => mapAccountRow(row))
}

export function addAccount(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO accounts (name, type, balance, color, icon, ledger_id, unique_id, bank_name, card_no, holder_name, remark, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
  )
  stmt.run([
    account.name, account.type, account.balance,
    account.color ?? '', account.icon ?? '',
    account.ledgerId ?? null, account.uniqueId ?? null,
    account.bankName ?? null, account.cardNo ?? null,
    account.holderName ?? null, account.remark ?? null,
    now, now
  ])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function updateAccount(id: number, account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (account.name !== undefined) { setClauses.push('name = ?'); values.push(account.name) }
  if (account.type !== undefined) { setClauses.push('type = ?'); values.push(account.type) }
  if (account.balance !== undefined) { setClauses.push('balance = ?'); values.push(account.balance) }
  if (account.color !== undefined) { setClauses.push('color = ?'); values.push(account.color) }
  if (account.icon !== undefined) { setClauses.push('icon = ?'); values.push(account.icon) }
  if (account.uniqueId !== undefined) { setClauses.push('unique_id = ?'); values.push(account.uniqueId) }
  if (account.bankName !== undefined) { setClauses.push('bank_name = ?'); values.push(account.bankName) }
  if (account.cardNo !== undefined) { setClauses.push('card_no = ?'); values.push(account.cardNo) }
  if (account.holderName !== undefined) { setClauses.push('holder_name = ?'); values.push(account.holderName) }
  if (account.remark !== undefined) { setClauses.push('remark = ?'); values.push(account.remark) }

  values.push(id)
  const stmt = db.prepare(`UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`)
  stmt.run(values)
  stmt.free()
  saveDatabase()
}

export function deleteAccount(id: number): void {
  const stmt = db.prepare('UPDATE accounts SET is_deleted = 1, updated_at = ? WHERE id = ?')
  stmt.run([new Date().toISOString(), id])
  stmt.free()
  saveDatabase()
}

// ─── Categories CRUD ────────────────────────────────────────

function mapCategoryRow(row: any[]): Category {
  return {
    id: row[0] as number,
    name: row[1] as string,
    type: row[2] as 'income' | 'expense',
    icon: row[3] as string,
    color: row[4] as string,
    ledgerId: (row[5] ?? undefined) as number | undefined,
    isDefault: row[6] as number,
    sortOrder: row[7] as number,
    isDeleted: row[8] as number
  }
}

export function getCategories(ledgerId?: number): Category[] {
  let sql = 'SELECT * FROM categories WHERE is_deleted = 0 ORDER BY sort_order'
  const params: any[] = []
  if (ledgerId !== undefined) { sql = 'SELECT * FROM categories WHERE is_deleted = 0 AND ledger_id = ? ORDER BY sort_order'; params.push(ledgerId) }
  const result = execQueryResult(sql, params)
  if (result.length === 0) return []
  return result[0].values.map(row => mapCategoryRow(row))
}

export function addCategory(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO categories (name, type, icon, color, ledger_id, is_default, sort_order, is_deleted) VALUES (?, ?, ?, ?, ?, 0, ?, 0)'
  )
  stmt.run([category.name, category.type, category.icon ?? '', category.color ?? '', category.ledgerId ?? null, category.sortOrder ?? 0])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function updateCategory(id: number, category: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString()
  const setClauses: string[] = []
  const values: any[] = []

  if (category.name !== undefined) { setClauses.push('name = ?'); values.push(category.name) }
  if (category.type !== undefined) { setClauses.push('type = ?'); values.push(category.type) }
  if (category.icon !== undefined) { setClauses.push('icon = ?'); values.push(category.icon) }
  if (category.color !== undefined) { setClauses.push('color = ?'); values.push(category.color) }
  if (category.sortOrder !== undefined) { setClauses.push('sort_order = ?'); values.push(category.sortOrder) }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = ?')
    values.push(now)
    values.push(id)
    const stmt = db.prepare(`UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`)
    stmt.run(values)
    stmt.free()
    saveDatabase()
  }
}

export function deleteCategory(id: number): void {
  const stmt = db.prepare('UPDATE categories SET is_deleted = 1 WHERE id = ?')
  stmt.run([id])
  stmt.free()
  saveDatabase()
}

// ─── Budgets CRUD ───────────────────────────────────────────

function mapBudgetRow(row: any[]): Budget {
  return {
    id: row[0] as number,
    categoryId: row[1] as number,
    ledgerId: (row[2] ?? undefined) as number | undefined,
    amount: row[3] as number,
    period: row[4] as 'monthly' | 'quarterly' | 'yearly',
    year: row[5] as number,
    ...(row[6] != null ? { month: row[6] as number } : {}),
    ...(row[7] != null ? { quarter: row[7] as number } : {}),
    createdAt: row[8] as string,
    updatedAt: row[9] as string
  }
}

export function addBudget(budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO budgets (category_id, ledger_id, amount, period, year, month, quarter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  stmt.run([budget.categoryId, budget.ledgerId ?? null, budget.amount, budget.period, budget.year, budget.month ?? null, budget.quarter ?? null, now, now])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function updateBudget(id: number, budget: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (budget.categoryId !== undefined) { setClauses.push('category_id = ?'); values.push(budget.categoryId) }
  if (budget.amount !== undefined) { setClauses.push('amount = ?'); values.push(budget.amount) }
  if (budget.period !== undefined) { setClauses.push('period = ?'); values.push(budget.period) }
  if (budget.year !== undefined) { setClauses.push('year = ?'); values.push(budget.year) }
  if (budget.month !== undefined) { setClauses.push('month = ?'); values.push(budget.month) }
  if (budget.quarter !== undefined) { setClauses.push('quarter = ?'); values.push(budget.quarter) }

  values.push(id)
  const stmt = db.prepare(`UPDATE budgets SET ${setClauses.join(', ')} WHERE id = ?`)
  stmt.run(values)
  stmt.free()
  saveDatabase()
}

export function deleteBudget(id: number): void {
  const stmt = db.prepare('DELETE FROM budgets WHERE id = ?')
  stmt.run([id])
  stmt.free()
  saveDatabase()
}

export function getBudgets(ledgerId?: number): Budget[] {
  let sql = 'SELECT * FROM budgets'
  const params: any[] = []
  if (ledgerId !== undefined) { sql = 'SELECT * FROM budgets WHERE ledger_id = ?'; params.push(ledgerId) }
  const result = execQueryResult(sql, params)
  if (result.length === 0) return []
  return result[0].values.map(row => mapBudgetRow(row))
}

// ─── Ledgers CRUD ───────────────────────────────────────────

function mapLedgerRow(row: any[]): Ledger {
  return {
    id: row[0] as number,
    name: row[1] as string,
    icon: row[2] as string,
    color: row[3] as string,
    isDefault: row[4] as number,
    isDeleted: row[5] as number,
    createdAt: row[6] as string,
    updatedAt: row[7] as string
  }
}

export function getLedgers(): Ledger[] {
  const result = db.exec('SELECT * FROM ledgers WHERE is_deleted = 0')
  if (result.length === 0) return []
  return result[0].values.map(row => mapLedgerRow(row))
}

export function addLedger(ledger: Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO ledgers (name, icon, color, is_default, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  )
  stmt.run([ledger.name, ledger.icon ?? '', ledger.color ?? '', ledger.isDefault ?? 0, now, now])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function updateLedger(id: number, ledger: Partial<Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (ledger.name !== undefined) { setClauses.push('name = ?'); values.push(ledger.name) }
  if (ledger.icon !== undefined) { setClauses.push('icon = ?'); values.push(ledger.icon) }
  if (ledger.color !== undefined) { setClauses.push('color = ?'); values.push(ledger.color) }

  values.push(id)
  const stmt = db.prepare(`UPDATE ledgers SET ${setClauses.join(', ')} WHERE id = ?`)
  stmt.run(values)
  stmt.free()
  saveDatabase()
}

export function deleteLedger(id: number): void {
  const stmt = db.prepare('UPDATE ledgers SET is_deleted = 1, updated_at = ? WHERE id = ?')
  stmt.run([new Date().toISOString(), id])
  stmt.free()
  saveDatabase()
}

// ─── Users ──────────────────────────────────────────────────

const SALT = 'expense-tracker-salt-v1'

function hashPassword(password: string): string {
  return createHash('sha256').update(SALT + password).digest('hex')
}

function mapUserRow(row: any[]): User {
  return {
    id: row[0] as number,
    username: row[1] as string,
    password: row[2] as string,
    avatar: row[3] as string,
    nickname: row[4] as string,
    createdAt: row[5] as string,
    updatedAt: row[6] as string
  }
}

export function getUserByUsername(username: string): User | null {
  const result = execQueryResult('SELECT * FROM users WHERE username = ?', [username])
  if (result.length === 0 || result[0].values.length === 0) return null
  return mapUserRow(result[0].values[0])
}

export function verifyUser(username: string, password: string): { user: Omit<User, 'password'> | null; error?: string } {
  const user = getUserByUsername(username)
  if (!user) return { user: null, error: '用户名或密码错误' }
  if (user.password !== hashPassword(password)) return { user: null, error: '用户名或密码错误' }
  const { password: _, ...safe } = user as any
  return { user: safe }
}

export function addUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): number {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT INTO users (username, password, avatar, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  stmt.run([user.username, hashPassword(user.password), user.avatar || '👤', user.nickname || user.username, now, now])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const values: any[] = [now]

  if (data.password !== undefined) { setClauses.push('password = ?'); values.push(hashPassword(data.password)) }
  if (data.avatar !== undefined) { setClauses.push('avatar = ?'); values.push(data.avatar) }
  if (data.nickname !== undefined) { setClauses.push('nickname = ?'); values.push(data.nickname) }

  values.push(id)
  const stmt = db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`)
  stmt.run(values)
  stmt.free()
  saveDatabase()
}

// ─── Logs ───────────────────────────────────────────────────

function mapLogRow(row: any[]): Log {
  return {
    id: row[0] as number,
    action: row[1] as string,
    target: row[2] as string,
    detail: (row[3] ?? undefined) as string | undefined,
    operator: (row[4] ?? undefined) as string | undefined,
    createdAt: row[5] as string
  }
}

export function getLogs(limit?: number): Log[] {
  const sql = limit ? 'SELECT * FROM logs ORDER BY id DESC LIMIT ?' : 'SELECT * FROM logs ORDER BY id DESC'
  const params = limit ? [limit] : []
  const result = execQueryResult(sql, params)
  if (result.length === 0) return []
  return result[0].values.map(row => mapLogRow(row))
}

export function addLog(action: string, target: string, detail?: string, operator?: string): number {
  const now = new Date().toISOString()
  const stmt = db.prepare('INSERT INTO logs (action, target, detail, operator, created_at) VALUES (?, ?, ?, ?, ?)')
  stmt.run([action, target, detail || null, operator || null, now])
  stmt.free()
  saveDatabase()
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function clearLogs(): void {
  db.run('DELETE FROM logs')
  saveDatabase()
}


// ─── CSV Export ────────────────────────────────────────────
export function exportCSV(): string {
  const ledgerMap = new Map(getLedgers().map(l => [l.id, l.name]))
  const categoryMap = new Map(getCategories().map(c => [c.id, c]))
  const accountMap = new Map(getAccounts().map(a => [a.id, a]))

  const esc = (val: any): string => {
    const s = val === null || val === undefined ? '' : String(val)
    if (s.includes(',') || s.includes('"') || s.includes('
')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  const headers = ['日期', '类型', '分类', '金额', '账户', '备注', '创建时间']
  const rows = getRecords()
    .filter(r => !r.isDeleted)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => {
      const cat = categoryMap.get(r.categoryId)
      const acc = accountMap.get(r.accountId)
      return [esc(r.date), esc(r.type === 'income' ? '收入' : r.type === 'expense' ? '支出' : '转账'),
        esc(cat ? cat.icon + ' ' + cat.name : ''),
        esc(r.amount.toFixed(2)), esc(acc?.name || ''),
        esc(r.note || ''), esc(r.createdAt || '')
      ].join(',')
    })

  return '﻿' + [headers.join(','), ...rows].join('
')
}

// ─── Import / Export ────────────────────────────────────────

export function exportData(): string {
  const data = {
    ledgers: getLedgers(),
    accounts: getAccounts(),
    categories: getCategories(),
    records: getRecords(),
    budgets: getBudgets(),
    exportedAt: new Date().toISOString()
  }
  return JSON.stringify(data, null, 2)
}

export function importData(jsonData: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonData)

    if (data.ledgers && Array.isArray(data.ledgers)) {
      const stmt = db.prepare('INSERT OR REPLACE INTO ledgers (id, name, icon, color, is_default, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      data.ledgers.forEach((l: any) => stmt.run([l.id, l.name, l.icon ?? '', l.color ?? '', l.isDefault ?? 0, l.isDeleted ?? 0, l.createdAt, l.updatedAt]))
      stmt.free()
    }
    if (data.accounts && Array.isArray(data.accounts)) {
      const stmt = db.prepare('INSERT OR REPLACE INTO accounts (id, name, type, balance, color, icon, ledger_id, unique_id, bank_name, card_no, holder_name, remark, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      data.accounts.forEach((a: any) => stmt.run([a.id, a.name, a.type, a.balance, a.color ?? '', a.icon ?? '', a.ledgerId ?? null, a.uniqueId ?? null, a.bankName ?? null, a.cardNo ?? null, a.holderName ?? null, a.remark ?? null, a.createdAt, a.updatedAt, a.isDeleted ?? 0]))
      stmt.free()
    }
    if (data.categories && Array.isArray(data.categories)) {
      const stmt = db.prepare('INSERT OR REPLACE INTO categories (id, name, type, icon, color, ledger_id, is_default, sort_order, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      data.categories.forEach((c: any) => stmt.run([c.id, c.name, c.type, c.icon ?? '', c.color ?? '', c.ledgerId ?? null, c.isDefault ?? 0, c.sortOrder ?? 0, c.isDeleted ?? 0]))
      stmt.free()
    }
    if (data.records && Array.isArray(data.records)) {
      const stmt = db.prepare('INSERT OR REPLACE INTO records (id, amount, type, category_id, account_id, target_account_id, fee, ledger_id, date, note, tags, attachment, refund_status, refund_amount, shipping_fee, refund_note, refund_date, created_at, updated_at, synced_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      data.records.forEach((r: any) => stmt.run([r.id, r.amount, r.type, r.categoryId, r.accountId, r.targetAccountId ?? null, r.fee ?? 0, r.ledgerId ?? null, r.date, r.note ?? '', r.tags ?? '', r.attachment ?? '', r.refundStatus || 'none', r.refundAmount ?? 0, r.shippingFee ?? 0, r.refundNote ?? null, r.refundDate ?? null, r.createdAt, r.updatedAt, r.syncedAt ?? null, r.isDeleted ?? 0]))
      stmt.free()
    }
    if (data.budgets && Array.isArray(data.budgets)) {
      const stmt = db.prepare('INSERT OR REPLACE INTO budgets (id, category_id, ledger_id, amount, period, year, month, quarter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      data.budgets.forEach((b: any) => stmt.run([b.id, b.categoryId, b.ledgerId ?? null, b.amount, b.period, b.year, b.month ?? null, b.quarter ?? null, b.createdAt, b.updatedAt]))
      stmt.free()
    }
    saveDatabase()
    return { success: true, message: '数据导入成功' }
  } catch (error) {
    return { success: false, message: `导入失败: ${(error as Error).message}` }
  }
}

export function getLedgerStats(): Map<number, { records: number; accounts: number; categories: number }> {
  const map = new Map<number, { records: number; accounts: number; categories: number }>()
  const ledgers = getLedgers()
  ledgers.forEach(l => { if (l.id) map.set(l.id, { records: 0, accounts: 0, categories: 0 }) })

  const recResult = db.exec('SELECT ledger_id, COUNT(*) as cnt FROM records WHERE is_deleted = 0 GROUP BY ledger_id')
  if (recResult.length > 0) recResult[0].values.forEach(r => { if (map.has(r[0] as number)) map.get(r[0] as number)!.records = r[1] as number })

  const accResult = db.exec('SELECT ledger_id, COUNT(*) as cnt FROM accounts WHERE is_deleted = 0 GROUP BY ledger_id')
  if (accResult.length > 0) accResult[0].values.forEach(r => { if (map.has(r[0] as number)) map.get(r[0] as number)!.accounts = r[1] as number })

  const catResult = db.exec('SELECT ledger_id, COUNT(*) as cnt FROM categories WHERE is_deleted = 0 GROUP BY ledger_id')
  if (catResult.length > 0) catResult[0].values.forEach(r => { if (map.has(r[0] as number)) map.get(r[0] as number)!.categories = r[1] as number })

  return map
}

export function mergeLedger(sourceId: number, targetId: number): { mergedCategories: number; mergedAccounts: number; mergedRecords: number } {
  let mergedCategories = 0
  let mergedAccounts = 0

  const srcCats = getCategories(sourceId)
  const tgtCats = getCategories(targetId)
  const catRemap = new Map<number, number>()

  srcCats.forEach(sc => {
    const dup = tgtCats.find(tc => tc.name === sc.name && tc.type === sc.type)
    if (dup && dup.id) {
      catRemap.set(sc.id!, dup.id)
      db.run('UPDATE categories SET is_deleted = 1 WHERE id = ?', [sc.id])
      mergedCategories++
    } else {
      db.run('UPDATE categories SET ledger_id = ? WHERE id = ?', [targetId, sc.id])
    }
  })

  const srcAccs = getAccounts(sourceId)
  const tgtAccs = getAccounts(targetId)
  const accRemap = new Map<number, number>()

  srcAccs.forEach(sa => {
    const sk = sa.uniqueId || `${sa.type}:${sa.name}`
    const dup = tgtAccs.find(ta => (ta.uniqueId || `${ta.type}:${ta.name}`) === sk)
    if (dup && dup.id) {
      accRemap.set(sa.id!, dup.id)
      db.run('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?', [sa.balance, new Date().toISOString(), dup.id])
      db.run('UPDATE accounts SET is_deleted = 1 WHERE id = ?', [sa.id])
      mergedAccounts++
    } else {
      db.run('UPDATE accounts SET ledger_id = ? WHERE id = ?', [targetId, sa.id])
    }
  })

  const srcRecs = execQueryResult('SELECT id, category_id, account_id FROM records WHERE ledger_id = ? AND is_deleted = 0', [sourceId])
  if (srcRecs.length > 0) {
    const upd = db.prepare('UPDATE records SET ledger_id = ?, category_id = ?, account_id = ? WHERE id = ?')
    srcRecs[0].values.forEach(r => {
      upd.run([targetId, catRemap.has(r[1] as number) ? catRemap.get(r[1] as number)! : r[1], accRemap.has(r[2] as number) ? accRemap.get(r[2] as number)! : r[2], r[0]])
    })
    upd.free()
  }

  db.run('UPDATE budgets SET ledger_id = ? WHERE ledger_id = ?', [targetId, sourceId])
  catRemap.forEach((nid, oid) => {
    db.run('UPDATE budgets SET category_id = ? WHERE category_id = ? AND ledger_id = ?', [nid, oid, targetId])
  })

  db.run('UPDATE ledgers SET is_deleted = 1, updated_at = ? WHERE id = ?', [new Date().toISOString(), sourceId])
  saveDatabase()

  const cnt = execQueryResult('SELECT COUNT(*) FROM records WHERE ledger_id = ? AND is_deleted = 0', [targetId])
  return {
    mergedCategories, mergedAccounts,
    mergedRecords: cnt.length > 0 ? cnt[0].values[0][0] as number : 0
  }
}
