import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { backupDir, getSettings, updateSettings } from './settings'

// Định dạng thư mục sao lưu:
//   <dir>/nibmark-backup.json        đánh dấu đây là thư mục sao lưu của Nibmark
//   <dir>/notes|books|tags|templates/<id>.json  mỗi document một file JSON
//   <dir>/files/<id>.json + <id>.<đuôi>         file đính kèm: thông tin + nội dung gốc
//   <dir>/deleted/<loại>/…            document đã bị xóa khỏi app
//
// Nguyên tắc an toàn: sao lưu KHÔNG BAO GIỜ xóa file. Document bị xóa trong app
// chỉ được chuyển sang deleted/. Một bản cài mới hay một DB rỗng trỏ vào cùng thư mục
// cũng không thể làm mất dữ liệu đã sao lưu.

const ID = /^(note|book|tag|template|file):[A-Za-z0-9_-]{1,64}$/
const FILE_ID = /^file:[A-Za-z0-9_-]{1,64}$/
const FOLDER = { note: 'notes', book: 'books', tag: 'tags', template: 'templates', file: 'files' } as const
type Kind = keyof typeof FOLDER

/** Giới hạn kích thước một file đính kèm */
export const MAX_FILE_BYTES = 100 * 1024 * 1024

export interface FileMeta {
  _id: string
  type: 'file'
  name: string
  contentType: string
  size: number
  createdAt: number
  updatedAt: number
}

export function isFileMeta(doc: unknown): doc is FileMeta {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as Record<string, unknown>
  return (
    d.type === 'file' &&
    typeof d._id === 'string' &&
    FILE_ID.test(d._id) &&
    typeof d.name === 'string' &&
    d.name.length <= 255 &&
    typeof d.contentType === 'string' &&
    d.contentType.length <= 255 &&
    typeof d.size === 'number' &&
    typeof d.createdAt === 'number' &&
    typeof d.updatedAt === 'number'
  )
}

/** Đuôi file an toàn để đặt tên file nội dung trong thư mục sao lưu */
const safeExt = (name: string): string => {
  const ext = extname(name).slice(1).toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin'
}

export type BackupDoc = { _id: string; type: Kind; updatedAt: number } & Record<string, unknown>

export function isValidDoc(doc: unknown): doc is BackupDoc {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as Record<string, unknown>
  return (
    typeof d._id === 'string' &&
    ID.test(d._id) &&
    d._id.startsWith(`${d.type as string}:`) &&
    typeof d.updatedAt === 'number'
  )
}

const fileName = (id: string): string => `${id.replace(':', '_')}.json`

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

function ensureLayout(dir: string): void {
  for (const sub of Object.values(FOLDER)) mkdirSync(join(dir, sub), { recursive: true })
  const marker = join(dir, 'nibmark-backup.json')
  if (!existsSync(marker)) writeAtomic(marker, JSON.stringify({ app: 'Nibmark', format: 1, createdAt: Date.now() }, null, 2))
}

export interface WriteResult {
  ok: boolean
  written: number
  error?: string
}

export function writeBackup(upserts: unknown[], deletes: unknown[]): WriteResult {
  const settings = getSettings()
  if (!settings.backupEnabled) return { ok: true, written: 0 }
  const dir = backupDir()
  try {
    ensureLayout(dir)
    let written = 0
    for (const doc of upserts) {
      // File đính kèm đi đường riêng (writeFileBackup) vì có nội dung nhị phân
      if (!isValidDoc(doc) || doc.type === 'file') continue
      const path = join(dir, FOLDER[doc.type], fileName(doc._id))
      const content = JSON.stringify(doc, null, 2)
      // Bỏ qua file không đổi để lần quét toàn bộ lúc khởi động không ghi lại mọi thứ
      if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
      writeAtomic(path, content)
      written++
    }
    for (const id of deletes) {
      if (typeof id !== 'string' || !ID.test(id)) continue
      const kind = id.slice(0, id.indexOf(':')) as Kind
      const from = join(dir, FOLDER[kind], fileName(id))
      if (!existsSync(from)) continue
      const toDir = join(dir, 'deleted', FOLDER[kind])
      mkdirSync(toDir, { recursive: true })
      // File đính kèm: chuyển cả file nội dung đi cùng
      if (kind === 'file') {
        try {
          const meta = JSON.parse(readFileSync(from, 'utf8')) as { binary?: unknown }
          if (typeof meta.binary === 'string' && /^[\w.-]+$/.test(meta.binary) && existsSync(join(dir, 'files', meta.binary))) {
            renameSync(join(dir, 'files', meta.binary), join(toDir, meta.binary))
          }
        } catch {
          // thông tin hỏng: vẫn chuyển file JSON
        }
      }
      renameSync(from, join(toDir, fileName(id)))
      written++
    }
    updateSettings({ lastBackupAt: Date.now() })
    return { ok: true, written }
  } catch (err) {
    return { ok: false, written: 0, error: (err as Error).message }
  }
}

