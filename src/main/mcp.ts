import { app, ipcMain } from 'electron'
import type { BrowserWindow, WebContents } from 'electron'
import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { createHash } from 'node:crypto'
import { chmodSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSettings } from './settings'

// MCP cho AI agent (Claude Code…): cầu nối resources/mcp.js nói MCP qua stdio với agent,
// rồi chuyển từng yêu cầu tới đây qua một socket nội bộ (chỉ tài khoản này trên máy kết nối được).
// Main chuyển tiếp sang cửa sổ chính, nơi giữ dữ liệu (PouchDB) và store.
//
// Giao thức socket: mỗi dòng một JSON
//   → { id, op: 'list' | 'call' | 'resources' | 'read', tool?, args?, client? }
//   ← { id, ok: true, result } | { id, ok: false, error }

const MAX_LINE = 4 * 1024 * 1024
const CALL_TIMEOUT_MS = 20_000

/** Đường dẫn socket; cầu nối mcp.js tính y hệt từ thư mục dữ liệu */
export function mcpSocketPath(userData: string): string {
  const hash = createHash('sha1').update(userData).digest('hex').slice(0, 12)
  if (process.platform === 'win32') return `\\\\.\\pipe\\nibmark-${hash}`
  // Socket Unix giới hạn ~104 byte: thư mục dữ liệu quá dài thì dùng thư mục tạm của người dùng
  const inData = join(userData, 'mcp.sock')
  return Buffer.byteLength(inData) < 100 ? inData : join(tmpdir(), `nibmark-${hash}.sock`)
}

let server: Server | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const readyContents = new Set<number>()
const waiting: (() => void)[] = []

export function registerMcpIpc(): void {
  ipcMain.on('mcp:result', (_e, id: unknown, ok: unknown, payload: unknown) => {
    const entry = typeof id === 'number' ? pending.get(id) : undefined
    if (!entry) return
    pending.delete(id as number)
    clearTimeout(entry.timer)
    if (ok) entry.resolve(payload)
    else entry.reject(new Error(typeof payload === 'string' ? payload : 'Request failed'))
  })
  // Cửa sổ chính báo đã sẵn sàng (dữ liệu đã nạp, đã gắn bộ xử lý)
  ipcMain.on('mcp:ready', (event) => {
    const id = event.sender.id
    readyContents.add(id)
    event.sender.once('destroyed', () => readyContents.delete(id))
    while (waiting.length) waiting.shift()!()
  })
}

/** Cửa sổ chính đã sẵn sàng nhận yêu cầu; chưa có thì mở và chờ */
async function readyWindow(getWindow: () => BrowserWindow): Promise<WebContents> {
  const deadline = Date.now() + CALL_TIMEOUT_MS
  for (;;) {
    const win = getWindow()
    if (readyContents.has(win.webContents.id)) return win.webContents
    if (Date.now() > deadline) throw new Error('Nibmark is still starting. Try again in a moment.')
    await new Promise<void>((resolve) => {
      waiting.push(resolve)
      setTimeout(resolve, 500)
    })
  }
}

async function forward(getWindow: () => BrowserWindow, op: string, tool: unknown, args: unknown, client: unknown): Promise<unknown> {
  const contents = await readyWindow(getWindow)
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Nibmark did not answer in time.'))
    }, CALL_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    contents.send('mcp:call', id, op, tool, args ?? {}, getSettings().mcpAllowEdits, typeof client === 'string' ? client.slice(0, 80) : '')
  })
}

function serve(socket: Socket, getWindow: () => BrowserWindow): void {
  let buffer = ''
  socket.setEncoding('utf8')
  const reply = (message: unknown): void => {
    if (!socket.destroyed) socket.write(JSON.stringify(message) + '\n')
  }
  socket.on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > MAX_LINE) {
      socket.destroy()
      return
    }
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim()) continue
      let req: { id?: unknown; op?: unknown; tool?: unknown; args?: unknown; client?: unknown }
      try {
        req = JSON.parse(line)
      } catch {
        reply({ id: null, ok: false, error: 'Invalid JSON' })
        continue
      }
      const op = req.op
      if (op !== 'list' && op !== 'call' && op !== 'resources' && op !== 'read') {
        reply({ id: req.id ?? null, ok: false, error: 'Unknown operation' })
        continue
      }
      if (!getSettings().mcpEnabled) {
        reply({ id: req.id ?? null, ok: false, error: 'MCP is turned off. Turn it on in Nibmark → Preferences → AI Agents (MCP).' })
        continue
      }
      forward(getWindow, op, req.tool, req.args, req.client).then(
        (result) => reply({ id: req.id ?? null, ok: true, result }),
        (err: Error) => reply({ id: req.id ?? null, ok: false, error: err.message })
      )
    }
  })
  socket.on('error', () => socket.destroy())
}

/** Bật/tắt server theo cài đặt (gọi lúc khởi động và khi người dùng đổi cài đặt) */
export function applyMcp(getWindow: () => BrowserWindow): void {
  const enabled = getSettings().mcpEnabled
  if (enabled && !server) {
    const path = mcpSocketPath(app.getPath('userData'))
    if (process.platform !== 'win32') {
      // Socket cũ còn sót lại sau khi app bị tắt đột ngột (chỉ có một bản app chạy nhờ khóa một bản)
      try {
        unlinkSync(path)
      } catch {
        // không có file cũ
      }
    }
    const next = createServer((socket) => serve(socket, getWindow))
    next.on('error', (err) => console.error('MCP server', err))
    // Socket chỉ chủ tài khoản đọc/ghi được, ngay từ lúc tạo
    const umask = process.platform !== 'win32' ? process.umask(0o177) : null
    next.listen(path, () => {
      if (umask !== null) process.umask(umask)
      if (process.platform !== 'win32') {
        try {
          chmodSync(path, 0o600)
        } catch {
          // giữ quyền mặc định
        }
      }
    })
    server = next
  } else if (!enabled && server) {
    server.close()
    server = null
  }
}

export function stopMcp(): void {
  server?.close()
  server = null
}

/** Lệnh để agent chạy cầu nối (hiện trong Preferences để chép) */
export function mcpCommand(): { command: string; args: string[]; env: Record<string, string> } {
  const script = app.isPackaged ? join(process.resourcesPath, 'mcp.js') : join(app.getAppPath(), 'resources', 'mcp.js')
  const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' }
  if (process.env['NIBMARK_USER_DATA']) env['NIBMARK_USER_DATA'] = app.getPath('userData')
  return { command: process.execPath, args: [script], env }
}
