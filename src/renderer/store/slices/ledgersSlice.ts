import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Ledger } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface LedgersState {
  items: Ledger[]
  currentLedgerId: number | null
  loading: boolean
  error: string | null
}

const initialState: LedgersState = {
  items: [],
  currentLedgerId: null,
  loading: false,
  error: null
}

export const fetchLedgers = createAsyncThunk(
  'ledgers/fetchLedgers',
  async () => {
    const ledgers = await getApi().getLedgers()
    return ledgers
  }
)

export const addLedger = createAsyncThunk(
  'ledgers/addLedger',
  async (ledger: Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = await getApi().addLedger(ledger)
    return { ...ledger, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  }
)

export const updateLedger = createAsyncThunk(
  'ledgers/updateLedger',
  async ({ id, ledger }: { id: number; ledger: Partial<Omit<Ledger, 'id' | 'createdAt' | 'updatedAt'>> }) => {
    await getApi().updateLedger(id, ledger)
    return { id, ...ledger }
  }
)

export const deleteLedger = createAsyncThunk(
  'ledgers/deleteLedger',
  async (id: number) => {
    await getApi().deleteLedger(id)
    return id
  }
)

export const mergeLedger = createAsyncThunk(
  'ledgers/mergeLedger',
  async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
    const result = await getApi().mergeLedger(sourceId, targetId)
    return { sourceId, targetId, ...result }
  }
)

export const ledgersSlice = createSlice({
  name: 'ledgers',
  initialState,
  reducers: {
    setCurrentLedger: (state, action: PayloadAction<number>) => {
      state.currentLedgerId = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLedgers.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchLedgers.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.map((l: Ledger) => ({ ...l }))
        if (state.currentLedgerId === null && action.payload.length > 0) {
          const defaultLedger = action.payload.find((l: Ledger) => l.isDefault)
          state.currentLedgerId = defaultLedger?.id || action.payload[0].id || null
        }
      })
      .addCase(fetchLedgers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch ledgers'
      })
      .addCase(addLedger.fulfilled, (state, action) => {
        state.items.push({ ...action.payload } as Ledger)
      })
      .addCase(updateLedger.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload }
        }
      })
      .addCase(deleteLedger.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload)
        if (state.currentLedgerId === action.payload) {
          state.currentLedgerId = state.items.length > 0 ? (state.items[0].id || null) : null
        }
      })
      .addCase(mergeLedger.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload.sourceId)
        if (state.currentLedgerId === action.payload.sourceId) {
          state.currentLedgerId = action.payload.targetId
        }
      })
  }
})

export const { setCurrentLedger } = ledgersSlice.actions
