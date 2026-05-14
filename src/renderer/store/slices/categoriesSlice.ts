import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Category } from '../../../main/database/schema'
import { getApi } from '../../api/mock'

interface CategoriesState {
  items: Category[]
  loading: boolean
  error: string | null
}

const initialState: CategoriesState = {
  items: [],
  loading: false,
  error: null
}

export const fetchCategories = createAsyncThunk(
  'categories/fetchCategories',
  async (ledgerId?: number) => {
    const categories = await getApi().getCategories(ledgerId)
    return categories
  }
)

export const addCategory = createAsyncThunk(
  'categories/addCategory',
  async (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = await getApi().addCategory(category)
    getApi().addLog('add_category', `新增类别 ${category.name}`, `类型: ${category.type}`)
    return { ...category, id }
  }
)

export const updateCategory = createAsyncThunk(
  'categories/updateCategory',
  async ({ id, category }: { id: number; category: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> }) => {
    await getApi().updateCategory(id, category)
    getApi().addLog('edit_category', `编辑类别 #${id}`, category.name || undefined)
    return { id, ...category }
  }
)

export const deleteCategory = createAsyncThunk(
  'categories/deleteCategory',
  async (id: number) => {
    await getApi().deleteCategory(id)
    getApi().addLog('delete_category', `删除类别 #${id}`)
    return id
  }
)

export const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.map((c: Category) => ({ ...c }))
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch categories'
      })
      .addCase(addCategory.fulfilled, (state, action) => {
        state.items.push({ ...action.payload } as Category)
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id)
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload }
        }
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload)
      })
  }
})
