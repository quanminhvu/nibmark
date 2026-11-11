import { db, loadAll, putDoc } from './db'
import type { AnyDoc, FileDoc, Note } from './types'

// Sao lưu liên tục: lắng nghe changes feed của PouchDB nên bắt được mọi thay đổi,
// kể cả thay đổi hàng loạt (xóa notebook, dọn thùng rác), khôi phục, và sync sau này.

const DEBOUNCE_MS = 1500

const pendingUpserts = new Map<string, AnyDoc>()
const pendingDeletes = new Set<string>()
/** File đính kèm chờ sao lưu (gửi riêng vì có nội dung nhị phân) */
const pendingFiles = new Set<string>()
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

/** Sao lưu những file đính kèm mà thư mục sao lưu chưa có (file không bao giờ đổi). */
async function backupFiles(ids: string[]): Promise<boolean> {
  const bridge = window.nibmark
  if (!bridge || !ids.length) return true
  try {
    const missing = await bridge.backup.missingFiles(ids)
    for (const id of missing) {
      const doc = (await db.get(id, { attachments: true, binary: true })) as unknown as FileDoc & {
        _attachments?: { data?: { data?: Blob } }
      }
      const blob = doc._attachments?.data?.data
      if (!blob) continue
      const meta: FileDoc = {
        _id: doc._id,
        type: 'file',
        name: doc.name,
        contentType: doc.contentType,
        size: doc.size,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }
      const res = await bridge.backup.writeFile(meta, new Uint8Array(await blob.arrayBuffer()))
      if (!res.ok) {
        emit({ error: res.error ?? 'Backup failed' })
        return false
      }
    }
    if (missing.length) emit({ lastBackupAt: Date.now(), error: null })
    return true
  } catch (err) {
    emit({ error: (err as Error).message })
    return false
  }
}

export async function flushBackup(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  const files = [...pendingFiles]
  pendingFiles.clear()
  if (!(await backupFiles(files))) for (const id of files) pendingFiles.add(id)
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
  const docs = await loadAll()
  const files = docs.filter((d) => d.type === 'file').map((d) => d._id)
  const ok = await send(
    docs.filter((d) => d.type !== 'file'),
    []
  )
  return (await backupFiles(files)) && ok
}

export function startBackup(): void {
  if (started || !window.nibmark) return
  started = true

  db.changes({ since: 'now', live: true, include_docs: true }).on('change', (change) => {
    if (change.id.startsWith('_design/')) return
    if (change.deleted) {
      pendingUpserts.delete(change.id)
      pendingFiles.delete(change.id)
      pendingDeletes.add(change.id)
    } else if (change.id.startsWith('file:')) {
      pendingFiles.add(change.id)
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
      status: ((STATUS_IDS.includes(d.status as string) || /^status:[A-Za-z0-9_-]{1,64}$/.test(str(d.status))) ? d.status : 'none') as Note['status'],
      pinned: d.pinned === true,
      trashed: d.trashed === true
    }
  }
  if (d.type === 'book') {
    return {
      ...base,
      type: 'book',
      name: str(d.name, 'Untitled'),
      parentId: typeof d.parentId === 'string' ? d.parentId : null,
      ...(typeof d.icon === 'string' && /^[A-Z][A-Za-z0-9]{1,60}$/.test(d.icon) ? { icon: d.icon } : {}),
      ...(typeof d.order === 'number' && Number.isFinite(d.order) ? { order: d.order } : {})
    }
  }
  if (d.type === 'template') {
    return {
      ...base,
      type: 'template',
      name: str(d.name, 'Untitled Template'),
      title: str(d.title),
      body: str(d.body),
      tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
      status: ((STATUS_IDS.includes(d.status as string) || /^status:[A-Za-z0-9_-]{1,64}$/.test(str(d.status))) ? d.status : 'none') as Note['status'],
      ...(typeof d.bookId === 'string' && d.bookId.startsWith('book:') ? { bookId: d.bookId } : {})
    }
  }
  if (d.type === 'status' && /^status:[A-Za-z0-9_-]{1,64}$/.test(base._id)) {
    return { ...base, _id: base._id as `status:${string}`, type: 'status', ...(d.deleted === true ? { deleted: true } : {}), ...(typeof d.icon === 'string' && /^[A-Z][A-Za-z0-9]{1,60}$/.test(d.icon) ? { icon: d.icon } : {}), name: str(d.name, 'Status'), color: /^#[0-9a-f]{6}$/i.test(str(d.color)) ? str(d.color) : '#2F6FE4' }
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
export async function restoreDocs(
  docs: unknown[],
  current: Map<string, AnyDoc>,
  files: { meta: unknown; data: Uint8Array }[] = []
): Promise<RestoreResult> {
  let restored = 0
  let skipped = 0
  // File đính kèm: chỉ thêm những file chưa có (file không bao giờ đổi nội dung)
  for (const { meta, data } of files) {
    const m = meta as Partial<FileDoc>
    if (typeof m._id !== 'string' || !/^file:[A-Za-z0-9_-]{1,64}$/.test(m._id) || !(data instanceof Uint8Array)) {
      skipped++
      continue
    }
    try {
      await db.get(m._id)
      skipped++
      continue
    } catch {
      // chưa có: khôi phục
    }
    const contentType = typeof m.contentType === 'string' ? m.contentType : 'application/octet-stream'
    const now = Date.now()
    await db.put({
      _id: m._id,
      type: 'file',
      name: typeof m.name === 'string' ? m.name : 'attachment',
      contentType,
      size: data.byteLength,
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : now,
      updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : now,
      _attachments: { data: { content_type: contentType, data: new Blob([data as BlobPart], { type: contentType }) } }
    } as never)
    restored++
  }
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
