import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backupDir, getSettings, updateSettings } from './settings'

// Định dạng thư mục sao lưu:
//   <dir>/nibmark-backup.json        đánh dấu đây là thư mục sao lưu của Nibmark
//   <dir>/notes|books|tags|templates/<id>.json  mỗi document một file JSON
//   <dir>/deleted/<loại>/<id>.json    document đã bị xóa khỏi app
//
// Nguyên tắc an toàn: sao lưu KHÔNG BAO GIỜ xóa file. Document bị xóa trong app
// chỉ được chuyển sang deleted/. Một bản cài mới hay một DB rỗng trỏ vào cùng thư mục
// cũng không thể làm mất dữ liệu đã sao lưu.

const ID = /^(note|book|tag|template):[A-Za-z0-9_-]{1,64}$/
const FOLDER = { note: 'notes', book: 'books', tag: 'tags', template: 'templates' } as const
type Kind = keyof typeof FOLDER

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
      if (!isValidDoc(doc)) continue
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
      renameSync(from, join(toDir, fileName(id)))
      written++
    }
    updateSettings({ lastBackupAt: Date.now() })
    return { ok: true, written }
  } catch (err) {
    return { ok: false, written: 0, error: (err as Error).message }
  }
}

/** Đọc mọi document (trừ thư mục deleted/) từ một thư mục sao lưu. */
export function readBackup(dir: string): { docs: BackupDoc[]; error?: string } {
  if (!existsSync(join(dir, 'nibmark-backup.json'))) {
    return { docs: [], error: 'This folder is not a Nibmark backup.' }
  }
  const docs: BackupDoc[] = []
  for (const sub of Object.values(FOLDER)) {
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
  return { docs }
}
