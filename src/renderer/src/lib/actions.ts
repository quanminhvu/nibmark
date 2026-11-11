import { backupEverything, flushBackup, restoreDocs } from './backup'
import { buildExport, noteToMarkdown } from './exportMarkdown'
import { useStore } from './store'
import type { AnyDoc } from './types'

// Các thao tác liên quan tới file (export, sao lưu, khôi phục), dùng chung cho
// menu ứng dụng, menu chuột phải và cửa sổ Preferences.

const bridge = (): NibmarkBridge | null => {
  if (window.nibmark) return window.nibmark
  useStore.getState().showNotice('This action is only available in the desktop app.', 'error')
  return null
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export async function exportNote(noteId: string | null = useStore.getState().selectedNoteId): Promise<void> {
  const b = bridge()
  const s = useStore.getState()
  const note = noteId ? s.notes[noteId] : undefined
  if (!b || !note) return
  s.flush()
  const path = await b.exporter.note(note.title || 'Untitled', noteToMarkdown(note, s.books, s.tags))
  if (path) s.showNotice(`Exported to ${path}`)
}

export async function exportNotes(bookId: string | null): Promise<void> {
  const b = bridge()
  const s = useStore.getState()
  if (!b) return
  s.flush()
  const files = buildExport(Object.values(s.notes), s.books, s.tags, bookId)
  if (!files.length) {
    s.showNotice('There are no notes to export.')
    return
  }
  const label = bookId ? (s.books[bookId]?.name ?? 'Notebook') : 'Nibmark Export'
  const res = await b.exporter.tree(label, files)
  if (res) s.showNotice(`Exported ${plural(res.count, 'note')} to ${res.path}`)
}

export async function backupNow(): Promise<void> {
  const b = bridge()
  const s = useStore.getState()
  if (!b) return
  const settings = await b.settings.get()
  if (!settings.backupEnabled) {
    s.showNotice('Backup is turned off. Turn it on in Preferences.', 'error')
    return
  }
  s.flush()
  await flushBackup()
  const ok = await backupEverything()
  s.showNotice(ok ? 'Backup is up to date.' : 'Backup failed. Check the backup folder in Preferences.', ok ? 'info' : 'error')
}

export async function restoreFromBackup(): Promise<void> {
  const b = bridge()
  const s = useStore.getState()
  if (!b) return
  const res = await b.backup.pickAndRead()
  if (!res) return
  if (res.error) {
    s.showNotice(res.error, 'error')
    return
  }
  s.flush()
  const current = new Map<string, AnyDoc>()
  for (const table of [s.notes, s.books, s.tags, s.templates]) for (const doc of Object.values(table)) current.set(doc._id, doc)
  const { restored, skipped } = await restoreDocs(res.docs, current)
  s.showNotice(
    restored
      ? `Restored ${plural(restored, 'item')}${skipped ? ` (${skipped} already up to date)` : ''}.`
      : 'Nothing to restore: everything in this backup is already in Nibmark.'
  )
}
