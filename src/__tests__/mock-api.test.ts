import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Mock API — Records CRUD', () => {
  let api: ReturnType<typeof import('../renderer/api/mock').getApi>

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    const mod = await import('../renderer/api/mock')
    api = mod.getApi()
    await api.login('demo', 'demo123')
  })

  it('getLedgers returns a default ledger', async () => {
    const ledgers = await api.getLedgers()
    expect(ledgers.length).toBeGreaterThanOrEqual(1)
    expect(ledgers[0].name).toBe('日常账本')
  })

  it('getCategories returns both expense and income categories', async () => {
    const categories = await api.getCategories(1)
    const expenses = categories.filter(c => c.type === 'expense')
    const incomes = categories.filter(c => c.type === 'income')
    expect(expenses.length).toBeGreaterThan(0)
    expect(incomes.length).toBeGreaterThan(0)
  })

  it('getAccounts returns default accounts with ledger filter', async () => {
    const accounts = await api.getAccounts(1)
    expect(accounts.length).toBeGreaterThan(0)
    accounts.forEach(a => {
      expect(a.name).toBeTruthy()
      expect(typeof a.balance).toBe('number')
    })
  })

  it('addRecord creates a record and returns an id', async () => {
    const categories = await api.getCategories(1)
    const accounts = await api.getAccounts(1)
    const expenseCat = categories.find(c => c.type === 'expense')!

    const id = await api.addRecord({
      amount: 99.5, type: 'expense',
      categoryId: expenseCat.id!, accountId: accounts[0].id!,
      date: '2026-05-14', note: '测试午餐', ledgerId: 1,
      isDeleted: 0
    })
    expect(id).toBeGreaterThan(0)

    const records = await api.getRecords(1)
    const created = records.find(r => r.id === id)
    expect(created).toBeTruthy()
    expect(created!.amount).toBe(99.5)
    expect(created!.note).toBe('测试午餐')
  })

  it('deleteRecord soft-deletes a record', async () => {
    const categories = await api.getCategories(1)
    const accounts = await api.getAccounts(1)
    const id = await api.addRecord({
      amount: 50, type: 'expense',
      categoryId: categories[0].id!, accountId: accounts[0].id!,
      date: '2026-05-14', note: '待删除', ledgerId: 1,
      isDeleted: 0
    })

    await api.deleteRecord(id)
    const records = await api.getRecords(1)
    expect(records.find(r => r.id === id)).toBeUndefined()
  })

  it('updateRecord modifies record fields', async () => {
    const categories = await api.getCategories(1)
    const accounts = await api.getAccounts(1)
    const id = await api.addRecord({
      amount: 100, type: 'expense',
      categoryId: categories[0].id!, accountId: accounts[0].id!,
      date: '2026-05-14', note: '原始备注', ledgerId: 1,
      isDeleted: 0
    })

    await api.updateRecord(id, { note: '已修改', amount: 150 })
    const records = await api.getRecords(1)
    const updated = records.find(r => r.id === id)
    expect(updated).toBeTruthy()
    expect(updated!.note).toBe('已修改')
    expect(updated!.amount).toBe(150)
  })
})

describe('Mock API — Users & Auth', () => {
  let api: ReturnType<typeof import('../renderer/api/mock').getApi>

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    const mod = await import('../renderer/api/mock')
    api = mod.getApi()
  })

  it('login with demo credentials succeeds', async () => {
    const user = await api.login('demo', 'demo123')
    expect(user).toBeTruthy()
    expect(user!.username).toBe('demo')
  })

  it('login with wrong password returns null', async () => {
    const user = await api.login('demo', 'wrongpassword')
    expect(user).toBeNull()
  })

  it('register creates a new user', async () => {
    const user = await api.register('newuser', 'pass1234', '新用户')
    expect(user).toBeTruthy()
    expect(user.username).toBe('newuser')
    expect(user.nickname).toBe('新用户')
  })

  it('register with duplicate username rejects', async () => {
    await expect(api.register('demo', 'anypassword')).rejects.toThrow('用户名已存在')
  })

  it('login after register works with correct password', async () => {
    await api.register('testuser2', 'mypassword')
    const user = await api.login('testuser2', 'mypassword')
    expect(user).toBeTruthy()
    expect(user!.username).toBe('testuser2')
  })
})

describe('Mock API — Budgets', () => {
  let api: ReturnType<typeof import('../renderer/api/mock').getApi>

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    const mod = await import('../renderer/api/mock')
    api = mod.getApi()
  })

  it('getBudgets returns empty initially for new user', async () => {
    await api.login('demo', 'demo123')
    const budgets = await api.getBudgets(1)
    expect(Array.isArray(budgets)).toBe(true)
  })

  it('addBudget and getBudgets round-trip', async () => {
    await api.login('demo', 'demo123')
    const categories = await api.getCategories(1)
    const expenseCat = categories.find(c => c.type === 'expense')!
    const beforeCount = (await api.getBudgets(1)).length

    const id = await api.addBudget({
      categoryId: expenseCat.id!, amount: 1000,
      period: 'monthly', year: 2026, month: 5, ledgerId: 1
    })
    expect(id).toBeGreaterThan(0)

    const budgets = await api.getBudgets(1)
    expect(budgets.length).toBe(beforeCount + 1)
    const created = budgets.find(b => b.id === id)
    expect(created).toBeTruthy()
    expect(created!.amount).toBe(1000)
    expect(created!.period).toBe('monthly')
  })
})

describe('Mock API — Transfers', () => {
  let api: ReturnType<typeof import('../renderer/api/mock').getApi>

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    const mod = await import('../renderer/api/mock')
    api = mod.getApi()
    await api.login('demo', 'demo123')
  })

  it('transferBetweenAccounts moves balance between accounts', async () => {
    const accountsBefore = await api.getAccounts(1)
    const source = accountsBefore[0]
    const target = accountsBefore[1]
    const sourceBefore = source.balance
    const targetBefore = target.balance

    const id = await api.transferBetweenAccounts(source.id!, target.id!, 100, '测试转账')
    expect(id).toBeGreaterThan(0)

    const accountsAfter = await api.getAccounts(1)
    const sourceAfter = accountsAfter.find(a => a.id === source.id)!
    const targetAfter = accountsAfter.find(a => a.id === target.id)!

    expect(sourceAfter.balance).toBe(sourceBefore - 100)
    expect(targetAfter.balance).toBe(targetBefore + 100)
  })
})
