import { useStore } from './store'
import { allTemplates, applyTemplate, BUILTIN_TEMPLATES, fillPlaceholders } from './templates'
import type { TemplateLike } from './templates'

/** Template cho ghi chú ngày: ưu tiên template tự tạo có chữ "daily", không thì dùng Daily Log có sẵn */
function dailyTemplate(): TemplateLike {
  const own = allTemplates().find((t) => !t.builtin && /\bdaily\b/i.test(t.name))
  return own ?? BUILTIN_TEMPLATES.find((t) => t.id === 'builtin:daily')!
}

const sameDay = (a: number, b: Date): boolean => {
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

/** Ghi chú của hôm nay nếu đã có (không mở, không tạo) */
export function findTodayNote(now = new Date()): string | null {
  const template = dailyTemplate()
  const title = fillPlaceholders(template.title, now).trim()
  // Tiêu đề có ngày thì so tiêu đề; template không có ngày trong tiêu đề thì so ngày tạo
  const datedTitle = /\{\{\s*(date|day|datetime)\s*\}\}/i.test(template.title)
  const existing = Object.values(useStore.getState().notes)
    .filter((n) => !n.trashed && n.title.trim() === title && (datedTitle || sameDay(n.createdAt, now)))
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  return existing?._id ?? null
}

/** Ghi chú hôm nay, chưa có thì tạo từ template ngày mà không đổi ghi chú đang xem (dùng cho MCP) */
export function ensureTodayNoteSilently(now = new Date()): string {
  const found = findTodayNote(now)
  if (found) return found
  const template = dailyTemplate()
  const s = useStore.getState()
  const id = s.createNoteSilently(fillPlaceholders(template.title, now))
  const tags = [
    ...(template.tagIds ?? []).filter((t) => useStore.getState().tags[t]),
    ...(template.tagNames ?? []).map((name) => useStore.getState().ensureTag(name))
  ]
  useStore.getState().updateNote(id, {
    body: fillPlaceholders(template.body, now),
    tags: [...new Set(tags)],
    ...(template.status !== 'none' ? { status: template.status } : {}),
    ...(template.bookId && useStore.getState().books[template.bookId] ? { bookId: template.bookId } : {})
  })
  return id
}

/**
 * Mở ghi chú của hôm nay; chưa có thì tạo từ template ngày.
 * Nhận ra ghi chú hôm nay qua tiêu đề (vd "2026-11-12 Thursday"), nên đổi máy hay
 * khởi động lại app vẫn không tạo trùng.
 */
export function openTodayNote(now = new Date()): string {
  const existing = findTodayNote(now)
  if (existing) {
    useStore.getState().openNote(existing)
    return existing
  }
  applyTemplate(dailyTemplate())
  return useStore.getState().selectedNoteId ?? ''
}
