import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { fuzzyMatch } from './fuzzy'
import type { FuzzyMatch } from './fuzzy'
import { useStore } from './store'
import type { Note } from './types'
import { relativeTime } from './util'

// Liên kết nội bộ dạng [Tiêu đề](nibmark://note/<hex>). Id trong DB là "note:<hex>",
// nhưng dấu ":" không hợp trong URL nên chỉ giữ phần sau.
export const NOTE_LINK_PREFIX = 'nibmark://note/'

export const noteLinkUrl = (noteId: string): string => NOTE_LINK_PREFIX + noteId.slice('note:'.length)

export function noteIdFromUrl(url: string): string | null {
  if (!url.startsWith(NOTE_LINK_PREFIX)) return null
  const hex = url.slice(NOTE_LINK_PREFIX.length).replace(/[/?#].*$/, '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(hex) ? `note:${hex}` : null
}

/** Chữ hiển thị của link: thoát ngoặc vuông để không làm vỡ cú pháp Markdown */
const linkText = (title: string): string => (title.trim() || 'Untitled').replace(/([[\]\\])/g, '\\$1')

function insertLink(view: EditorView, from: number, to: number, noteId: string, title: string): void {
  // closeBrackets đã tự chèn "]]" sau con trỏ khi gõ "[["; xóa luôn phần đó
  let end = to
  const after = view.state.sliceDoc(to, to + 2)
  if (after === ']]') end += 2
  else if (after.startsWith(']')) end += 1
  const insert = `[${linkText(title)}](${noteLinkUrl(noteId)})`
  view.dispatch({
    changes: { from, to: end, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.complete'
  })
}

/**
 * Nguồn gợi ý cho CodeMirror: kích hoạt khi gõ "[[".
 * Tự lọc và xếp hạng (filter: false) để ghi chú có sẵn luôn đứng trước,
 * còn lựa chọn "Create note" luôn nằm cuối.
 */
export function noteLinkCompletions(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[[^[\]\n]*$/)
  if (!match) return null
  const query = match.text.slice(2)
  const trimmed = query.trim()
  const s = useStore.getState()
  const currentId = s.selectedNoteId

  const ranked = Object.values(s.notes)
    .filter((n) => !n.trashed && n._id !== currentId)
    .map((n) => ({ note: n, m: trimmed ? fuzzyMatch(trimmed, n.title || 'Untitled') : { score: 0, indices: [] } }))
    .filter((x): x is { note: Note; m: FuzzyMatch } => !!x.m)
    .sort((a, b) => b.m.score - a.m.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, 50)

  const options: Completion[] = ranked.map(({ note }) => ({
    label: note.title || 'Untitled',
    detail: `${s.books[note.bookId]?.name ?? ''} · ${relativeTime(note.updatedAt)}`,
    type: 'text',
    apply: (view, _completion, from, to) => insertLink(view, from - 2, to, note._id, note.title)
  }))

  const exists = Object.values(s.notes).some((n) => !n.trashed && n.title.trim().toLowerCase() === trimmed.toLowerCase())
  if (trimmed && !exists) {
    options.push({
      label: `Create note “${trimmed}”`,
      detail: 'new',
      type: 'keyword',
      apply: (view, _completion, from, to) => {
        const id = useStore.getState().createNoteSilently(trimmed)
        insertLink(view, from - 2, to, id, trimmed)
      }
    })
  }
  if (!options.length) return null

  // from đặt ngay sau "[["; khi chọn thì lùi lại 2 ký tự để thay cả hai dấu ngoặc.
  // Không đặt validFor: danh sách phụ thuộc chữ đang gõ nên phải tính lại mỗi lần.
  return { from: match.from + 2, options, filter: false }
}

/** Mở ghi chú mà link trỏ tới. Trả về false nếu ghi chú không còn. */
export function followNoteLink(url: string): boolean {
  const id = noteIdFromUrl(url)
  if (!id) return false
  const s = useStore.getState()
  if (s.openNote(id)) return true
  s.showNotice('That note no longer exists.', 'error')
  return true
}
