import { getActiveEditor } from './editorCommands'
import { useEditorPrefs } from './editorPrefs'
import { applyFormatted, formatMarkdown } from './formatMarkdown'
import { useStore } from './store'

/**
 * Format ghi chú (mặc định: ghi chú đang mở). Nếu ghi chú đang mở trong editor thì sửa qua editor
 * (giữ con trỏ, ⌘Z hoàn tác được); không thì ghi thẳng vào ghi chú.
 */
export async function formatNote(noteId: string | null = useStore.getState().selectedNoteId, quiet = false): Promise<void> {
  const s = useStore.getState()
  const note = noteId ? s.notes[noteId] : undefined
  if (!note || note.trashed) return
  const view = s.selectedNoteId === note._id ? getActiveEditor() : null
  const source = view ? view.state.doc.toString() : note.body
  let formatted: string
  try {
    formatted = await formatMarkdown(source)
  } catch (err) {
    if (!quiet) s.showNotice(`Could not format this note: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`, 'error')
    return
  }
  if (view && view.dom.isConnected) {
    // Người dùng gõ tiếp trong lúc đang format: bỏ qua, tránh ghi đè chữ vừa gõ
    if (view.state.doc.toString() !== source) return
    if (!applyFormatted(view, formatted) && !quiet) s.showNotice('This note is already formatted.')
    return
  }
  const latest = useStore.getState().notes[note._id]
  if (!latest || latest.body !== source) return
  if (formatted === source) {
    if (!quiet) s.showNotice('This note is already formatted.')
    return
  }
  useStore.getState().updateNote(note._id, { body: formatted })
}

/**
 * Tùy chọn "tự format khi rời ghi chú": chỉ format ghi chú vừa được sửa trong lần mở này
 * (không đụng ghi chú chỉ xem qua, để thứ tự "sửa gần nhất" không bị xáo trộn).
 */
export function startFormatOnLeave(): () => void {
  let openedId = useStore.getState().selectedNoteId
  let openedBody = openedId ? useStore.getState().notes[openedId]?.body ?? null : null
  return useStore.subscribe((s, prev) => {
    if (s.selectedNoteId === prev.selectedNoteId) return
    const leftId = openedId
    const leftBody = openedBody
    openedId = s.selectedNoteId
    openedBody = openedId ? s.notes[openedId]?.body ?? null : null
    if (!leftId || !useEditorPrefs.getState().formatOnLeave) return
    const left = s.notes[leftId]
    if (left && !left.trashed && left.body !== leftBody) void formatNote(leftId, true)
  })
}
