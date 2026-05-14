import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import type { User } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface UserState {
  currentUser: User | null
  isLoggedIn: boolean
  loading: boolean
  error: string | null
}

const initialState: UserState = {
  currentUser: null,
  isLoggedIn: false,
  loading: true,
  error: null
}

export const checkAuth = createAsyncThunk<User | null>(
  'user/checkAuth',
  async () => {
    const api = getApi()
    return await api.getCurrentUser()
  }
)

export const loginUser = createAsyncThunk<User, { username: string; password: string }>(
  'user/login',
  async ({ username, password }, { rejectWithValue }) => {
    const api = getApi()
    const user = await api.login(username, password)
    if (!user) return rejectWithValue('用户名或密码错误') as any
    return user
  }
)

export const registerUser = createAsyncThunk<User, { username: string; password: string; nickname?: string }>(
  'user/register',
  async ({ username, password, nickname }, { rejectWithValue }) => {
    const api = getApi()
    try {
      const user = await api.register(username, password, nickname)
      return user
    } catch (e: any) {
      return rejectWithValue(e.message || '注册失败') as any
    }
  }
)

export const logoutUser = createAsyncThunk(
  'user/logout',
  async () => {
    localStorage.removeItem('userId')
  }
)

export const updateProfile = createAsyncThunk<void, { id: number; data: Partial<User> }>(
  'user/updateProfile',
  async ({ id, data }) => {
    const api = getApi()
    await api.updateUser(id, data)
  }
)

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkAuth.pending, (state) => {
        state.loading = true
      })
      .addCase(checkAuth.fulfilled, (state, action: PayloadAction<User | null>) => {
        state.loading = false
        if (action.payload) {
          state.currentUser = action.payload
          state.isLoggedIn = true
        } else {
          state.currentUser = null
          state.isLoggedIn = false
        }
        state.error = null
      })
      .addCase(checkAuth.rejected, (state) => {
        state.loading = false
        state.currentUser = null
        state.isLoggedIn = false
      })
      .addCase(loginUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action: PayloadAction<User>) => {
        state.loading = false
        state.currentUser = action.payload
        state.isLoggedIn = true
        state.error = null
        localStorage.setItem('userId', String(action.payload.id))
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) || '登录失败'
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(registerUser.fulfilled, (state, action: PayloadAction<User>) => {
        state.loading = false
        state.currentUser = action.payload
        state.isLoggedIn = true
        state.error = null
        localStorage.setItem('userId', String(action.payload.id))
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false
        state.error = (action.payload as string) || '注册失败'
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.currentUser = null
        state.isLoggedIn = false
        state.loading = false
        state.error = null
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        const { data } = action.meta.arg
        if (state.currentUser) {
          state.currentUser = { ...state.currentUser, ...data, updatedAt: new Date().toISOString() }
        }
      })
  }
})

export default userSlice.reducer
export const { clearError } = userSlice.actions
