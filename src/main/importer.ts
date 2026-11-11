import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { basename, extname, join, posix, relative, sep } from 'node:path'
import { unzipSync } from 'fflate'

// Đọc dữ liệu để import. Main chỉ đọc những đường dẫn mà chính hộp thoại chọn file trả về,
// không đi theo symlink ra ngoài, bỏ qua thư mục ẩn/hệ thống, và có giới hạn kích thước.
// Việc chuyển đổi (Markdown, HTML, Evernote) do renderer làm.

const DOC_EXT = new Set(['.md', '.markdown', '.mdown', '.txt', '.html', '.htm', '.enex'])
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash', '.Trash', '__MACOSX', '.DS_Store'])
const MAX_FILE = 100 * 1024 * 1024
const MAX_TOTAL = 1024 * 1024 * 1024
const MAX_FILES = 20000

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime'
}

export interface ImportAsset {
  name: string
  mime: string
  data: Uint8Array
}

export interface ImportDoc {
  /** Thư mục chứa (tương đối so với gốc), dùng để tạo notebook lồng nhau */
  folders: string[]
  name: string
  ext: string
  text: string
  created: number | null
  modified: number | null
  /** Link → file đính kèm. Khóa đúng như chuỗi đường dẫn viết trong văn bản */
  assets: Record<string, ImportAsset>
}

export interface ImportScan {
  label: string
  docs: ImportDoc[]
  skipped: { path: string; reason: string }[]
}

/** Một "ổ" file trừu tượng, để đọc thư mục thật và file .zip theo cùng một cách */
interface Source {
  /** đường dẫn tương đối dạng posix → nội dung */
  read(path: string): Uint8Array | null
  /** file có tồn tại (và được phép đọc) không */
  has(path: string): boolean
  /** các file để xét làm ghi chú */
  files: { path: string; size: number; created: number | null; modified: number | null }[]
  /** tìm file theo tên (link kiểu Obsidian chỉ ghi tên) — không bắt buộc */
  byName?(name: string): string | undefined
}

const insideRoot = (path: string): string | null => {
  const norm = posix.normalize(path)
  return norm.startsWith('..') || posix.isAbsolute(norm) ? null : norm
}

/**
 * Nguồn cho một file đơn lẻ: chỉ đọc đúng file đó và những file nó tham chiếu
 * (không quét cả thư mục chứa nó, vốn có thể là cả thư mục Downloads).
 */
function singleFileSource(dir: string, fileName: string): Source {
  const safeStat = (rel: string): Stats | null => {
    const norm = insideRoot(rel)
    if (!norm || norm.split('/').some((p) => p.startsWith('.') || SKIP_DIRS.has(p))) return null
    try {
      const st = lstatSync(join(dir, ...norm.split('/')))
      return st.isFile() && !st.isSymbolicLink() && st.size <= MAX_FILE ? st : null
    } catch {
      return null
    }
  }
  const st = safeStat(fileName)
  return {
    files: st ? [{ path: fileName, size: st.size, created: st.birthtimeMs || null, modified: st.mtimeMs || null }] : [],
    has: (path) => safeStat(path) !== null,
    read: (path) => (safeStat(path) ? new Uint8Array(readFileSync(join(dir, ...posix.normalize(path).split('/')))) : null)
  }
}

