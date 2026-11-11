import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { cx, isMac } from '@/lib/util'
import { backupNow, exportNote, exportNotes, restoreFromBackup } from '@/lib/actions'
import { flushBackup, startBackup } from '@/lib/backup'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenuHost } from './components/ContextMenu'
import { NoteList } from './components/NoteList'
import { NotePane } from './components/NotePane'
import { Notice } from './components/Notice'
import { Preferences } from './components/Preferences'
import { Sidebar } from './components/Sidebar'

let started = false

export function App(): React.JSX.Element {
  const ready = useStore((s) => s.ready)
  const distractionFree = useStore((s) => s.distractionFree)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // StrictMode gọi effect hai lần khi dev; chỉ khởi tạo DB một lần
    if (!started) {
      started = true
      void useStore.getState().init().then(startBackup)
    }
    const flush = (): void => {
      useStore.getState().flush()
      void flushBackup()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('blur', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('blur', flush)
    }
  }, [])

  // Lệnh từ menu ứng dụng (File, Preferences)
  useEffect(() => {
    return window.nibmark?.onMenu((command) => {
      const s = useStore.getState()
      if (command === 'preferences') s.setPrefsOpen(true)
      else if (command === 'new-note') s.createNote()
      else if (command === 'export-note') void exportNote()
      else if (command === 'export-all') void exportNotes(null)
      else if (command === 'backup-now') void backupNow()
      else if (command === 'restore') void restoreFromBackup()
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.prefsOpen || s.palette) return
      if (e.key === 'Escape' && s.distractionFree && !e.defaultPrevented) {
        s.toggleDistractionFree()
        return
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (e.shiftKey) {
        if (key === 'd') s.toggleDistractionFree()
        else if (key === 'f') {
          if (s.distractionFree) s.toggleDistractionFree()
          requestAnimationFrame(() => searchRef.current?.focus())
        } else return
      } else if (key === 'k') {
        s.setPalette('commands')
      } else if (key === 't') {
        s.setPalette('templates')
      } else if (key === 'n') {
        s.createNote()
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.note-title')?.focus())
      } else if (key === 'e') {
        s.setViewMode(s.viewMode === 'preview' ? 'edit' : 'preview')
      } else if (key === 'p') {
        s.setViewMode(s.viewMode === 'split' ? 'edit' : 'split')
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    // capture để phím tắt toàn app chạy trước keymap của editor
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  if (!ready) return <div className="boot" />

  return (
    <div className={cx('app', isMac() && 'mac', distractionFree && 'distraction-free')}>
      <Sidebar />
      <NoteList searchRef={searchRef} />
      <NotePane />
      <ContextMenuHost />
      <CommandPalette />
      <Preferences />
      <Notice />
    </div>
  )
}
