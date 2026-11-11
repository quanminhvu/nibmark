#!/usr/bin/env node
// Desktop regressions on a disposable profile. Run npm run build first.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TIMEOUT_MS = 45_000
const PORT = 9300 + Math.floor(Math.random() * 500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const binary = createRequire(import.meta.url)('electron')
if (!binary || !existsSync(binary)) {
  console.error('✗ Electron binary not found. Run npm ci first.')
  process.exit(1)
}

// Always use a disposable profile; never read or mutate the installed app's data.
const profile = mkdtempSync(join(tmpdir(), 'nibmark-smoke-'))
const output = []
const args = [process.cwd(), `--remote-debugging-port=${PORT}`]
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
process.on('uncaughtException', (err) => fail(err.stack ?? err.message))
process.on('unhandledRejection', (err) => fail(String(err)))
await call('Runtime.enable')
await call('Emulation.setFocusEmulationEnabled',{enabled:true})

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


async function check(name, expression) {
 const ok = await evaluate(expression)
 console.log(`${ok ? '✓' : '✗'} ${name}`)
 if (!ok) failedChecks++
}
async function create(label, name) {
 await evaluate(`document.querySelector('[title="${label}"]').click()`)
 await sleep(100)
 await call('Input.insertText', {text:name})
 await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
 await sleep(300)
}
await check('tags creation available without existing tags', `!!document.querySelector('[title="New tag"]')`)
await create('New status', 'In Review')
await check('custom status appears in sidebar', `Array.from(document.querySelectorAll('.side-label')).some(e=>e.textContent==='In Review')`)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',metaKey:true,ctrlKey:true,bubbles:true}))`)
await sleep(300)
await check('new note inherits custom status and selector supports it', `document.querySelector('.note-meta select').selectedOptions[0].textContent.trim()==='In Review'`)
await create('New status', 'in review')
await check('status creation deduplicates case-insensitively', `Array.from(document.querySelectorAll('.side-label')).filter(e=>e.textContent.toLowerCase()==='in review').length===1`)
await create('New tag', 'release-test')
await check('new tag appears', `Array.from(document.querySelectorAll('.side-label')).some(e=>e.textContent==='release-test')`)
await create('New tag', 'release-test')
await check('tag creation deduplicates', `Array.from(document.querySelectorAll('.side-label')).filter(e=>e.textContent==='release-test').length===1`)
await sleep(800)
await call('Page.reload')
await sleep(1800)
await check('custom statuses and tags survive reload', `Array.from(document.querySelectorAll('.side-label')).some(e=>e.textContent==='In Review') && Array.from(document.querySelectorAll('.side-label')).some(e=>e.textContent==='release-test')`)

async function dropRow(sourceName,targetName) {
 await evaluate(`(() => {const labels=[...document.querySelectorAll('.side-label')];const from=labels.find(e=>e.textContent==='${sourceName}').closest('.side-row');const to=labels.find(e=>e.textContent==='${targetName}').closest('.side-row');const data=new DataTransfer();from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));const r=to.getBoundingClientRect();to.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data,clientY:r.top+2,clientX:r.left+10}))})()`)
 await sleep(150)
}
await dropRow('Dropped','Active')
await check('status drag changes order', `Array.from(document.querySelectorAll('.side-row')).filter(e=>e.draggable).map(e=>e.textContent)[0].includes('Dropped')`)
await create('New tag','aaa')
await dropRow('release-test','aaa')
await check('tag drag changes order', `Array.from(document.querySelectorAll('.tag-dot')).map(e=>e.closest('.side-row').querySelector('.side-label').textContent).join(',')==='release-test,aaa'`)
await sleep(600);await call('Page.reload');await sleep(1500)
await check('status and tag order survives reload', `Array.from(document.querySelectorAll('.side-row')).filter(e=>e.draggable).map(e=>e.textContent)[0].includes('Dropped') && document.querySelector('.tag-dot').closest('.side-row').textContent.includes('release-test')`)
async function newNote(title,body) {
 await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',metaKey:true,ctrlKey:true,bubbles:true}))`);await sleep(200)
 await evaluate(`(() => {const t=document.querySelector('.note-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,${JSON.stringify(title)});t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cm-content').focus()})()`)
 if (body) await call('Input.insertText',{text:body})
 await sleep(300)
}
await newNote('Target note','Destination')
await newNote('Source note','[[Target')
await sleep(400)
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
await sleep(300)
await evaluate(`Array.from(document.querySelectorAll('.note-item-name')).find(e=>e.textContent==='Target note').click()`);await sleep(200)
await check('backlinks list source note', `document.querySelector('.backlinks-list').textContent.includes('Source note') && document.querySelector('.backlinks-count').textContent==='1'`)
await evaluate(`document.querySelector('.backlinks-list button').click()`);await sleep(200)
await check('backlink opens source', `document.querySelector('.note-title').value==='Source note'`)
const href = await evaluate(`document.querySelector('.cm-content').textContent.match(/nibmark:\\/\\/note\\/[A-Za-z0-9_-]+/)[0]`)
await newNote('Code only','```markdown\n[ignored]('+href+')\n```\n\n`[ignored]('+href+')`\n\n<!-- <a href="'+href+'">ignored</a> -->')
await evaluate(`Array.from(document.querySelectorAll('.note-item-name')).find(e=>e.textContent==='Target note').click()`);await sleep(200)
await check('backlinks ignore code and commented links', `document.querySelector('.backlinks-count').textContent==='1'`)
const longBody = '# Top\n\n' + Array.from({length:4},(_,i)=>'Paragraph '+i+'\n\n').join('') + '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4S8AAAAASUVORK5CYII=" height="900" width="200">\n\n## After image\n\n' + Array.from({length:70},(_,i)=>'## Heading '+i+'\n\nText after heading '+i+'\n\n').join('')
await newNote('Scroll mapping',longBody)
await evaluate(`document.querySelector('[title="Side by side (Cmd/Ctrl+P)"]').click()`);await sleep(500)
await check('source anchors survive rendering including images', `document.querySelectorAll('.note-preview [data-source-line]').length>70`)
await evaluate(`document.querySelector('.cm-scroller').scrollTop=0`);await sleep(300)
await evaluate(`(() => {const e=document.querySelector('.cm-scroller'),line=[...document.querySelectorAll('.cm-line')].find(e=>e.textContent==='## After image');window.testEditorY=line.getBoundingClientRect().top-e.getBoundingClientRect().top+e.scrollTop;const p=document.querySelector('.note-preview'),h=[...p.querySelectorAll('h2')].find(e=>e.textContent==='After image');window.testPreviewY=h.getBoundingClientRect().top-p.getBoundingClientRect().top+p.scrollTop;e.scrollTop=window.testEditorY})()`)
await sleep(300)
await check('editor scroll aligns same heading after tall image', `Math.abs(document.querySelector('.note-preview').scrollTop-window.testPreviewY)<4`)
await evaluate(`document.querySelector('.cm-scroller').scrollTop=0`);await sleep(200)
await evaluate(`document.querySelector('.note-preview').scrollTop=window.testPreviewY`);await sleep(300)
await check('preview scroll maps back to same source line', `Math.abs(document.querySelector('.cm-scroller').scrollTop-window.testEditorY)<4`)
await evaluate(`document.querySelector('.note-preview img').height=1400`);await sleep(350)
await check('late media resize remeasures corresponding blocks', `(() => {const p=document.querySelector('.note-preview'),h=[...p.querySelectorAll('h2')].find(e=>e.textContent==='After image');return Math.abs(h.getBoundingClientRect().top-p.getBoundingClientRect().top)<5})()`)
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
