import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { store } from './store'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#667eea'
          }
        }}
      >
        <App />
        <Analytics />
      </ConfigProvider>
    </Provider>
  </React.StrictMode>
)
