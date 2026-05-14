import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.expensetracker.app',
  appName: '灵析记账',
  webDir: 'dist/renderer',
  bundledWebRuntime: false,
  server: {
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#141414'
  }
}

export default config