function folderSource(root: string, skipped: ImportScan['skipped']): Source {
  const files: Source['files'] = []
  let total = 0
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      const st = lstatSync(full)
      if (st.isSymbolicLink()) {
        skipped.push({ path: relative(root, full), reason: 'symbolic link' })
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) {
        const rel = relative(root, full).split(sep).join('/')
        if (files.length >= MAX_FILES) {
          skipped.push({ path: rel, reason: 'too many files' })
          continue
        }
        if (st.size > MAX_FILE || total + st.size > MAX_TOTAL) {
          skipped.push({ path: rel, reason: 'file too large' })
          continue
        }
        total += st.size
        files.push({ path: rel, size: st.size, created: st.birthtimeMs || null, modified: st.mtimeMs || null })
      }
    }
  }
  walk(root)
  const known = new Set(files.map((f) => f.path))
  const names = new Map<string, string>()
  for (const f of files) if (!names.has(posix.basename(f.path))) names.set(posix.basename(f.path), f.path)
  return {
    files,
    has: (path) => {
      const norm = insideRoot(path)
      return !!norm && known.has(norm)
    },
    byName: (name) => names.get(name),
    read: (path) => {
      const norm = insideRoot(path)
      if (!norm || !known.has(norm)) return null
      return new Uint8Array(readFileSync(join(root, ...norm.split('/'))))
    }
  }
}

function zipSource(zipPath: string, skipped: ImportScan['skipped']): Source {
  const entries: Record<string, Uint8Array> = {}
  let total = 0
  const addZip = (data: Uint8Array, prefix: string, depth: number): void => {
    const unzipped = unzipSync(data, {
      filter: (f) => {
        if (f.originalSize > MAX_FILE || total + f.originalSize > MAX_TOTAL) {
          skipped.push({ path: prefix + f.name, reason: 'file too large' })
          return false
        }
        total += f.originalSize
        return true
      }
    })
    for (const [name, content] of Object.entries(unzipped)) {
      if (name.endsWith('/')) continue
      const parts = name.split('/')
      if (parts.some((p) => p.startsWith('.') || SKIP_DIRS.has(p) || p === '..')) continue
      // Notion đôi khi lồng thêm một file zip bên trong
      if (name.toLowerCase().endsWith('.zip') && depth === 0) addZip(content, prefix, depth + 1)
      else entries[prefix + name] = content
    }
  }
  addZip(new Uint8Array(readFileSync(zipPath)), '', 0)
  const paths = Object.keys(entries).slice(0, MAX_FILES)
  const names = new Map<string, string>()
  for (const p of paths) if (!names.has(posix.basename(p))) names.set(posix.basename(p), p)
  return {
    files: paths.map((p) => ({ path: p, size: entries[p].byteLength, created: null, modified: null })),
    has: (path) => {
      const norm = insideRoot(path)
      return !!norm && norm in entries
    },
    byName: (name) => names.get(name),
    read: (path) => {
      const norm = insideRoot(path)
      return norm ? (entries[norm] ?? null) : null
    }
  }
}

const decoder = new TextDecoder('utf-8')

// Các đường dẫn tới file cục bộ mà một văn bản tham chiếu: Markdown, Obsidian ![[…]], HTML src/href
function references(text: string, ext: string): string[] {
  const refs = new Set<string>()
  if (ext === '.html' || ext === '.htm') {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1])
  } else {
    for (const m of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) refs.add(m[1])
    for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) refs.add(m[1])
  }
  return [...refs].filter((r) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(r))
}

function safeDecode(ref: string): string {
  try {
    return decodeURIComponent(ref)
  } catch {
    return ref
  }
}

