import { execFile } from 'node:child_process'
import type { ImportAsset, ImportDoc, ImportScan } from './importer'

// Import từ Apple Notes (chỉ macOS). Đọc qua JXA (osascript): macOS sẽ hỏi người dùng
// cho phép Nibmark điều khiển ứng dụng Notes ở lần đầu. Không đọc ghi chú có khóa
// và bỏ qua thư mục "Recently Deleted".

const SCRIPT = `
const Notes = Application('Notes')
const out = { folders: [] }
const accounts = Notes.accounts()
for (const acc of accounts) {
  for (const f of acc.folders()) {
    const name = f.name()
    if (/^(Recently Deleted|Đã xóa gần đây)$/i.test(name)) continue
    const n = f.notes
    const titles = n.name(), bodies = n.body(), created = n.creationDate(), modified = n.modificationDate(), locked = n.passwordProtected()
    const notes = []
    for (let i = 0; i < titles.length; i++) {
      if (locked[i]) { notes.push({ title: titles[i], locked: true }); continue }
      notes.push({ title: titles[i], body: bodies[i], created: created[i] ? created[i].getTime() : null, modified: modified[i] ? modified[i].getTime() : null })
    }
    out.folders.push({ account: acc.name(), folder: name, notes })
  }
}
JSON.stringify(out)
`

export interface AppleNotesDump {
  folders: { account: string; folder: string; notes: { title: string; body?: string; created?: number | null; modified?: number | null; locked?: boolean }[] }[]
}

function runJxa(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT], { maxBuffer: 1024 * 1024 * 1024, timeout: 15 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        // -1743: người dùng (hoặc hệ thống) không cho phép điều khiển Notes
        const denied = /-1743|not authorized|không được phép/i.test(`${stderr} ${err.message}`)
        reject(new Error(denied ? 'not-allowed' : (stderr || err.message).trim().slice(0, 300)))
      } else resolve(stdout)
    })
  })
}

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/tiff': 'tiff', 'application/pdf': 'pdf' }

/** Ảnh nhúng dạng data: trong HTML → file đính kèm, để ghi chú không chứa chuỗi base64 khổng lồ. */
export function extractDataImages(html: string, base: string): { html: string; assets: Record<string, ImportAsset> } {
  const assets: Record<string, ImportAsset> = {}
  let n = 0
  const out = html.replace(/(<img\b[^>]*?\bsrc=")data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)"/gi, (all, pre: string, mime: string, b64: string) => {
    const ext = MIME_EXT[mime.toLowerCase()]
    if (!ext) return all
    n++
    const ref = `${base}-${n}.${ext}`
    assets[ref] = { name: ref, mime: mime.toLowerCase(), data: new Uint8Array(Buffer.from(b64.replace(/\s+/g, ''), 'base64')) }
    return `${pre}${ref}"`
  })
  return { html: out, assets }
}

/** Chuyển dữ liệu đọc từ Notes thành dạng import chung (renderer chuyển HTML → Markdown). */
export function scanFromDump(dump: AppleNotesDump): ImportScan {
  const docs: ImportDoc[] = []
  const skipped: ImportScan['skipped'] = []
  const multiAccount = new Set(dump.folders.map((f) => f.account)).size > 1
  for (const f of dump.folders) {
    const folders = multiAccount ? [f.account, f.folder] : [f.folder]
    f.notes.forEach((note, i) => {
      if (note.locked) {
        skipped.push({ path: `${f.folder}/${note.title}`, reason: 'locked note (unlock it in Notes first)' })
        return
      }
      const title = (note.title || 'Untitled').slice(0, 300)
      const safe = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'note'
      const { html, assets } = extractDataImages(note.body ?? '', `${safe}-${i + 1}`)
      const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      docs.push({
        folders,
        name: title,
        ext: '.applenote',
        text: `<html><head><title>${escaped}</title></head><body>${html}</body></html>`,
        created: note.created ?? null,
        modified: note.modified ?? null,
        assets
      })
    })
  }
  return { label: 'Apple Notes', docs, skipped }
}

export async function readAppleNotes(): Promise<ImportScan | { error: string }> {
  if (process.platform !== 'darwin') return { error: 'Apple Notes is only available on macOS.' }
  try {
    const raw = await runJxa()
    return scanFromDump(JSON.parse(raw) as AppleNotesDump)
  } catch (err) {
    const message = (err as Error).message
    return {
      error:
        message === 'not-allowed'
          ? 'Nibmark is not allowed to read Notes. Allow it in System Settings → Privacy & Security → Automation, then try again.'
          : `Could not read Apple Notes: ${message}`
    }
  }
}
