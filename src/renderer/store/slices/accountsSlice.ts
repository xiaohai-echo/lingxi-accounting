import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Account } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface AccountsState {
  items: Account[]
  loading: boolean
  error: string | null
}

const initialState: AccountsState = {
  items: [],
  loading: false,
  error: null
}

export const fetchAccounts = createAsyncThunk(
  'accounts/fetchAccounts',
  async (ledgerId?: number) => {
    const accounts = await getApi().getAccounts(ledgerId)
    return accounts
  }
)

export const addAccount = createAsyncThunk(
  'accounts/addAccount',
  async (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = await getApi().addAccount(account)
    getApi().addLog('add_account', `新增账户 ${account.name}`, `类型: ${account.type} 余额: ¥${account.balance.toFixed(2)}`)
    return { ...account, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const updateAccount = createAsyncThunk(
  'accounts/updateAccount',
  async ({ id, account }: { id: number; account: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>> }) => {
    await getApi().updateAccount(id, account)
    const changes: string[] = []
    if (account.name !== undefined) changes.push(`名称→${account.name}`)
    if (account.balance !== undefined) changes.push(`余额→¥${account.balance.toFixed(2)}`)
    if (account.type !== undefined) changes.push(`类型→${account.type}`)
    getApi().addLog('edit_account', `编辑账户 #${id}`, changes.join(', ') || account.name || undefined)
    return { id, ...account }
  }
)

export const deleteAccount = createAsyncThunk(
  'accounts/deleteAccount',
  async (id: number) => {
    const api = getApi()
    const accs = await api.getAccounts()
    const acc = accs.find((a: any) => a.id === id)
    await api.deleteAccount(id)
    api.addLog('delete_account', `删除账户 ${acc?.name || '#' + id}`, acc ? `类型: ${acc.type} 余额: ¥${acc.balance.toFixed(2)}` : undefined)
    return id
  }
)

export const accountsSlice = createSlice({
  name: 'accounts',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccounts.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.map((a: Account) => ({ ...a }))
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch accounts'
      })
      .addCase(addAccount.fulfilled, (state, action) => {
        state.items.push({ ...action.payload } as Account)
      })
      .addCase(updateAccount.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload }
        }
      })
      .addCase(deleteAccount.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload)
      })
  }
})