function scanSource(source: Source, label: string, skipped: ImportScan['skipped']): ImportDoc[] {
  const docs: ImportDoc[] = []

  for (const file of source.files) {
    const parts = file.path.split('/')
    // TextBundle (Bear): <tên>.textbundle/text.markdown (+ assets/)
    const bundleIndex = parts.findIndex((p) => p.toLowerCase().endsWith('.textbundle'))
    let ext = extname(file.path).toLowerCase()
    let folders = parts.slice(0, -1)
    let name = basename(file.path, extname(file.path))
    if (bundleIndex >= 0) {
      if (bundleIndex !== parts.length - 2 || !/^text\.(md|markdown|txt)$/i.test(parts[parts.length - 1])) continue
      folders = parts.slice(0, bundleIndex)
      name = parts[bundleIndex].replace(/\.textbundle$/i, '')
      ext = '.md'
    } else if (!DOC_EXT.has(ext)) continue

    const bytes = source.read(file.path)
    if (!bytes) continue
    const text = decoder.decode(bytes)
    const dir = parts.slice(0, -1).join('/')
    const assets: Record<string, ImportAsset> = {}
    if (ext !== '.enex') {
      for (const ref of references(text, ext)) {
        const decoded = safeDecode(ref.split(/[?#]/)[0])
        let target = posix.normalize(dir ? `${dir}/${decoded}` : decoded)
        if (target.startsWith('..') || posix.isAbsolute(target)) {
          skipped.push({ path: `${file.path} → ${ref}`, reason: 'link points outside the imported folder' })
          continue
        }
        // Obsidian thường chỉ ghi tên file, không có đường dẫn
        if (!source.has(target)) target = source.byName?.(posix.basename(decoded)) ?? target
        if (!source.has(target) || DOC_EXT.has(extname(target).toLowerCase())) continue
        const data = source.read(target)
        if (!data) continue
        assets[ref] = { name: posix.basename(target), mime: MIME[extname(target).toLowerCase()] ?? 'application/octet-stream', data }
      }
    }
    docs.push({ folders, name, ext, text, created: file.created, modified: file.modified, assets })
  }
  for (const f of source.files) {
    if (extname(f.path).toLowerCase() === '.csv') skipped.push({ path: f.path, reason: 'databases (CSV) are not imported' })
  }
  if (!docs.length) skipped.push({ path: label, reason: 'no Markdown, HTML or Evernote files found' })
  return docs
}

/** Đọc các file/thư mục người dùng vừa chọn */
export function scanImport(paths: string[]): ImportScan {
  const skipped: ImportScan['skipped'] = []
  const docs: ImportDoc[] = []
  for (const path of paths) {
    let st
    try {
      st = lstatSync(path)
    } catch {
      continue
    }
    const label = basename(path)
    if (st.isSymbolicLink()) {
      skipped.push({ path: label, reason: 'symbolic link' })
      continue
    }
    if (st.isDirectory()) {
      // Chọn thẳng một .textbundle: đọc riêng bundle đó, đường dẫn tính từ tên bundle
      if (label.toLowerCase().endsWith('.textbundle')) {
        const inner = folderSource(path, skipped)
        const strip = (p: string): string | null => (p.startsWith(label + '/') ? p.slice(label.length + 1) : null)
        const src: Source = {
          files: inner.files.map((f) => ({ ...f, path: `${label}/${f.path}` })),
          has: (p) => {
            const rel = strip(posix.normalize(p))
            return rel !== null && inner.has(rel)
          },
          read: (p) => {
            const rel = strip(posix.normalize(p))
            return rel === null ? null : inner.read(rel)
          }
        }
        docs.push(...scanSource(src, label, skipped))
      } else {
        const src = folderSource(path, skipped)
        // Nội dung của thư mục được chọn nằm dưới một notebook mang tên thư mục đó
        docs.push(...scanSource(src, label, skipped).map((d) => ({ ...d, folders: [label, ...d.folders] })))
      }
    } else if (st.isFile()) {
      if (st.size > MAX_FILE) {
        skipped.push({ path: label, reason: 'file too large' })
        continue
      }
      if (extname(path).toLowerCase() === '.zip') {
        const src = zipSource(path, skipped)
        docs.push(...scanSource(src, label, skipped).map((d) => ({ ...d, folders: [label.replace(/\.zip$/i, ''), ...d.folders] })))
      } else {
        docs.push(...scanSource(singleFileSource(join(path, '..'), label), label, skipped))
      }
    }
  }
  // Lỗi "không tìm thấy" chỉ có ý nghĩa khi cả lần import không có gì
  return { label: paths.length === 1 ? basename(paths[0]) : `${paths.length} items`, docs, skipped: docs.length ? skipped.filter((s) => !s.reason.startsWith('no Markdown')) : skipped }
}
