/**
 * 快速打包 Windows EXE（便携版）
 * 使用本地 node_modules/electron/dist 运行时，无需网络下载
 *
 * 用法: npm run pack:exe  或  node scripts/pack-exe.js
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RELEASE = path.join(ROOT, 'release', 'win-unpacked')
const RESOURCES = path.join(RELEASE, 'resources')
const ASAR_OUT = path.join(RESOURCES, 'app.asar')
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist')
const TEMP = path.join(ROOT, 'temp_asar')

console.log('Lingxi Accounting - Windows EXE Build\n')

// Step 0: Check Electron runtime
if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  console.error('ERROR: Electron runtime not found at node_modules\\electron\\dist')
  console.error('Please run: npm install')
  process.exit(1)
}

// Step 1: Build web + electron
console.log('[1/4] Building project...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

// Step 2: Copy Electron runtime
console.log('\n[2/4] Copying Electron runtime...')
fs.mkdirSync(RELEASE, { recursive: true })
copyDir(ELECTRON_DIST, RELEASE)

// Rename electron.exe to app name
const electronExe = path.join(RELEASE, 'electron.exe')
const appExe = path.join(RELEASE, '灵析记账.exe')
if (fs.existsSync(electronExe)) {
  try { fs.unlinkSync(appExe) } catch {}
  fs.renameSync(electronExe, appExe)
}

// Step 3: Pack app.asar
console.log('\n[3/4] Packing app.asar...')
if (fs.existsSync(TEMP)) fs.rmSync(TEMP, { recursive: true })
fs.mkdirSync(TEMP, { recursive: true })
fs.mkdirSync(RESOURCES, { recursive: true })

copyDir(path.join(ROOT, 'dist'), path.join(TEMP, 'dist'))
copyDir(path.join(ROOT, 'node_modules'), path.join(TEMP, 'node_modules'))
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(TEMP, 'package.json'))

execSync(`npx asar pack "${TEMP}" "${ASAR_OUT}"`, { cwd: ROOT, stdio: 'inherit' })
fs.rmSync(TEMP, { recursive: true })

// Step 4: Verify
const asarMB = (fs.statSync(ASAR_OUT).size / 1024 / 1024).toFixed(0)
const exeExists = fs.existsSync(appExe)

console.log(`\n[4/4] Build complete`)
console.log(`  app.asar: ${asarMB} MB`)
console.log(`  Runtime: ${exeExists ? 'OK' : 'MISSING'}`)
console.log(`  Output: ${RELEASE}`)
if (exeExists) console.log(`  Run: ${appExe}`)

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) { copyDir(s, d) }
    else {
      try { fs.copyFileSync(s, d) } catch {}
    }
  }
}
