import { useStore } from './store'
import { noteLinkUrl } from './noteLinks'

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    useStore.getState().showNotice(`Copied ${what}.`)
  } catch {
    useStore.getState().showNotice('Could not copy to the clipboard.', 'error')
  }
}

/** Link Markdown tới ghi chú, cùng định dạng với [[ */
export function copyNoteLink(noteId: string): void {
  const note = useStore.getState().notes[noteId]
  if (!note) return
  const text = (note.title.trim() || 'Untitled').replace(/([[\]\\])/g, '\\$1')
  void copy(`[${text}](${noteLinkUrl(noteId)})`, 'note link')
}

export function copyId(id: string): void {
  void copy(id, 'ID')
}
