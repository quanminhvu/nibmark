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
/** Link Markdown tới ghi chú: [Tiêu đề](nibmark://note/…) */
export function noteLinkMarkdown(noteId: string): string {
  const note = useStore.getState().notes[noteId]
  const text = (note?.title.trim() || 'Untitled').replace(/([[\]\\])/g, '\\$1')
  return `[${text}](${noteLinkUrl(noteId)})`
}

export function copyNoteLink(noteId: string): void {
  if (!useStore.getState().notes[noteId]) return
  void copy(noteLinkMarkdown(noteId), 'note link')
}

export function copyId(id: string): void {
  void copy(id, 'ID')
}
