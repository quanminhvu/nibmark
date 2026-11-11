import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import SparkMD5 from 'spark-md5'
import { db } from './db'
import { fileUrl, saveFile } from './attachments'
import { useStore } from './store'
import { STATUSES } from './types'
import type { Book, Note, NoteStatus } from './types'

// Chuyển dữ liệu import (Markdown, HTML, Evernote) thành ghi chú Nibmark.
// Chỉ THÊM dữ liệu: mọi thứ nằm trong một notebook mới "Imported <ngày>" (hoặc notebook đích),
// không ghi đè ghi chú nào đang có. Chuyển đổi lỗi thì vẫn giữ nguyên văn bản gốc.

type ScanDoc = NibmarkImportScan['docs'][number]

interface Parsed {
  title: string
  body: string
  tags: string[]
  status: NoteStatus
  pinned: boolean
  createdAt: number
  updatedAt: number
  folders: string[]
  /** link trong văn bản → file */
  files: Map<string, File>
}

export interface ImportReport {
  notes: number
  notebooks: number
  attachments: number
  failed: number
  skipped: { path: string; reason: string }[]
  notebookName: string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const newId = (prefix: string): string => `${prefix}:${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

/** Notion thêm 32 ký tự hex vào cuối tên file/thư mục: "Trang của tôi 1a2b…" */
const cleanName = (name: string): string =>
  name
    .normalize('NFC')
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .trim()

// ── Front matter ──

interface FrontMatter {
  data: Record<string, string | string[]>
  body: string
}

function unquote(v: string): string {
  const t = v.trim()
  if (/^".*"$/.test(t)) {
    try {
      return JSON.parse(t) as string
    } catch {
      return t.slice(1, -1)
    }
  }
  return /^'.*'$/.test(t) ? t.slice(1, -1).replace(/''/g, "'") : t
}

/** Đọc front matter YAML đơn giản (khóa: giá trị, danh sách [a, b] hoặc dạng "- a"). Không đọc được thì trả về null. */
function parseFrontMatter(text: string): FrontMatter | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return null
  const data: Record<string, string | string[]> = {}
  let currentList: string[] | null = null
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(raw) ?? /^-\s+(.*)$/.exec(raw)
    if (item && currentList) {
      currentList.push(unquote(item[1]))
      continue
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw)
    if (!kv) return null // cú pháp lạ: giữ nguyên front matter trong nội dung
    const key = kv[1].toLowerCase()
    const value = kv[2].trim()
    if (value === '') {
      currentList = []
      data[key] = currentList
    } else if (/^\[.*\]$/.test(value)) {
      currentList = null
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter(Boolean)
    } else {
      currentList = null
      data[key] = unquote(value)
    }
  }
  return { data, body: text.slice(m[0].length) }
}

const asList = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean) : []

const asDate = (v: string | string[] | undefined): number | null => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

function statusFrom(v: string | string[] | undefined): NoteStatus {
  if (typeof v !== 'string') return 'none'
  const key = v.toLowerCase().replace(/[\s_-]/g, '')
  return STATUSES.find((s) => s.label.toLowerCase().replace(/\s/g, '') === key || s.id.toLowerCase() === key)?.id ?? 'none'
}

/** Bỏ dòng "# Tiêu đề" ở đầu nếu trùng với tiêu đề (Notion, Bear hay lặp lại tiêu đề) */
function dropRepeatedTitle(body: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/.exec(body)
  if (m && m[1].normalize('NFC').trim() === title) return body.slice(m[0].length).replace(/^\s*\n/, '')
  return body
}

function fileFromAsset(asset: { name: string; mime: string; data: Uint8Array }): File {
  return new File([asset.data as BlobPart], asset.name.normalize('NFC'), { type: asset.mime })
}

// ── Markdown ──

function fromMarkdown(doc: ScanDoc): Parsed {
  const fm = parseFrontMatter(doc.text)
  const data = fm?.data ?? {}
  const title = cleanName(typeof data.title === 'string' && data.title.trim() ? data.title : doc.name)
  const body = dropRepeatedTitle(fm ? fm.body : doc.text, title)
  const files = new Map<string, File>()
  for (const [ref, asset] of Object.entries(doc.assets)) files.set(ref, fileFromAsset(asset))
  return {
    title,
    body,
    tags: asList(data.tags ?? data.tag),
    status: statusFrom(data.status),
    pinned: data.pinned === 'true',
    createdAt: asDate(data.created ?? data.date) ?? doc.created ?? Date.now(),
    updatedAt: asDate(data.updated ?? data.modified) ?? doc.modified ?? Date.now(),
    folders: doc.folders.map(cleanName),
    files
  }
}

// ── HTML ──

/** Lọc sơ bộ thuộc tính on…= ngay trên chuỗi, để trình duyệt không phải báo CSP khi đọc */
const stripHandlers = (html: string): string => html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')

/** Bỏ mọi thứ có thể chạy được (script, on*=…, javascript:) trước khi chuyển đổi */
function scrub(root: Document): void {
  root.querySelectorAll('script, style, noscript, iframe, object, embed, link, meta, base').forEach((el) => el.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
}

function turndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  td.use(gfm)
  td.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed'] as never)
  return td
}

function fromHtml(doc: ScanDoc): Parsed {
  // DOMParser tạo tài liệu "trơ": không chạy script, không tải ảnh, không kích hoạt onerror
  const page = new DOMParser().parseFromString(stripHandlers(doc.text), 'text/html')
  scrub(page)
  const title = cleanName(page.querySelector('title')?.textContent?.trim() || page.querySelector('h1')?.textContent?.trim() || doc.name)
  let body: string
  try {
    body = dropRepeatedTitle(turndown().turndown(page.body ?? page.documentElement), title)
  } catch {
    throw new Error('conversion failed')
  }
  const files = new Map<string, File>()
  for (const [ref, asset] of Object.entries(doc.assets)) files.set(ref, fileFromAsset(asset))
  return {
    title,
    body,
    tags: [],
    status: 'none',
    pinned: false,
    createdAt: doc.created ?? Date.now(),
    updatedAt: doc.modified ?? Date.now(),
    folders: doc.folders.map(cleanName),
    files
  }
}

// ── Apple Notes ──
//
// Apple Notes lưu mỗi dòng là một <div>, dòng trống là <div><br></div>. Nhiều người viết
// Markdown ngay trong Notes: khi đó phải giữ nguyên từng dòng chữ (không escape # * |),
// thay vì coi là văn bản định dạng rồi chuyển đổi lần nữa.

const BLOCK_TAGS = new Set(['DIV', 'P', 'UL', 'OL', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'HR'])
const MD_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|\|.*\||```|~~~|---\s*$|\*\*\*\s*$|!\[|\[[ xX]\]\s)/

type AppleBlock = { kind: 'text' | 'list' | 'table' | 'code' | 'blank'; text: string }

const nbsp = (s: string): string => s.replace(/ /g, ' ')

/** Chữ thuần của một phần tử: <br> thành xuống dòng, ảnh và link giữ dạng Markdown */
function appleText(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += nbsp(child.nodeValue ?? '')
    else if (child instanceof HTMLElement) {
      if (child.tagName === 'BR') out += '\n'
      else if (child.tagName === 'IMG') out += `![](${child.getAttribute('src') ?? ''})`
      else if (child.tagName === 'A') {
        const href = child.getAttribute('href') ?? ''
        const text = appleText(child)
        out += !href || text === href || /^\s*https?:/.test(text) ? text : `[${text}](${href})`
      } else out += appleText(child)
    }
  })
  return out
}

