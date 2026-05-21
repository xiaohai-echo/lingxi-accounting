import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Budget } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface BudgetsState {
  items: Budget[]
  loading: boolean
  error: string | null
}

const initialState: BudgetsState = {
  items: [],
  loading: false,
  error: null
}

export const fetchBudgets = createAsyncThunk(
  'budgets/fetchBudgets',
  async (ledgerId?: number) => {
    const budgets = await getApi().getBudgets(ledgerId)
    return budgets
  }
)

export const addBudget = createAsyncThunk(
  'budgets/addBudget',
  async (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = await getApi().addBudget(budget)
    getApi().addLog('add_budget', `新增预算 ¥${budget.amount.toFixed(2)}`)
    const result: Record<string, any> = {
      ...budget,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    if (result.month == null) delete result.month
    if (result.quarter == null) delete result.quarter
    return result as Budget
  }
)

export const updateBudget = createAsyncThunk(
  'budgets/updateBudget',
  async ({ id, budget }: { id: number; budget: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>> }) => {
    await getApi().updateBudget(id, budget)
    const changes: string[] = []
    if (budget.amount !== undefined) changes.push(`金额→¥${budget.amount.toFixed(2)}`)
    if (budget.period !== undefined) changes.push(`周期→${budget.period}`)
    getApi().addLog('edit_budget', `编辑预算 #${id}`, changes.join(', ') || undefined)
    return { id, ...budget }
  }
)

export const deleteBudget = createAsyncThunk(
  'budgets/deleteBudget',
  async (id: number) => {
    const api = getApi()
    const buds = await api.getBudgets()
    const bud = buds.find((b: any) => b.id === id)
    await api.deleteBudget(id)
    api.addLog('delete_budget', `删除预算 ${bud ? `¥${bud.amount.toFixed(2)}` : '#' + id}`, bud ? `${bud.period} ${bud.year}年` : undefined)
    return id
  }
)

export const budgetsSlice = createSlice({
  name: 'budgets',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBudgets.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchBudgets.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.map((b: Budget) => ({ ...b }))
      })
      .addCase(fetchBudgets.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch budgets'
      })
      .addCase(addBudget.fulfilled, (state, action) => {
        const newBudget = { ...action.payload } as Budget
        state.items.push(newBudget)
      })
      .addCase(updateBudget.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload }
        }
      })
      .addCase(deleteBudget.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload)
      })
  }
})
