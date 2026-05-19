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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('antd') || id.includes('@ant-design')) return 'vendor-antd'
            if (id.includes('recharts')) return 'vendor-chart'
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react'
            if (id.includes('react-redux') || id.includes('@reduxjs') || id.includes('redux')) return 'vendor-react'
          }
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