function hasBlockChild(el: Element): boolean {
  return [...el.children].some((c) => BLOCK_TAGS.has(c.tagName))
}

function appleBlocks(root: Element, markdownMode: boolean, td: TurndownService, depth = 0): AppleBlock[] {
  const out: AppleBlock[] = []
  // Văn bản có định dạng: dùng turndown cho phần chữ trong dòng (đậm, nghiêng, link…)
  const inline = (el: Element): string =>
    markdownMode ? appleText(el) : nbsp(td.turndown(el.innerHTML.replace(/<br\s*\/?>/gi, '<br>'))).replace(/\n{2,}/g, '\n')
  for (const el of [...root.children]) {
    const tag = el.tagName
    if (tag === 'UL' || tag === 'OL') {
      let n = 1
      for (const li of [...el.children].filter((c) => c.tagName === 'LI')) {
        const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL')
        const clone = li.cloneNode(true) as Element
        clone.querySelectorAll(':scope > ul, :scope > ol').forEach((x) => x.remove())
        const text = inline(clone).trim()
        const marker = tag === 'OL' ? `${n++}. ` : '- '
        const already = markdownMode && /^([-*+]|\d+[.)])\s/.test(text)
        out.push({ kind: 'list', text: '  '.repeat(depth) + (already ? text : marker + text) })
        for (const sub of nested) {
          const wrap = document.createElement('div')
          wrap.appendChild(sub.cloneNode(true))
          out.push(...appleBlocks(wrap, markdownMode, td, depth + 1))
        }
      }
    } else if (tag === 'TABLE') {
      const rows = [...el.querySelectorAll('tr')].map((tr) =>
        [...tr.children].map((td2) => appleText(td2).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim())
      )
      if (!rows.length) continue
      const width = Math.max(...rows.map((r) => r.length))
      const line = (r: string[]): string => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
      out.push({ kind: 'table', text: line(rows[0]) })
      out.push({ kind: 'table', text: `|${' --- |'.repeat(width)}` })
      for (const r of rows.slice(1)) out.push({ kind: 'table', text: line(r) })
    } else if (tag === 'PRE') {
      out.push({ kind: 'code', text: '```\n' + nbsp(el.textContent ?? '').replace(/\n$/, '') + '\n```' })
    } else if (tag === 'HR') {
      out.push({ kind: 'text', text: '---' })
    } else if (/^H[1-6]$/.test(tag)) {
      const text = inline(el).trim()
      if (!text) continue
      out.push({ kind: 'text', text: markdownMode && /^#{1,6}\s/.test(text) ? text : `${'#'.repeat(Number(tag[1]))} ${text}` })
    } else if (hasBlockChild(el)) {
      out.push(...appleBlocks(el, markdownMode, td, depth))
    } else {
      const text = inline(el)
      if (!text.trim()) out.push({ kind: 'blank', text: '' })
      else for (const line of text.replace(/\n+$/, '').split('\n')) out.push(line.trim() ? { kind: 'text', text: line.replace(/\s+$/, '') } : { kind: 'blank', text: '' })
    }
  }
  return out
}

/** Chuyển nội dung HTML của một ghi chú Apple Notes thành Markdown. */
export function appleNoteToMarkdown(html: string, title: string): string {
  const page = new DOMParser().parseFromString(stripHandlers(html), 'text/html')
  scrub(page)
  const body = page.body
  // Ghi chú viết bằng Markdown? Đếm các dòng có cú pháp Markdown ở đầu dòng
  const lines = appleBlocks(body, true, turndown())
    .filter((b) => b.kind === 'text')
    .map((b) => b.text)
  const mdLines = lines.filter((l) => MD_LINE.test(l)).length
  const markdownMode = mdLines >= 2 || (mdLines >= 1 && lines.length <= 3) || lines.some((l) => /^\s*(```|~~~)/.test(l))
  const blocks = markdownMode ? appleBlocks(body, true, turndown()) : appleBlocks(body, false, turndown())

  // Bỏ dòng đầu nếu chỉ lặp lại tiêu đề (Notes lấy dòng đầu làm tiêu đề)
  const plain = (t: string): string => t.replace(/^#{1,6}\s+/, '').replace(/[*_`]/g, '').trim()
  // Có khi tiêu đề lặp hai lần (dòng tiêu đề của Notes rồi dòng "# Tiêu đề" đã gõ)
  for (let i = 0; i < 2; i++) {
    const first = blocks.findIndex((b) => b.kind !== 'blank')
    if (first < 0 || plain(blocks[first].text) !== plain(title)) break
    blocks.splice(0, first + 1)
  }

  let md: string
  if (markdownMode) {
    // Giữ nguyên từng dòng như người dùng đã gõ
    md = blocks.map((b) => b.text).join('\n')
  } else {
    // Văn bản thường: mỗi dòng là một đoạn; danh sách và bảng giữ liền nhau
    md = ''
    let prev: AppleBlock | null = null
    for (const b of blocks) {
      if (b.kind === 'blank') {
        prev = null
        continue
      }
      if (prev) md += (prev.kind === b.kind && (b.kind === 'list' || b.kind === 'table')) ? '\n' : '\n\n'
      else if (md) md += '\n\n'
      md += b.text
      prev = b
    }
  }
  return md.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n'
}

function fromAppleNote(doc: ScanDoc): Parsed {
  const title = cleanName(doc.name.replace(/^#{1,6}\s+/, '').trim() || 'Untitled')
  const body = appleNoteToMarkdown(doc.text, doc.name)
  const files = new Map<string, File>()
  for (const [ref, asset] of Object.entries(doc.assets)) files.set(ref, fileFromAsset(asset))
  return {
    title,
    body,
    tags: [],
    status: 'none',
    pinned: false,
    createdAt: doc.created ?? Date.now(),
    updatedAt: doc.modified ?? Date.now(),
    folders: doc.folders.map(cleanName),
    files
  }
}

// ── Evernote (.enex) ──

/** "20231105T101112Z" → thời điểm */
function enexDate(v: string | null | undefined): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v?.trim() ?? '')
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function fromEnex(doc: ScanDoc): Parsed[] {
  const xml = new DOMParser().parseFromString(doc.text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('not a valid Evernote export')
  const td = turndown()
  const out: Parsed[] = []
  for (const note of [...xml.getElementsByTagName('note')]) {
    const title = cleanName(note.getElementsByTagName('title')[0]?.textContent || 'Untitled')
    const files = new Map<string, File>()
    // Tài nguyên (ảnh, file) được nhúng base64; ENML tham chiếu chúng bằng MD5 của nội dung
    const byHash = new Map<string, string>()
    for (const res of [...note.getElementsByTagName('resource')]) {
      const data = res.getElementsByTagName('data')[0]?.textContent
      if (!data) continue
      const bytes = base64ToBytes(data)
      const hash = SparkMD5.ArrayBuffer.hash(bytes.buffer as ArrayBuffer)
      const mime = res.getElementsByTagName('mime')[0]?.textContent?.trim() || 'application/octet-stream'
      const name = res.getElementsByTagName('file-name')[0]?.textContent?.trim() || `attachment.${mime.split('/')[1] || 'bin'}`
      const ref = `enex-resource:${hash}`
      files.set(ref, new File([bytes as BlobPart], name.normalize('NFC'), { type: mime }))
      byHash.set(hash, ref)
    }
    // ENML là XML: thẻ tự đóng như <en-todo/> phải đổi trước khi đọc bằng trình phân tích HTML,
    // nếu không thẻ đó sẽ "nuốt" luôn chữ phía sau nó.
    const enml = (note.getElementsByTagName('content')[0]?.textContent ?? '')
      .replace(/<en-todo\b([^>]*?)\/?>(?:\s*<\/en-todo>)?/gi, (_m, attrs: string) => (/checked\s*=\s*["']true["']/i.test(attrs) ? 'NIBTODO1 ' : 'NIBTODO0 '))
      .replace(/<(en-media|br|hr)\b([^>]*?)\/>/gi, (_m, tag: string, attrs: string) => (tag.toLowerCase() === 'en-media' ? `<en-media${attrs}></en-media>` : `<${tag}${attrs}>`))
    const page = new DOMParser().parseFromString(stripHandlers(enml), 'text/html')
    scrub(page)
    page.querySelectorAll('en-crypt').forEach((el) => el.replaceWith(page.createTextNode('(encrypted content was not imported)')))
    page.querySelectorAll('en-media').forEach((el) => {
      const ref = byHash.get((el.getAttribute('hash') ?? '').toLowerCase())
      if (!ref) return el.remove()
      const isImage = (el.getAttribute('type') ?? '').startsWith('image/')
      const node = page.createElement(isImage ? 'img' : 'a')
      if (isImage) node.setAttribute('src', ref)
      else {
        node.setAttribute('href', ref)
        node.textContent = `📎 ${files.get(ref)?.name ?? 'attachment'}`
      }
      el.replaceWith(node)
    })
    let body: string
    try {
      body = td.turndown(page.body)
    } catch {
      body = page.body.textContent ?? ''
    }
    // Ô việc cần làm của Evernote → task Markdown
    body = body
      .replace(/^(\s*)(?:[-*]\s+)?NIBTODO([01]) /gm, (_m, indent: string, done: string) => `${indent}- [${done === '1' ? 'x' : ' '}] `)
      .replace(/NIBTODO([01]) /g, (_m, done: string) => (done === '1' ? '[x] ' : '[ ] '))
    out.push({
      title,
      body,
      tags: [...note.getElementsByTagName('tag')].map((t) => t.textContent?.trim() ?? '').filter(Boolean),
      status: 'none',
      pinned: false,
      createdAt: enexDate(note.getElementsByTagName('created')[0]?.textContent) ?? Date.now(),
      updatedAt: enexDate(note.getElementsByTagName('updated')[0]?.textContent) ?? Date.now(),
      folders: [...doc.folders.map(cleanName), cleanName(doc.name)],
      files
    })
  }
  return out
}

// ── Ghi vào Nibmark ──

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Đổi đường dẫn file trong văn bản thành nibmark://file/<id> */
function rewriteLinks(body: string, refs: Map<string, string>): string {
  let out = body
  for (const [ref, url] of refs) {
    // Obsidian ![[ảnh.png]] → ![ảnh.png](nibmark://file/…)
    out = out.replace(new RegExp(`!\\[\\[${escapeRegExp(ref)}(?:[|#][^\\]]*)?\\]\\]`, 'g'), `![${ref}](${url})`)
    // (đường dẫn) và (<đường dẫn>) trong link Markdown, kể cả khi turndown đã giữ nguyên
    out = out.replace(new RegExp(`\\]\\(\\s*<?${escapeRegExp(ref)}>?(\\s+"[^"]*")?\\s*\\)`, 'g'), `](${url}$1)`)
  }
  return out
}

export async function importScan(scan: NibmarkImportScan, targetBookId: string | null, rootLabel = 'Imported'): Promise<ImportReport> {
  const store = useStore.getState()
  const skipped = [...scan.skipped]
  let failed = 0

  // 1. Chuyển đổi từng file
  const parsed: Parsed[] = []
  for (const doc of scan.docs) {
    const path = [...doc.folders, doc.name + doc.ext].join('/')
    try {
      if (doc.ext === '.enex') parsed.push(...fromEnex(doc))
      else if (doc.ext === '.applenote') parsed.push(fromAppleNote(doc))
      else if (doc.ext === '.html' || doc.ext === '.htm') parsed.push(fromHtml(doc))
      else parsed.push(fromMarkdown(doc))
    } catch (err) {
      failed++
      if (doc.ext === '.enex') {
        skipped.push({ path, reason: (err as Error).message })
        continue
      }
      // Không bao giờ bỏ mất chữ: lấy nguyên văn bản gốc
      skipped.push({ path, reason: 'could not convert; imported as plain text' })
      parsed.push({
        title: cleanName(doc.name),
        body: doc.text,
        tags: [],
        status: 'none',
        pinned: false,
        createdAt: doc.created ?? Date.now(),
        updatedAt: doc.modified ?? Date.now(),
        folders: doc.folders.map(cleanName),
        files: new Map()
      })
    }
  }

  // 2. Notebook: một notebook mới "Imported <ngày>" (hoặc notebook đích), thư mục con thành notebook con
  const now = Date.now()
  const newBooks: Book[] = []
  const bookFor = new Map<string, string>()
  let rootId = targetBookId && store.books[targetBookId] ? targetBookId : null
  // Tên notebook gốc không trùng với notebook đã có ("Imported 2026-11-11 2"…)
  const taken = new Set(Object.values(store.books).filter((b) => !b.parentId).map((b) => b.name))
  let notebookName = rootId ? store.books[rootId].name : `${rootLabel} ${today()}`
  if (!rootId) for (let i = 2; taken.has(notebookName); i++) notebookName = `${rootLabel} ${today()} ${i}`
  if (!rootId) {
    rootId = newId('book')
    newBooks.push({ _id: rootId, type: 'book', name: notebookName, parentId: null, createdAt: now, updatedAt: now })
  }
  // Nếu mọi ghi chú cùng nằm dưới một thư mục gốc duy nhất thì bỏ cấp đó (đã có notebook gốc)
  const firsts = new Set(parsed.map((p) => p.folders[0] ?? ''))
  const dropFirst = firsts.size === 1 && !firsts.has('') && parsed.every((p) => p.folders.length > 0)
  const ensureBook = (folders: string[]): string => {
    let parent = rootId!
    let key = ''
    for (const name of folders) {
      key += '/' + name
      let id = bookFor.get(key)
      if (!id) {
        id = newId('book')
        newBooks.push({ _id: id, type: 'book', name: name || 'Untitled', parentId: parent, createdAt: now, updatedAt: now })
        bookFor.set(key, id)
      }
      parent = id
    }
    return parent
  }

  // 3. File đính kèm và ghi chú
  let attachments = 0
  const notes: Note[] = []
  for (const p of parsed) {
    const refs = new Map<string, string>()
    for (const [ref, file] of p.files) {
      try {
        const saved = await saveFile(file)
        if (saved) {
          refs.set(ref, fileUrl(saved._id))
          attachments++
        }
      } catch {
        skipped.push({ path: `${p.title} → ${file.name}`, reason: 'attachment could not be saved' })
      }
    }
    const tagIds = p.tags.map((t) => useStore.getState().ensureTag(t.normalize('NFC')))
    notes.push({
      _id: newId('note'),
      type: 'note',
      title: p.title.slice(0, 500),
      body: rewriteLinks(p.body, refs),
      bookId: ensureBook(dropFirst ? p.folders.slice(1) : p.folders),
      tags: [...new Set(tagIds)],
      status: p.status,
      pinned: p.pinned,
      trashed: false,
      createdAt: p.createdAt,
      updatedAt: Math.max(p.updatedAt, p.createdAt)
    })
  }

  // 4. Cập nhật app một lần, rồi ghi hàng loạt (không ghi từng ghi chú, tránh chậm khi có hàng nghìn ghi chú)
  useStore.setState((s) => ({
    books: { ...s.books, ...Object.fromEntries(newBooks.map((b) => [b._id, b])) },
    notes: { ...s.notes, ...Object.fromEntries(notes.map((n) => [n._id, n])) }
  }))
  const docs = [...newBooks, ...notes]
  for (let i = 0; i < docs.length; i += 500) await db.bulkDocs(docs.slice(i, i + 500) as never)

  useStore.getState().select({ kind: 'book', id: rootId })
  return { notes: notes.length, notebooks: newBooks.length, attachments, failed, skipped, notebookName }
}

/** Import toàn bộ Apple Notes (macOS hỏi quyền ở lần đầu) vào notebook "Apple Notes <ngày>". */
export async function runAppleNotesImport(): Promise<ImportReport | null> {
  const bridge = window.nibmark
  const s = useStore.getState()
  if (!bridge) return null
  if (
    !window.confirm(
      'Import all notes from Apple Notes?\n\nmacOS will ask whether Nibmark may control Notes. Locked notes and Recently Deleted are skipped. Your notes in Apple Notes are not changed.'
    )
  )
    return null
  s.showNotice('Reading Apple Notes… this can take a minute for a large library.')
  const scan = await bridge.importer.appleNotes()
  if ('error' in scan) {
    s.showNotice(scan.error, 'error')
    return null
  }
  if (!scan.docs.length) {
    s.showNotice(scan.skipped.length ? `Nothing to import: ${scan.skipped.length} locked notes were skipped.` : 'No notes found in Apple Notes.', 'error')
    return null
  }
  const report = await importScan(scan, null, 'Apple Notes')
  notifyReport(report)
  return report
}

function notifyReport(report: ImportReport): void {
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
  let text = `Imported ${plural(report.notes, 'note')}`
  if (report.attachments) text += ` and ${plural(report.attachments, 'attachment')}`
  text += ` into “${report.notebookName}”.`
  if (report.skipped.length) text += ` ${plural(report.skipped.length, 'item')} skipped (see the console for details).`
  if (report.skipped.length) console.warn('Import skipped:', report.skipped)
  useStore.getState().showNotice(text, report.failed ? 'error' : 'info')
}

/** Mở hộp thoại chọn file rồi import; báo kết quả bằng thông báo */
export async function runImport(targetBookId: string | null = null): Promise<ImportReport | null> {
  const bridge = window.nibmark
  const s = useStore.getState()
  if (!bridge) return null
  const scan = await bridge.importer.pick()
  if (!scan) return null
  if (!scan.docs.length) {
    s.showNotice(scan.skipped[0]?.reason ? `Nothing to import: ${scan.skipped[0].reason}.` : 'Nothing to import.', 'error')
    return null
  }
  const report = await importScan(scan, targetBookId)
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
  let text = `Imported ${plural(report.notes, 'note')}`
  if (report.attachments) text += ` and ${plural(report.attachments, 'attachment')}`
  text += ` into “${report.notebookName}”.`
  if (report.skipped.length) text += ` ${plural(report.skipped.length, 'item')} skipped (see the console for details).`
  if (report.skipped.length) console.warn('Import skipped:', report.skipped)
  s.showNotice(text, report.failed ? 'error' : 'info')
  return report
}
