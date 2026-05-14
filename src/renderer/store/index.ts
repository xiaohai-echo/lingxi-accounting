import { configureStore } from '@reduxjs/toolkit'
import { recordsSlice } from './slices/recordsSlice'
import { accountsSlice } from './slices/accountsSlice'
import { categoriesSlice } from './slices/categoriesSlice'
import { budgetsSlice } from './slices/budgetsSlice'
import { ledgersSlice } from './slices/ledgersSlice'
import logsReducer from './slices/logsSlice'
import userReducer from './slices/userSlice'

export const store = configureStore({
  reducer: {
    records: recordsSlice.reducer,
    accounts: accountsSlice.reducer,
    categories: categoriesSlice.reducer,
    budgets: budgetsSlice.reducer,
    ledgers: ledgersSlice.reducer,
    logs: logsReducer,
    user: userReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
