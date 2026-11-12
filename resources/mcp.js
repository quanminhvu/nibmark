#!/usr/bin/env node
/* eslint-disable */
// Nibmark MCP bridge.
//
// AI agents (Claude Code, Claude Desktop, Cursor…) start this script and talk MCP over stdio
// (newline-delimited JSON-RPC 2.0). Each request is forwarded to the running Nibmark app over
// a local socket that only this user account can open; the app answers from its own data.
//
// Run it with the Node that ships inside Nibmark:
//   ELECTRON_RUN_AS_NODE=1 /Applications/Nibmark.app/Contents/MacOS/Nibmark /Applications/Nibmark.app/Contents/Resources/mcp.js
'use strict'

const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const CONNECT_WAIT_MS = 25_000

function log(...args) {
  // stdout is the MCP channel: diagnostics go to stderr only
  process.stderr.write('[nibmark-mcp] ' + args.join(' ') + '\n')
}

function userDataDir() {
  const custom = process.env.NIBMARK_USER_DATA
  if (custom) return path.resolve(custom)
  const home = os.homedir()
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Nibmark')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Nibmark')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Nibmark')
}

// Must match src/main/mcp.ts
function socketPath(userData) {
  const hash = crypto.createHash('sha1').update(userData).digest('hex').slice(0, 12)
  if (process.platform === 'win32') return '\\\\.\\pipe\\nibmark-' + hash
  const inData = path.join(userData, 'mcp.sock')
  return Buffer.byteLength(inData) < 100 ? inData : path.join(os.tmpdir(), 'nibmark-' + hash + '.sock')
}

function appVersion() {
  try {
    return require(path.join(__dirname, 'app.asar', 'package.json')).version || '0'
  } catch {
    try {
      return require(path.join(__dirname, '..', 'package.json')).version || '0'
    } catch {
      return '0'
    }
  }
}

// ── Connection to the app ──

let conn = null
let connecting = null
let launched = false
let seq = 0
const waiting = new Map()

function connectOnce(target) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(target)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

function launchApp() {
  if (launched || process.env.NIBMARK_MCP_NO_LAUNCH) return
  launched = true
  // The bridge runs with the Nibmark binary itself (ELECTRON_RUN_AS_NODE): start it as the app
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  try {
    if (process.platform === 'darwin' && process.execPath.includes('.app/Contents/MacOS/')) {
      const bundle = process.execPath.slice(0, process.execPath.indexOf('.app/') + 4)
      spawn('open', ['-g', '-a', bundle], { detached: true, stdio: 'ignore', env }).unref()
    } else {
      spawn(process.execPath, [], { detached: true, stdio: 'ignore', env }).unref()
    }
    log('Nibmark was not running; starting it')
  } catch (err) {
    log('could not start Nibmark:', err.message)
  }
}

async function getConnection() {
  if (conn && !conn.destroyed) return conn
  if (connecting) return connecting
  connecting = (async () => {
    const target = socketPath(userDataDir())
    const deadline = Date.now() + CONNECT_WAIT_MS
    for (;;) {
      try {
        const socket = await connectOnce(target)
        attach(socket)
        conn = socket
        return socket
      } catch (err) {
        if (Date.now() > deadline) {
          throw new Error(
            'Could not reach Nibmark. Make sure the app is running and "Let AI agents use your notes" is on in Nibmark → Preferences → AI Agents (MCP).'
          )
        }
        launchApp()
        await new Promise((r) => setTimeout(r, 400))
      }
    }
  })()
  try {
    return await connecting
  } finally {
    connecting = null
  }
}

function attach(socket) {
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 1)
      if (!line.trim()) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      const entry = waiting.get(msg.id)
      if (!entry) continue
      waiting.delete(msg.id)
      if (msg.ok) entry.resolve(msg.result)
      else entry.reject(new Error(msg.error || 'Nibmark returned an error'))
    }
  })
  const fail = () => {
    if (conn === socket) conn = null
    for (const [id, entry] of waiting) {
      waiting.delete(id)
      entry.reject(new Error('Lost the connection to Nibmark.'))
    }
  }
  socket.on('close', fail)
  socket.on('error', fail)
}

let clientName = ''

async function ask(op, extra) {
  const socket = await getConnection()
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    socket.write(JSON.stringify(Object.assign({ id, op, client: clientName }, extra)) + '\n')
  })
}

// ── MCP over stdio ──

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value })
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

const INSTRUCTIONS =
  'Nibmark is the user\'s local Markdown notebook. Use search_notes to find notes (supports tag:, book:, status: and -exclusions), read_note to read one, and edit_note for small precise edits. Deleting a note moves it to the Trash. Link notes with [Title](nibmark://note/<id without "note:">).'

async function handle(msg) {
  const { id, method, params } = msg
  const isRequest = id !== undefined && id !== null
  try {
    switch (method) {
      case 'initialize': {
        clientName = (params && params.clientInfo && params.clientInfo.name) || ''
        const wanted = params && params.protocolVersion
        result(id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(wanted) ? wanted : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'nibmark', title: 'Nibmark', version: appVersion() },
          instructions: INSTRUCTIONS
        })
        return
      }
      case 'ping':
        if (isRequest) result(id, {})
        return
      case 'tools/list':
        result(id, { tools: await ask('list', {}) })
        return
      case 'tools/call': {
        const name = params && params.name
        let out
        try {
          out = await ask('call', { tool: name, args: (params && params.arguments) || {} })
        } catch (err) {
          // App unreachable or failed: report as a tool error the agent can read
          result(id, { content: [{ type: 'text', text: err.message }], isError: true })
          return
        }
        result(id, { content: [{ type: 'text', text: String(out && out.text != null ? out.text : '') }], isError: !!(out && out.isError) })
        return
      }
      case 'resources/list':
        result(id, { resources: await ask('resources', {}) })
        return
      case 'resources/templates/list':
        result(id, { resourceTemplates: [] })
        return
      case 'resources/read': {
        const content = await ask('read', { args: { uri: params && params.uri } })
        result(id, { contents: [content] })
        return
      }
      case 'prompts/list':
        result(id, { prompts: [] })
        return
      default:
        if (method && method.startsWith('notifications/')) return
        if (isRequest) error(id, -32601, 'Method not found: ' + method)
    }
  } catch (err) {
    if (isRequest) error(id, -32603, err.message)
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    error(null, -32700, 'Parse error')
    return
  }
  if (Array.isArray(msg)) msg.forEach((m) => void handle(m))
  else void handle(msg)
})
rl.on('close', () => process.exit(0))
