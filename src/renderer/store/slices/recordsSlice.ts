import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Record } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface RecordsState {
  items: Record[]
  loading: boolean
  error: string | null
}

const initialState: RecordsState = {
  items: [],
  loading: false,
  error: null
}

export const fetchRecords = createAsyncThunk(
  'records/fetchRecords',
  async (ledgerId?: number) => {
    const records = await getApi().getRecords(ledgerId)
    return records
  }
)

export const addRecord = createAsyncThunk(
  'records/addRecord',
  async (record: Omit<Record, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }) => {
    const id = await getApi().addRecord(record)
    const typeLabel = record.type === 'income' ? '收入' : record.type === 'expense' ? '支出' : '转账'
    getApi().addLog('add_record', `${typeLabel}记录 ¥${record.amount.toFixed(2)}`, record.note || undefined)
    return { ...record, id, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const updateRecord = createAsyncThunk(
  'records/updateRecord',
  async ({ id, record }: { id: number; record: Partial<Omit<Record, 'id' | 'updatedAt'> & { createdAt?: string }> }) => {
    await getApi().updateRecord(id, record)
    getApi().addLog('edit_record', `编辑记录 #${id}`, record.note || undefined)
    return { id, ...record }
  }
)

export const deleteRecord = createAsyncThunk(
  'records/deleteRecord',
  async (id: number) => {
    await getApi().deleteRecord(id)
    getApi().addLog('delete_record', `删除记录 #${id}`)
    return id
  }
)

export const transferRecord = createAsyncThunk(
  'records/transferRecord',
  async ({ sourceAccountId, targetAccountId, amount, note, fee }: { sourceAccountId: number; targetAccountId: number; amount: number; note?: string; fee?: number }) => {
    const id = await getApi().transferBetweenAccounts(sourceAccountId, targetAccountId, amount, note, fee)
    const detail = fee ? `金额 ¥${amount.toFixed(2)} 手续费 ¥${fee.toFixed(2)}` : `金额 ¥${amount.toFixed(2)}`
    getApi().addLog('transfer', `账户转账 ¥${amount.toFixed(2)}`, detail)
    return { id, amount, type: 'transfer' as const, accountId: sourceAccountId, targetAccountId, fee, note, date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const refundRecordThunk = createAsyncThunk(
  'records/refundRecord',
  async ({ originalRecordId, refundAmount, shippingFee, note }: { originalRecordId: number; refundAmount: number; shippingFee: number; note?: string }) => {
    const result = await getApi().refundRecord(originalRecordId, refundAmount, shippingFee, note)
    const detail = shippingFee ? `退款 ¥${refundAmount.toFixed(2)} 运费 ¥${shippingFee.toFixed(2)}` : `退款 ¥${refundAmount.toFixed(2)}`
    getApi().addLog('refund_record', `退款记录 #${originalRecordId}`, detail)
    return result
  }
)

export const recordsSlice = createSlice({
  name: 'records',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecords.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchRecords.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.map((r: Record) => ({ ...r }))
      })
      .addCase(fetchRecords.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch records'
      })
      .addCase(addRecord.fulfilled, (state, action) => {
        state.items.unshift({ ...action.payload } as Record)
      })
      .addCase(updateRecord.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload }
        }
      })
      .addCase(deleteRecord.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload)
      })
      .addCase(transferRecord.fulfilled, (state, action) => {
        state.items.unshift({ ...action.payload } as any)
      })
      .addCase(refundRecordThunk.fulfilled, (state) => {
        state.loading = true
      })
  }
})
