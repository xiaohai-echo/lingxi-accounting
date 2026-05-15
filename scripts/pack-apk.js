/**
 * 快速打包 Android APK
 * 用法: npm run pack:apk
 * 需要: Android SDK + Java 17+
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RELEASE = path.join(ROOT, 'release')
const APK_SRC = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const APK_OUT = path.join(RELEASE, 'Lingxi-Accounting-v1.0.0-android-debug.apk')

const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Microsoft\\jdk-21.0.11.10-hotspot'
const ANDROID_HOME = process.env.ANDROID_HOME || 'D:\\Android\\Sdk'

console.log('灵析记账 Android APK 打包\n')
console.log(`  JAVA_HOME: ${JAVA_HOME}`)
console.log(`  ANDROID_HOME: ${ANDROID_HOME}\n`)

// Step 1: Build web + sync
console.log('[1/3] 构建 Web 并同步...')
execSync('npm run build:vite', { cwd: ROOT, stdio: 'inherit' })
execSync('npx cap sync android', { cwd: ROOT, stdio: 'inherit' })

// Step 2: Gradle build
console.log('\n[2/3] 编译 APK...')
const gradlew = path.join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
execSync(`"${gradlew}" assembleDebug`, {
  cwd: path.join(ROOT, 'android'),
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME, ANDROID_HOME,
    PATH: `${JAVA_HOME}\\bin;${ANDROID_HOME}\\cmdline-tools\\latest\\bin;${process.env.PATH}` }
})

// Step 3: Copy to release
console.log('\n[3/3] 复制 APK...')
if (!fs.existsSync(APK_SRC)) {
  console.error('APK 未找到，Gradle 构建可能失败')
  process.exit(1)
}
fs.mkdirSync(RELEASE, { recursive: true })
fs.copyFileSync(APK_SRC, APK_OUT)

const sizeMB = (fs.statSync(APK_OUT).size / 1024 / 1024).toFixed(1)
console.log(`\n打包完成`)
console.log(`  APK: ${sizeMB} MB`)
console.log(`  输出: ${APK_OUT}`)
