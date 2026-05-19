import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: './src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-chart': ['recharts'],
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
