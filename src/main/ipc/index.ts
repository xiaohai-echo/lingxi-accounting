import { ipcMain } from 'electron'
import {
  getRecords, addRecord, updateRecord, deleteRecord,
  getAccounts, addAccount, updateAccount, deleteAccount,
  getCategories, addCategory, updateCategory, deleteCategory,
  getBudgets, addBudget, updateBudget, deleteBudget,
  getLedgers, addLedger, updateLedger, deleteLedger,
  verifyUser, addUser, updateUser,
  getLogs, addLog, clearLogs,
  transferBetweenAccounts, refundRecord,
  exportData, importData, exportCSV, getLedgerStats, mergeLedger
} from '../database'

export function registerIpcHandlers() {
  // Records
  ipcMain.handle('get-records', (_e, ledgerId?: number) => getRecords(ledgerId))
  ipcMain.handle('add-record', (_e, record) => addRecord(record))
  ipcMain.handle('update-record', (_e, id, record) => { updateRecord(id, record) })
  ipcMain.handle('delete-record', (_e, id) => { deleteRecord(id) })

  // Accounts
  ipcMain.handle('get-accounts', (_e, ledgerId?: number) => getAccounts(ledgerId))
  ipcMain.handle('add-account', (_e, account) => addAccount(account))
  ipcMain.handle('update-account', (_e, id, account) => { updateAccount(id, account) })
  ipcMain.handle('delete-account', (_e, id) => { deleteAccount(id) })

  // Categories
  ipcMain.handle('get-categories', (_e, ledgerId?: number) => getCategories(ledgerId))
  ipcMain.handle('add-category', (_e, category) => addCategory(category))
  ipcMain.handle('update-category', (_e, id, category) => { updateCategory(id, category) })
  ipcMain.handle('delete-category', (_e, id) => { deleteCategory(id) })

  // Budgets
  ipcMain.handle('get-budgets', (_e, ledgerId?: number) => getBudgets(ledgerId))
  ipcMain.handle('add-budget', (_e, budget) => addBudget(budget))
  ipcMain.handle('update-budget', (_e, id, budget) => { updateBudget(id, budget) })
  ipcMain.handle('delete-budget', (_e, id) => { deleteBudget(id) })

  // Ledgers
  ipcMain.handle('get-ledgers', () => getLedgers())
  ipcMain.handle('add-ledger', (_e, ledger) => addLedger(ledger))
  ipcMain.handle('update-ledger', (_e, id, ledger) => { updateLedger(id, ledger) })
  ipcMain.handle('delete-ledger', (_e, id) => { deleteLedger(id) })
  ipcMain.handle('merge-ledger', (_e, sourceId: number, targetId: number) => mergeLedger(sourceId, targetId))
  ipcMain.handle('get-ledger-stats', () => {
    const map = getLedgerStats()
    return Array.from(map.entries()).map(([id, stats]) => ({ id, ...stats }))
  })

  // Users
  ipcMain.handle('login', (_e, username: string, password: string) => verifyUser(username, password))
  ipcMain.handle('register', (_e, user) => addUser(user))
  ipcMain.handle('update-user', (_e, id, data) => { updateUser(id, data) })
  ipcMain.handle('get-current-user', () => null)

  // Logs
  ipcMain.handle('get-logs', (_e, limit?: number) => getLogs(limit))
  ipcMain.handle('add-log', (_e, action: string, target: string, detail?: string, operator?: string) => addLog(action, target, detail, operator))
  ipcMain.handle('clear-logs', () => { clearLogs() })

  // Transfers & Refunds
  ipcMain.handle('transfer-between-accounts', (_e, sourceAccountId: number, targetAccountId: number, amount: number, note?: string, fee?: number, ledgerId?: number) =>
    transferBetweenAccounts(sourceAccountId, targetAccountId, amount, note, fee, ledgerId))
  ipcMain.handle('refund-record', (_e, originalRecordId: number, refundAmount: number, shippingFee: number, note?: string) =>
    refundRecord(originalRecordId, refundAmount, shippingFee, note))

  // Sync
  ipcMain.handle('sync-data', () => {
    try {
      const now = new Date().toISOString()
      const records = getRecords()
      records.forEach(r => {
        if (r.id) updateRecord(r.id, { syncedAt: now } as any)
      })
      return { success: true, message: '数据同步成功', lastSyncAt: now }
    } catch (e: any) {
      return { success: false, message: '同步失败: ' + e.message }
    }
  })
  ipcMain.handle('get-sync-status', () => {
    const data = JSON.stringify({ ledgers: getLedgers(), records: getRecords(), accounts: getAccounts(), categories: getCategories(), budgets: getBudgets() })
    return { lastSyncAt: null, localDataSize: Buffer.byteLength(data, 'utf-8') }
  })

  // Export / Import — return data only, frontend handles file dialogs
  ipcMain.handle('export-data', () => exportData())

  ipcMain.handle('import-data', (_e, jsonStr: string, mode: 'replace' | 'merge') => importData(jsonStr))

  ipcMain.handle('export-csv', () => {
    return exportCSV()
  })

  // Test data
  ipcMain.handle('add-test-data', () => {
    try {
      const existingRecords = getRecords()
      if (existingRecords.length > 0) {
        return { success: false, message: '数据库中已有数据，跳过测试数据添加' }
      }

      const categories = getCategories()
      const accounts = getAccounts()
      if (categories.length === 0 || accounts.length === 0) {
        return { success: false, message: '分类或账户数据不完整' }
      }

      const testRecords: Array<{ amount: number; type: 'income' | 'expense'; categoryId: number; accountId: number; date: string; note: string }> = [
        { amount: 25.50, type: 'expense', categoryId: categories[0].id!, accountId: accounts[0].id!, date: '2026-05-10', note: '午餐' },
        { amount: 15.00, type: 'expense', categoryId: categories[1].id!, accountId: accounts[0].id!, date: '2026-05-10', note: '公交车' },
        { amount: 156.80, type: 'expense', categoryId: categories[2].id!, accountId: accounts[1].id!, date: '2026-05-11', note: '日用品' },
        { amount: 88.00, type: 'expense', categoryId: categories[3].id!, accountId: accounts[2].id!, date: '2026-05-11', note: '电影票' },
        { amount: 12000.00, type: 'income', categoryId: categories.find(c => c.type === 'income')!.id!, accountId: accounts[1].id!, date: '2026-05-05', note: '5月份工资' },
        { amount: 42.30, type: 'expense', categoryId: categories[0].id!, accountId: accounts[3].id!, date: '2026-05-12', note: '早餐' },
        { amount: 380.00, type: 'expense', categoryId: categories[2].id!, accountId: accounts[0].id!, date: '2026-05-12', note: '衣服' }
      ]

      testRecords.forEach(record => addRecord(record))
      return { success: true, message: `成功添加 ${testRecords.length} 条测试记录` }
    } catch (error) {
      return { success: false, message: `添加测试数据失败: ${error}` }
    }
  })
}
