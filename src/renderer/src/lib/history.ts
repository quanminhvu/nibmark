import PouchDB from 'pouchdb-browser'
import { useStore } from './store'
import type { Note } from './types'

// Lịch sử phiên bản của từng ghi chú.
// - Lưu trong một cơ sở dữ liệu RIÊNG, chỉ trên máy này: không đồng bộ, không nằm trong
//   thư mục sao lưu, và không làm chậm việc nạp ghi chú lúc mở app.
// - Một phiên bản được lưu khi bạn ngừng gõ một lúc, và trước lần sửa đầu tiên của mỗi
//   đợt sửa (để luôn quay lại được bản trước khi sửa).

export interface Revision {
  _id: string // "rev:<noteId>:<thời điểm>"
  noteId: string
  title: string
  body: string
  createdAt: number
}

const historyDb = new PouchDB<Revision>('nibmark-history', { auto_compaction: true })

const IDLE_MS = 5000
const MAX_PER_NOTE = 200

const prefix = (noteId: string): string => `rev:${noteId}:`
const revId = (noteId: string, at: number): string => `${prefix(noteId)}${String(at).padStart(15, '0')}`

export async function listRevisions(noteId: string): Promise<Revision[]> {
  const res = await historyDb.allDocs({
    include_docs: true,
    startkey: prefix(noteId) + '￿',
    endkey: prefix(noteId),
    descending: true
  })
  return res.rows.map((r) => r.doc!).filter(Boolean)
}

async function latest(noteId: string): Promise<Revision | undefined> {
  const res = await historyDb.allDocs({
    include_docs: true,
    startkey: prefix(noteId) + '￿',
    endkey: prefix(noteId),
    descending: true,
    limit: 1
  })
  return res.rows[0]?.doc
}

// Ghi tuần tự theo ghi chú để hai lần lưu không chen nhau
const chains = new Map<string, Promise<unknown>>()
function queue(noteId: string, task: () => Promise<unknown>): Promise<unknown> {
  const next = (chains.get(noteId) ?? Promise.resolve()).then(task, task).catch((err) => console.error('History', err))
  chains.set(noteId, next)
  return next
}

/** Lưu một phiên bản nếu khác phiên bản gần nhất. */
export function snapshot(note: Pick<Note, '_id' | 'title' | 'body'>): Promise<unknown> {
  const { _id: noteId, title, body } = note
  return queue(noteId, async () => {
    const last = await latest(noteId)
    if (last && last.title === title && last.body === body) return
    if (!last && !title && !body) return
    const at = Math.max(Date.now(), (last?.createdAt ?? 0) + 1)
    await historyDb.put({ _id: revId(noteId, at), noteId, title, body, createdAt: at })
    // Giữ tối đa MAX_PER_NOTE phiên bản mỗi ghi chú, bỏ những bản cũ nhất
    const all = await historyDb.allDocs({ startkey: prefix(noteId), endkey: prefix(noteId) + '￿' })
    const extra = all.rows.length - MAX_PER_NOTE
    if (extra > 0) {
      await historyDb.bulkDocs(all.rows.slice(0, extra).map((r) => ({ _id: r.id, _rev: r.value.rev, _deleted: true }) as never))
    }
  })
}

async function removeAll(noteId: string): Promise<void> {
  const all = await historyDb.allDocs({ startkey: prefix(noteId), endkey: prefix(noteId) + '￿' })
  if (all.rows.length) await historyDb.bulkDocs(all.rows.map((r) => ({ _id: r.id, _rev: r.value.rev, _deleted: true }) as never))
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let started = false

export function startHistory(): void {
  if (started) return
  started = true
  useStore.subscribe((state, prev) => {
    if (state.notes === prev.notes) return
    for (const [id, note] of Object.entries(state.notes)) {
      const before = prev.notes[id]
      if (!before || (before.body === note.body && before.title === note.title)) continue
      // Đầu một đợt sửa: giữ lại bản trước khi sửa
      if (!timers.has(id)) void snapshot(before)
      clearTimeout(timers.get(id))
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id)
          const current = useStore.getState().notes[id]
          if (current) void snapshot(current)
        }, IDLE_MS)
      )
    }
    // Ghi chú bị xóa vĩnh viễn thì xóa luôn lịch sử của nó
    for (const id of Object.keys(prev.notes)) {
      if (!state.notes[id]) {
        clearTimeout(timers.get(id))
        timers.delete(id)
        void queue(id, () => removeAll(id))
      }
    }
  })
  // Đóng app giữa chừng: lưu ngay những đợt sửa đang chờ
  window.addEventListener('beforeunload', flushHistory)
}

export function flushHistory(): void {
  for (const [id, timer] of timers) {
    clearTimeout(timer)
    const current = useStore.getState().notes[id]
    if (current) void snapshot(current)
  }
  timers.clear()
}

/** Khôi phục một phiên bản (lưu bản hiện tại trước, để có thể hoàn tác). */
export async function restoreRevision(rev: Revision): Promise<void> {
  const note = useStore.getState().notes[rev.noteId]
  if (!note) return
  flushHistory()
  await snapshot(note)
  useStore.getState().updateNote(note._id, { title: rev.title, body: rev.body })
  useStore.getState().flush()
}

export interface HistoryActivity {
  /** Ngày (YYYY-MM-DD, giờ địa phương) → các ghi chú được sửa hôm đó */
  edited: Map<string, Set<string>>
  /** Ngày → số task được đánh dấu xong (so sánh hai phiên bản liền nhau) */
  completed: Map<string, number>
  /** Phiên bản cũ nhất trên máy này (để nói rõ dữ liệu tính từ khi nào) */
  since: number | null
}

const DONE_TASK = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[xX]\]/gm

export function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Đọc toàn bộ lịch sử phiên bản để dựng thống kê hoạt động. */
export async function historyActivity(): Promise<HistoryActivity> {
  const res = await historyDb.allDocs({ include_docs: true })
  const edited = new Map<string, Set<string>>()
  const completed = new Map<string, number>()
  let since: number | null = null
  // Khóa "rev:<noteId>:<thời điểm>" đã sắp theo ghi chú rồi theo thời gian
  let prevNote = ''
  let prevDone = 0
  for (const row of res.rows) {
    const rev = row.doc
    if (!rev?.noteId) continue
    const day = dayKey(rev.createdAt)
    since = since === null ? rev.createdAt : Math.min(since, rev.createdAt)
    const done = (rev.body.match(DONE_TASK) ?? []).length
    if (rev.noteId === prevNote) {
      if (!edited.has(day)) edited.set(day, new Set())
      edited.get(day)!.add(rev.noteId)
      if (done > prevDone) completed.set(day, (completed.get(day) ?? 0) + (done - prevDone))
    }
    prevNote = rev.noteId
    prevDone = done
  }
  return { edited, completed, since }
}
