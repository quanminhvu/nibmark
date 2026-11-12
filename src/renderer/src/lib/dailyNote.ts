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

/**
 * Mở ghi chú của hôm nay; chưa có thì tạo từ template ngày.
 * Nhận ra ghi chú hôm nay qua tiêu đề (vd "2026-11-12 Thursday"), nên đổi máy hay
 * khởi động lại app vẫn không tạo trùng.
 */
export function openTodayNote(now = new Date()): string {
  const template = dailyTemplate()
  const title = fillPlaceholders(template.title, now).trim()
  const s = useStore.getState()
  const candidates = Object.values(s.notes).filter((n) => !n.trashed)
  // Tiêu đề có ngày thì so tiêu đề; template không có ngày trong tiêu đề thì so ngày tạo
  const datedTitle = /\{\{\s*(date|day|datetime)\s*\}\}/i.test(template.title)
  const existing = candidates
    .filter((n) => (datedTitle ? n.title.trim() === title : n.title.trim() === title && sameDay(n.createdAt, now)))
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (existing) {
    s.openNote(existing._id)
    return existing._id
  }
  applyTemplate(template)
  return useStore.getState().selectedNoteId ?? ''
}
