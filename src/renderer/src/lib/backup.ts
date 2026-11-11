import { db, loadAll, putDoc } from './db'
import type { AnyDoc, Note } from './types'

// Sao lưu liên tục: lắng nghe changes feed của PouchDB nên bắt được mọi thay đổi,
// kể cả thay đổi hàng loạt (xóa notebook, dọn thùng rác), khôi phục, và sync sau này.

const DEBOUNCE_MS = 1500

const pendingUpserts = new Map<string, AnyDoc>()
const pendingDeletes = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let started = false

type Listener = (status: BackupStatus) => void
export interface BackupStatus {
  lastBackupAt: number | null
  error: string | null
}
const listeners = new Set<Listener>()
let status: BackupStatus = { lastBackupAt: null, error: null }

function emit(next: Partial<BackupStatus>): void {
  status = { ...status, ...next }
  for (const l of listeners) l(status)
}

export function onBackupStatus(listener: Listener): () => void {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

async function send(upserts: AnyDoc[], deletes: string[]): Promise<boolean> {
  const bridge = window.nibmark
  if (!bridge || (!upserts.length && !deletes.length)) return true
  try {
    const res = await bridge.backup.write(upserts, deletes)
    if (res.ok) emit({ lastBackupAt: Date.now(), error: null })
    else emit({ error: res.error ?? 'Backup failed' })
    return res.ok
  } catch (err) {
    emit({ error: (err as Error).message })
    return false
  }
}

export async function flushBackup(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  const upserts = [...pendingUpserts.values()]
  const deletes = [...pendingDeletes]
  pendingUpserts.clear()
  pendingDeletes.clear()
  const ok = await send(upserts, deletes)
  if (!ok) {
    // Ghi lỗi (ví dụ thư mục tạm thời không truy cập được) thì giữ lại để lần sau thử tiếp
    for (const d of upserts) if (!pendingUpserts.has(d._id)) pendingUpserts.set(d._id, d)
    for (const id of deletes) pendingDeletes.add(id)
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushBackup(), DEBOUNCE_MS)
}

/** Ghi toàn bộ dữ liệu hiện có. Main bỏ qua những file không đổi. */
export async function backupEverything(): Promise<boolean> {
  return send(await loadAll(), [])
}

export function startBackup(): void {
  if (started || !window.nibmark) return
  started = true

  db.changes({ since: 'now', live: true, include_docs: true }).on('change', (change) => {
    if (change.id.startsWith('_design/')) return
    if (change.deleted) {
      pendingUpserts.delete(change.id)
      pendingDeletes.add(change.id)
    } else if (change.doc) {
      const { _rev: _ignored, ...doc } = change.doc as AnyDoc & { _rev?: string }
      pendingDeletes.delete(change.id)
      pendingUpserts.set(change.id, doc as AnyDoc)
    }
    schedule()
  })

  // Bù cho những thay đổi có thể chưa kịp sao lưu trước lần thoát app trước
  void backupEverything()
  void window.nibmark.settings.get().then((s) => emit({ lastBackupAt: s.lastBackupAt }))
}

export interface RestoreResult {
  restored: number
  skipped: number
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const STATUS_IDS = ['none', 'active', 'onHold', 'completed', 'dropped']

/** Chuẩn hóa document đọc từ file, để file bị sửa tay hay thiếu trường không làm hỏng app. */
function normalize(raw: unknown): AnyDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const now = Date.now()
  const base = { _id: str(d._id), createdAt: num(d.createdAt, now), updatedAt: num(d.updatedAt, now) }
  if (d.type === 'note') {
    return {
      ...base,
      type: 'note',
      title: str(d.title),
      body: str(d.body),
      bookId: str(d.bookId),
      tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
      status: (STATUS_IDS.includes(d.status as string) ? d.status : 'none') as Note['status'],
      pinned: d.pinned === true,
      trashed: d.trashed === true
    }
  }
  if (d.type === 'book') {
    return { ...base, type: 'book', name: str(d.name, 'Untitled'), parentId: typeof d.parentId === 'string' ? d.parentId : null }
  }
  if (d.type === 'template') {
    return {
      ...base,
      type: 'template',
      name: str(d.name, 'Untitled Template'),
      title: str(d.title),
      body: str(d.body),
      tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
      status: (STATUS_IDS.includes(d.status as string) ? d.status : 'none') as Note['status']
    }
  }
  if (d.type === 'tag') {
    return { ...base, type: 'tag', name: str(d.name, 'tag'), color: str(d.color, '#7A7168') }
  }
  return null
}

/**
 * Khôi phục kiểu gộp: chỉ ghi những document chưa có, hoặc bản sao lưu mới hơn bản đang có.
 * Không bao giờ ghi đè một ghi chú mới hơn trong app.
 */
export async function restoreDocs(docs: unknown[], current: Map<string, AnyDoc>): Promise<RestoreResult> {
  let restored = 0
  let skipped = 0
  for (const raw of docs) {
    const doc = normalize(raw)
    if (!doc) {
      skipped++
      continue
    }
    const local = current.get(doc._id)
    if (local && local.updatedAt >= doc.updatedAt) {
      skipped++
      continue
    }
    await putDoc(doc)
    restored++
  }
  return { restored, skipped }
}
