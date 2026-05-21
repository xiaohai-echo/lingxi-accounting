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
    const api = getApi()
    const id = await api.addRecord(record)
    const typeLabel = record.type === 'income' ? '收入' : record.type === 'expense' ? '支出' : '转账'
    // Resolve names from IDs for detailed logging
    const cats = await api.getCategories()
    const accts = await api.getAccounts()
    const catName = cats.find((c: any) => c.id === record.categoryId)?.name
    const accName = accts.find((a: any) => a.id === record.accountId)?.name
    const detail = [catName, accName, record.note].filter(Boolean).join(' | ')
    api.addLog('add_record', `${typeLabel} ¥${record.amount.toFixed(2)}`, detail || undefined)
    return { ...record, id, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const updateRecord = createAsyncThunk(
  'records/updateRecord',
  async ({ id, record }: { id: number; record: Partial<Omit<Record, 'id' | 'updatedAt'> & { createdAt?: string }> }) => {
    await getApi().updateRecord(id, record)
    const changes: string[] = []
    if (record.amount !== undefined) changes.push(`金额→¥${record.amount.toFixed(2)}`)
    if (record.type !== undefined) changes.push(`类型→${record.type === 'income' ? '收入' : record.type === 'expense' ? '支出' : '转账'}`)
    if (record.categoryId !== undefined) {
      const cats = await getApi().getCategories()
      const catName = cats.find((c: any) => c.id === record.categoryId)?.name
      if (catName) changes.push(`类别→${catName}`)
    }
    if (record.date !== undefined) changes.push(`日期→${record.date}`)
    if (record.note !== undefined) changes.push(`备注→${record.note}`)
    getApi().addLog('edit_record', `编辑记录 #${id}`, changes.join(', ') || undefined)
    return { id, ...record }
  }
)

export const deleteRecord = createAsyncThunk(
  'records/deleteRecord',
  async (id: number) => {
    const api = getApi()
    const recs = await api.getRecords()
    const rec = recs.find((r: any) => r.id === id)
    const typeLabel = rec?.type === 'income' ? '收入' : rec?.type === 'expense' ? '支出' : '转账'
    const detail = rec ? `${typeLabel} ¥${rec.amount.toFixed(2)}${rec.note ? ' ' + rec.note : ''}` : undefined
    await api.deleteRecord(id)
    api.addLog('delete_record', `删除记录 #${id}`, detail)
    return id
  }
)

export const transferRecord = createAsyncThunk(
  'records/transferRecord',
  async ({ sourceAccountId, targetAccountId, amount, note, fee, transferType }: { sourceAccountId: number; targetAccountId: number; amount: number; note?: string; fee?: number; transferType?: string }) => {
    const api = getApi()
    const id = await api.transferBetweenAccounts(sourceAccountId, targetAccountId, amount, note, fee)
    const typeLabel = transferType === 'withdraw' ? '提现' : transferType === 'recharge' ? '充值' : '转账'
    const accts = await api.getAccounts()
    const srcAcc = accts.find((a: any) => a.id === sourceAccountId)
    const tgtAcc = accts.find((a: any) => a.id === targetAccountId)
    const srcName = (srcAcc?.name || '') + (srcAcc?.cardNo ? `尾号${srcAcc.cardNo}` : '')
    const tgtName = (tgtAcc?.name || '') + (tgtAcc?.cardNo ? `尾号${tgtAcc.cardNo}` : '')
    const detail = [srcName, tgtName ? '→' : '', tgtName, note, fee ? `手续费¥${fee.toFixed(2)}` : ''].filter(Boolean).join(' ')
    api.addLog('transfer', `账户${typeLabel} ¥${amount.toFixed(2)}`, detail || undefined)
    return { id, amount, type: 'transfer' as const, accountId: sourceAccountId, targetAccountId, fee, note, date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const refundRecordThunk = createAsyncThunk(
  'records/refundRecord',
  async ({ originalRecordId, refundAmount, shippingFee, note }: { originalRecordId: number; refundAmount: number; shippingFee: number; note?: string }) => {
    const result = await getApi().refundRecord(originalRecordId, refundAmount, shippingFee, note)
    const api2 = getApi()
    const recs2 = await api2.getRecords()
    const orig = recs2.find((r: any) => r.id === originalRecordId)
    const origNote = orig?.note || ''
    const detail = shippingFee ? `退款 ¥${refundAmount.toFixed(2)} 运费 ¥${shippingFee.toFixed(2)}` : `退款 ¥${refundAmount.toFixed(2)}`
    const summary = origNote ? `${detail} | ${origNote}` : detail
    api2.addLog('refund_record', `退款记录 #${originalRecordId} ¥${refundAmount.toFixed(2)}`, summary)
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