/** Những file đính kèm chưa có trong thư mục sao lưu (file không bao giờ đổi nội dung). */
export function missingFiles(ids: unknown[]): string[] {
  const settings = getSettings()
  if (!settings.backupEnabled) return []
  const dir = backupDir()
  return ids.filter((id): id is string => typeof id === 'string' && FILE_ID.test(id)).filter((id) => !existsSync(join(dir, 'files', fileName(id))))
}

export function writeFileBackup(meta: unknown, bytes: unknown): WriteResult {
  const settings = getSettings()
  if (!settings.backupEnabled) return { ok: true, written: 0 }
  if (!isFileMeta(meta) || !(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, written: 0, error: 'Invalid attachment' }
  }
  const dir = backupDir()
  try {
    ensureLayout(dir)
    const jsonPath = join(dir, 'files', fileName(meta._id))
    if (existsSync(jsonPath)) return { ok: true, written: 0 }
    const binary = `${meta._id.replace(':', '_')}.${safeExt(meta.name)}`
    const tmp = join(dir, 'files', `${binary}.tmp`)
    writeFileSync(tmp, bytes)
    renameSync(tmp, join(dir, 'files', binary))
    // Ghi JSON sau cùng: có JSON nghĩa là nội dung đã ghi xong
    const clean: FileMeta = {
      _id: meta._id,
      type: 'file',
      name: meta.name,
      contentType: meta.contentType,
      size: meta.size,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt
    }
    writeAtomic(jsonPath, JSON.stringify({ ...clean, binary }, null, 2))
    updateSettings({ lastBackupAt: Date.now() })
    return { ok: true, written: 1 }
  } catch (err) {
    return { ok: false, written: 0, error: (err as Error).message }
  }
}

export interface BackupFile {
  meta: FileMeta
  data: Uint8Array
}

/** Đọc mọi document (trừ thư mục deleted/) từ một thư mục sao lưu. */
export function readBackup(dir: string): { docs: BackupDoc[]; files: BackupFile[]; error?: string } {
  if (!existsSync(join(dir, 'nibmark-backup.json'))) {
    return { docs: [], files: [], error: 'This folder is not a Nibmark backup.' }
  }
  const docs: BackupDoc[] = []
  const files: BackupFile[] = []
  const filesDir = join(dir, 'files')
  if (existsSync(filesDir) && statSync(filesDir).isDirectory()) {
    for (const name of readdirSync(filesDir)) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(readFileSync(join(filesDir, name), 'utf8')) as Record<string, unknown>
        const binary = raw.binary
        if (!isFileMeta(raw) || typeof binary !== 'string' || !/^[\w.-]+$/.test(binary)) continue
        const path = join(filesDir, binary)
        if (!existsSync(path) || statSync(path).size > MAX_FILE_BYTES) continue
        const { binary: _b, ...meta } = raw as unknown as FileMeta & { binary: string }
        files.push({ meta, data: new Uint8Array(readFileSync(path)) })
      } catch {
        // bỏ qua file hỏng
      }
    }
  }
  for (const sub of Object.values(FOLDER)) {
    if (sub === 'files') continue
    const folder = join(dir, sub)
    if (!existsSync(folder) || !statSync(folder).isDirectory()) continue
    for (const name of readdirSync(folder)) {
      if (!name.endsWith('.json')) continue
      try {
        const doc: unknown = JSON.parse(readFileSync(join(folder, name), 'utf8'))
        if (isValidDoc(doc)) docs.push(doc)
      } catch {
        // file hỏng thì bỏ qua, không làm hỏng cả lần khôi phục
      }
    }
  }
  return { docs, files }
}
