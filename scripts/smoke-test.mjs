#!/usr/bin/env node
// Smoke test cho bản ĐÃ ĐÓNG GÓI: mở app trên một hồ sơ dữ liệu tạm và kiểm tra
// cửa sổ, giao diện và kênh IPC tới main process đều hoạt động.
//
//   node scripts/smoke-test.mjs [đường dẫn tới file chạy của app]
//
// Mặc định tìm trong dist/: mac-arm64 / mac / mac-universal, linux-unpacked, win-unpacked.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const TIMEOUT_MS = 45_000
const PORT = 9300 + Math.floor(Math.random() * 500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findBinary() {
  const arg = process.argv[2]
  if (arg) return resolve(arg)
  const candidates = [
    'dist/mac-arm64/Nibmark.app/Contents/MacOS/Nibmark',
    'dist/mac/Nibmark.app/Contents/MacOS/Nibmark',
    'dist/mac-universal/Nibmark.app/Contents/MacOS/Nibmark',
    'dist/linux-unpacked/nibmark',
    'dist/linux-arm64-unpacked/nibmark',
    'dist/win-unpacked/Nibmark.exe',
    'dist/win-arm64-unpacked/Nibmark.exe'
  ]
  return candidates.map((c) => resolve(c)).find(existsSync)
}

const binary = findBinary()
if (!binary || !existsSync(binary)) {
  console.error('✗ Packaged app not found. Run "npm run pack" first, or pass the path to the executable.')
  process.exit(1)
}

const profile = mkdtempSync(join(tmpdir(), 'nibmark-smoke-'))
const output = []
const args = [`--remote-debugging-port=${PORT}`]
if (process.platform === 'linux') args.push('--no-sandbox')
const app = spawn(binary, args, {
  env: { ...process.env, NIBMARK_USER_DATA: profile, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
app.stdout.on('data', (d) => output.push(String(d)))
app.stderr.on('data', (d) => output.push(String(d)))
let exited = null
app.on('exit', (code) => (exited = code))

function fail(message) {
  console.error(`✗ ${message}`)
  const log = output.join('').trim()
  if (log) console.error('--- app output ---\n' + log.slice(-4000))
  app.kill()
  rmSync(profile, { recursive: true, force: true })
  process.exit(1)
}

async function connect() {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    if (exited !== null) fail(`App exited early with code ${exited}`)
    if (/Uncaught Exception|Cannot find module|A JavaScript error occurred/i.test(output.join(''))) fail('Main process threw while starting')
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // chưa sẵn sàng
    }
    await sleep(300)
  }
  fail(`No window appeared within ${TIMEOUT_MS / 1000}s`)
}

const ws = new WebSocket(await connect())
await new Promise((ok, err) => ((ws.onopen = ok), (ws.onerror = err)))
let id = 0
const pending = new Map()
const consoleErrors = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg)
  if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
}
const call = (method, params = {}) =>
  new Promise((done) => {
    const n = ++id
    pending.set(n, done)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? 'evaluation failed')
  return res.result?.result?.value
}
await call('Runtime.enable')

const checks = [
  ['window shows the app', `new Promise(r => { const t = Date.now(); (function poll() { if (document.querySelector('.app .sidebar')) return r(true); if (Date.now() - t > 15000) return r(false); setTimeout(poll, 200) })() })`],
  ['preload bridge is available', `typeof window.nibmark?.settings?.get === 'function'`],
  ['main process answers IPC (settings)', `window.nibmark.settings.get().then(s => typeof s.backupEnabled === 'boolean')`],
  ['main process answers IPC (themes)', `window.nibmark.themes.list().then(t => Array.isArray(t))`],
  ['welcome note is created', `new Promise(r => setTimeout(() => r(document.querySelectorAll('.note-item').length > 0), 800))`],
  ['editor is mounted', `!!document.querySelector('.cm-content')`]
]

let failedChecks = 0
for (const [name, expr] of checks) {
  let ok = false
  try {
    ok = (await evaluate(expr)) === true
  } catch (err) {
    console.error(`  ${err.message}`)
  }
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failedChecks++
}
if (consoleErrors.length) {
  failedChecks++
  console.error('✗ uncaught errors in the window:\n  ' + consoleErrors.join('\n  '))
}

ws.close()
app.kill()
await sleep(500)
rmSync(profile, { recursive: true, force: true })
if (failedChecks) fail(`${failedChecks} check(s) failed`)
console.log('✓ smoke test passed')
