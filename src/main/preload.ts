import { contextBridge, ipcRenderer } from 'electron'
import type { Record, Account, Category, Budget, Ledger, User, Log } from './database/schema'

contextBridge.exposeInMainWorld('electronAPI', {
  // Records
  getRecords: (ledgerId?: number): Promise<Record[]> => ipcRenderer.invoke('get-records', ledgerId),
  addRecord: (record: Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<number> =>
    ipcRenderer.invoke('add-record', record),
  updateRecord: (id: number, record: Partial<Omit<Record, 'id' | 'updatedAt'> & { createdAt?: string }>): Promise<void> =>
    ipcRenderer.invoke('update-record', id, record),
  deleteRecord: (id: number): Promise<void> => ipcRenderer.invoke('delete-record', id),

  // Accounts
  getAccounts: (ledgerId?: number): Promise<Account[]> => ipcRenderer.invoke('get-accounts', ledgerId),
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> =>
    ipcRenderer.invoke('add-account', account),
  updateAccount: (id: number, account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> =>
    ipcRenderer.invoke('update-account', id, account),
  deleteAccount: (id: number): Promise<void> => ipcRenderer.invoke('delete-account', id),

  // Categories
  getCategories: (ledgerId?: number): Promise<Category[]> => ipcRenderer.invoke('get-categories', ledgerId),
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> =>
    ipcRenderer.invoke('add-category', category),
  updateCategory: (id: number, category: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> =>
    ipcRenderer.invoke('update-category', id, category),
  deleteCategory: (id: number): Promise<void> => ipcRenderer.invoke('delete-category', id),

  // Budgets
  getBudgets: (ledgerId?: number): Promise<Budget[]> => ipcRenderer.invoke('get-budgets', ledgerId),
  addBudget: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> =>
    ipcRenderer.invoke('add-budget', budget),
  updateBudget: (id: number, budget: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> =>
    ipcRenderer.invoke('update-budget', id, budget),
  deleteBudget: (id: number): Promise<void> => ipcRenderer.invoke('delete-budget', id),

  // Ledgers
  getLedgers: (): Promise<Ledger[]> => ipcRenderer.invoke('get-ledgers'),
  addLedger: (ledger: Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> =>
    ipcRenderer.invoke('add-ledger', ledger),
  updateLedger: (id: number, ledger: Partial<Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> =>
    ipcRenderer.invoke('update-ledger', id, ledger),
  deleteLedger: (id: number): Promise<void> => ipcRenderer.invoke('delete-ledger', id),
  mergeLedger: (sourceId: number, targetId: number): Promise<{ mergedCategories: number; mergedAccounts: number; mergedRecords: number }> =>
    ipcRenderer.invoke('merge-ledger', sourceId, targetId),
  getLedgerStats: (): Promise<Array<{ id: number; records: number; accounts: number; categories: number }>> =>
    ipcRenderer.invoke('get-ledger-stats'),

  // Users
  login: (username: string, password: string): Promise<User | null> =>
    ipcRenderer.invoke('login', username, password).then((r: any) => r?.user ?? null),
  register: (username: string, password: string, nickname?: string): Promise<User> =>
    ipcRenderer.invoke('register', { username, password, nickname }),
  updateUser: (id: number, data: Partial<User>): Promise<void> =>
    ipcRenderer.invoke('update-user', id, data),
  getCurrentUser: (): Promise<User | null> => ipcRenderer.invoke('get-current-user'),

  // Logs
  getLogs: (limit?: number): Promise<Log[]> => ipcRenderer.invoke('get-logs', limit),
  addLog: (action: string, target: string, detail?: string): Promise<number> =>
    ipcRenderer.invoke('add-log', action, target, detail),
  clearLogs: (): Promise<void> => ipcRenderer.invoke('clear-logs'),

  // Transfers & Refunds
  transferBetweenAccounts: (sourceAccountId: number, targetAccountId: number, amount: number, note?: string, fee?: number): Promise<number> =>
    ipcRenderer.invoke('transfer-between-accounts', sourceAccountId, targetAccountId, amount, note, fee),
  refundRecord: (originalRecordId: number, refundAmount: number, shippingFee: number, note?: string): Promise<number> =>
    ipcRenderer.invoke('refund-record', originalRecordId, refundAmount, shippingFee, note),

  // Sync
  syncData: (): Promise<{ success: boolean; message: string; lastSyncAt: string }> =>
    ipcRenderer.invoke('sync-data'),
  getSyncStatus: (): Promise<{ lastSyncAt: string | null; localDataSize: number }> =>
    ipcRenderer.invoke('get-sync-status'),

  // Export / Import
  exportData: (): Promise<string> => ipcRenderer.invoke('export-data'),
  exportCSV: (): Promise<string> => ipcRenderer.invoke('export-csv'),
  importData: (jsonStr: string, mode: 'replace' | 'merge'): Promise<{ success: boolean; message: string; stats: any }> =>
    ipcRenderer.invoke('import-data', jsonStr, mode),

  // Test data
  addTestData: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('add-test-data')
})

declare global {
  interface Window {
    electronAPI: {
      getRecords: (ledgerId?: number) => Promise<Record[]>
      addRecord: (record: Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }) => Promise<number>
      updateRecord: (id: number, record: Partial<Omit<Record, 'id' | 'updatedAt'> & { createdAt?: string }>) => Promise<void>
      deleteRecord: (id: number) => Promise<void>
      getAccounts: (ledgerId?: number) => Promise<Account[]>
      addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
      updateAccount: (id: number, account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>
      deleteAccount: (id: number) => Promise<void>
      getCategories: (ledgerId?: number) => Promise<Category[]>
      addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
      updateCategory: (id: number, category: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>
      deleteCategory: (id: number) => Promise<void>
      getBudgets: (ledgerId?: number) => Promise<Budget[]>
      addBudget: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
      updateBudget: (id: number, budget: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>
      deleteBudget: (id: number) => Promise<void>
      getLedgers: () => Promise<Ledger[]>
      addLedger: (ledger: Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
      updateLedger: (id: number, ledger: Partial<Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>
      deleteLedger: (id: number) => Promise<void>
      mergeLedger: (sourceId: number, targetId: number) => Promise<{ mergedCategories: number; mergedAccounts: number; mergedRecords: number }>
      getLedgerStats: () => Promise<Array<{ id: number; records: number; accounts: number; categories: number }>>
      login: (username: string, password: string) => Promise<User | null>
      register: (username: string, password: string, nickname?: string) => Promise<User>
      updateUser: (id: number, data: Partial<User>) => Promise<void>
      getCurrentUser: () => Promise<User | null>
      getLogs: (limit?: number) => Promise<Log[]>
      addLog: (action: string, target: string, detail?: string) => Promise<number>
      clearLogs: () => Promise<void>
      transferBetweenAccounts: (sourceAccountId: number, targetAccountId: number, amount: number, note?: string, fee?: number) => Promise<number>
      refundRecord: (originalRecordId: number, refundAmount: number, shippingFee: number, note?: string) => Promise<number>
      syncData: () => Promise<{ success: boolean; message: string; lastSyncAt: string }>
      getSyncStatus: () => Promise<{ lastSyncAt: string | null; localDataSize: number }>
      exportData: () => Promise<string>
      exportCSV: () => Promise<string>
      importData: (jsonStr: string, mode: 'replace' | 'merge') => Promise<{ success: boolean; message: string; stats: any }>
      addTestData: () => Promise<{ success: boolean; message: string }>
    }
  }
}
