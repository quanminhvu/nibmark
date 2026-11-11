import type { Note } from './types'

export interface TaskItem {
  noteId: string
  noteTitle: string
  /** Dòng trong ghi chú (đếm từ 0) */
  line: number
  /** Thứ tự của ô checkbox trong ghi chú (khớp với toggleTask) */
  index: number
  text: string
  done: boolean
  updatedAt: number
}

const TASK = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/
const FENCE = /^\s*(```|~~~)/

/** Mọi task trong các ghi chú chưa bỏ vào thùng rác, ghi chú sửa gần nhất lên trước. */
export function collectTasks(notes: Record<string, Note>): TaskItem[] {
  const out: TaskItem[] = []
  const list = Object.values(notes)
    .filter((n) => !n.trashed && n.body.includes('['))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  for (const note of list) {
    let fence = false
    let index = -1
    note.body.split('\n').forEach((raw, line) => {
      if (FENCE.test(raw)) {
        fence = !fence
        return
      }
      if (fence) return
      const m = TASK.exec(raw)
      if (!m) return
      index++
      out.push({ noteId: note._id, noteTitle: note.title || 'Untitled', line, index, text: m[2].trim() || '(empty task)', done: m[1] !== ' ', updatedAt: note.updatedAt })
    })
  }
  return out
}
