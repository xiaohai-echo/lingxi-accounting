import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Log } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface LogsState {
  items: Log[]
  loading: boolean
  error: string | null
}

const initialState: LogsState = {
  items: [],
  loading: false,
  error: null
}

export const fetchLogs = createAsyncThunk(
  'logs/fetchLogs',
  async (limit?: number) => {
    const logs = await getApi().getLogs(limit)
    return logs
  }
)

export const addLog = createAsyncThunk(
  'logs/addLog',
  async ({ action, target, detail }: { action: string; target: string; detail?: string }) => {
    const id = await getApi().addLog(action, target, detail)
    return { id, action, target, detail, createdAt: new Date().toISOString() } as Log
  }
)

export const clearLogs = createAsyncThunk(
  'logs/clearLogs',
  async () => {
    await getApi().clearLogs()
  }
)

const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLogs.pending, (state) => { state.loading = true })
      .addCase(fetchLogs.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchLogs.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch logs'
      })
      .addCase(addLog.fulfilled, (state, action) => {
        state.items.unshift(action.payload)
      })
      .addCase(clearLogs.fulfilled, (state) => {
        state.items = []
      })
  }
})

export default logsSlice.reducer
