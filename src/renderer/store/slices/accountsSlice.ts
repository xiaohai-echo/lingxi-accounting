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
    getApi().addLog('edit_account', `编辑账户 #${id}`, account.name || undefined)
    return { id, ...account }
  }
)

export const deleteAccount = createAsyncThunk(
  'accounts/deleteAccount',
  async (id: number) => {
    await getApi().deleteAccount(id)
    getApi().addLog('delete_account', `删除账户 #${id}`)
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
