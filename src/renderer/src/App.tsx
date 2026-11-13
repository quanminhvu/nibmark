import type { CSSProperties } from 'react'
import { ResizeHandle, usePaneSize } from './components/ResizeHandle'
import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { cx, isMac } from '@/lib/util'
import { backupNow, exportNote, exportNotes, restoreFromBackup } from '@/lib/actions'
import { flushBackup, startBackup } from '@/lib/backup'
import { runAppleNotesImport, runImport } from '@/lib/importer'
import { runKindleImport } from '@/lib/kindle'
import { exportNoteHtml, exportNotePdf } from '@/lib/exportHtml'
import { toggleOutline } from '@/lib/outline'
import { openTodayNote } from '@/lib/dailyNote'
import { startMcpBridge } from '@/lib/mcpTools'
import { formatNote, startFormatOnLeave } from '@/lib/formatNote'
import { usePresentation } from '@/lib/slides'
import { isGraphOpen, openGraph } from '@/lib/graph'
import { GraphView } from './components/GraphView'
import { Presentation } from './components/Presentation'
import { closeTab, cycleTab, gotoTab, tabsEnabled, useTabs } from '@/lib/tabs'
import { goBack, goForward } from '@/lib/navigation'
import { startSwipeNavigation } from '@/lib/swipe'
import { startHistory } from '@/lib/history'
import { HistoryPanel, isHistoryOpen } from './components/HistoryPanel'
import { ActivityPanel, isActivityOpen } from './components/ActivityPanel'
import { IconPicker } from './components/BookIcon'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenuHost } from './components/ContextMenu'
import { NoteList } from './components/NoteList'
import { NotePane } from './components/NotePane'
import { Notice } from './components/Notice'
import { Preferences } from './components/Preferences'
import { Sidebar } from './components/Sidebar'
import { noteWindowId, openInNewWindow } from './lib/windowMode'

/** Tiêu đề cửa sổ ghi chú riêng = tiêu đề ghi chú */
function NoteWindowTitle(): null {
  const title = useStore((s) => (noteWindowId ? s.notes[noteWindowId]?.title : undefined))
  useEffect(() => {
    document.title = title ? `${title} — Nibmark` : 'Nibmark'
  }, [title])
  return null
}

let started = false

export function App(): React.JSX.Element {
  const [sidebarWidth, setSidebarWidth] = usePaneSize('nibmark:sidebar-width', 228)
  const [listWidth, setListWidth] = usePaneSize('nibmark:list-width', 300)
  const ready = useStore((s) => s.ready)
  const distractionFree = useStore((s) => s.distractionFree)
  const sidebarHidden = useStore((s) => s.sidebarHidden)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // StrictMode gọi effect hai lần khi dev; chỉ khởi tạo DB một lần
    if (!started) {
      started = true
      void useStore
        .getState()
        .init()
        .then(() => {
          if (noteWindowId) {
            useStore.setState({ selectedNoteId: noteWindowId, distractionFree: false })
            return
          }
          startBackup()
          startHistory()
          startSwipeNavigation()
          // Báo cho main là đã sẵn sàng nhận lệnh (ví dụ phím tắt ghi nhanh)
          window.nibmark?.ready()
        })
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

  // AI agent (MCP): chỉ cửa sổ chính nhận yêu cầu
  useEffect(() => startMcpBridge(), [])
  // Tùy chọn tự format khi rời ghi chú vừa sửa
  useEffect(() => startFormatOnLeave(), [])

  // Lệnh từ menu ứng dụng (File, Preferences)
  useEffect(() => {
    return window.nibmark?.onMenu((command) => {
      const s = useStore.getState()
      if (command === 'preferences') s.setPrefsOpen(true)
      else if (command === 'new-note') s.createNote()
      else if (command === 'quick-note') {
        s.setPrefsOpen(false)
        s.setPalette(null)
        if (s.distractionFree) s.toggleDistractionFree()
        s.createNote()
        setTimeout(() => document.querySelector<HTMLInputElement>('.note-title')?.focus(), 0)
      }
      else if (command === 'import') void runImport()
      else if (command === 'export-note') void exportNote()
      else if (command === 'export-all') void exportNotes(null)
      else if (command === 'backup-now') void backupNow()
      else if (command === 'restore') void restoreFromBackup()
      else if (command === 'import-apple-notes') void runAppleNotesImport()
      else if (command === 'import-kindle') void runKindleImport()
      else if (command === 'export-html') void exportNoteHtml()
      else if (command === 'export-pdf') void exportNotePdf()
      else if (command === 'back') goBack()
      else if (command === 'forward') goForward()
      else if (command === 'close-tab') {
        // Đang mở hộp thoại thì Cmd+W đóng hộp thoại trước
        if (s.prefsOpen) return s.setPrefsOpen(false)
        if (s.palette) return s.setPalette(null)
        const id = s.selectedNoteId
        if (tabsEnabled() && id && useTabs.getState().tabs.some((t) => t.id === id)) closeTab(id)
        else window.close()
      }
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.prefsOpen || s.palette || isHistoryOpen() || isActivityOpen() || isGraphOpen() || usePresentation.getState().noteId) return
      // Esc trong một ô chọn/ô nhập nổi (notebook, status, tag…) chỉ đóng ô đó, không thoát chế độ tập trung
      const inPopover = !!(document.activeElement as HTMLElement | null)?.closest?.('.nbp-pop, .stp-pop, .tag-field, .kanban-input, .preview-find')
      if (e.key === 'Escape' && s.distractionFree && !e.defaultPrevented && !inPopover) {
        s.toggleDistractionFree()
        return
      }
      // ⌥⇧F / Alt+Shift+F: format Markdown của ghi chú đang mở (giống VS Code).
      // Bắt theo vị trí phím (e.code): trên Mac tổ hợp này gõ ra "Ï", editor sẽ chèn chữ đó nếu để lọt
      if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyF' && !(document.activeElement as HTMLElement | null)?.closest?.('input, textarea')) {
        e.preventDefault()
        e.stopPropagation()
        void formatNote()
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      // Ctrl+Tab / Ctrl+Shift+Tab: chuyển tab; Cmd/Ctrl+1…9: nhảy tới tab
      if (tabsEnabled() && !e.altKey) {
        if (e.ctrlKey && e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          cycleTab(e.shiftKey ? -1 : 1)
          return
        }
        if (!e.shiftKey && /^[1-9]$/.test(e.key) && (isMac() ? e.metaKey : e.ctrlKey)) {
          if (gotoTab(Number(e.key))) {
            e.preventDefault()
            e.stopPropagation()
          }
          return
        }
      }
      // Back/forward: Cmd+Alt+←/→ ở mọi nơi; Cmd+[ / Cmd+] khi không gõ trong editor
      // (trong editor, CodeMirror dùng Cmd+[ / Cmd+] để thụt lề)
      const inEditor = !!(document.activeElement as HTMLElement | null)?.closest?.('.cm-editor')
      if ((e.altKey && e.key === 'ArrowLeft') || (!e.altKey && !inEditor && e.key === '[')) {
        e.preventDefault()
        goBack()
        return
      }
      if ((e.altKey && e.key === 'ArrowRight') || (!e.altKey && !inEditor && e.key === ']')) {
        e.preventDefault()
        goForward()
        return
      }
      if (e.altKey) return
      const key = e.key.toLowerCase()
      if (e.shiftKey) {
        if (key === 'n') {
          const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
          if (!note || note.trashed || noteWindowId) return
          openInNewWindow(note._id)
        } else if (key === 'd') s.toggleDistractionFree()
        else if (key === 'g') {
          if (noteWindowId) return
          openGraph()
        } else if (key === 't') {
          if (noteWindowId) return
          openTodayNote()
        } else if (key === 'o') {
          if (!s.selectedNoteId) return
          toggleOutline()
        }
        else if (key === 'f') {
          if (s.distractionFree) s.toggleDistractionFree()
          requestAnimationFrame(() => searchRef.current?.focus())
        } else return
      } else if (key === 'k') {
        s.setPalette('commands')
      } else if (key === 't') {
        s.setPalette('templates')
      } else if (key === 'j') {
        const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
        if (!note || note.trashed) return
        s.setPalette('actions')
      } else if (key === 'd') {
        // ⌘D trong editor là "chọn chữ giống tiếp theo" của CodeMirror; ngoài editor thì nhân bản ghi chú
        const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
        if (inEditor || !note || note.trashed) return
        s.duplicateNote(note._id)
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
    // Thả file ra ngoài editor: chặn trình duyệt mở file đó thay cho app
    const blockFileDrop = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files') && !e.defaultPrevented) e.preventDefault()
    }
    window.addEventListener('dragover', blockFileDrop)
    window.addEventListener('drop', blockFileDrop)
    // Nút back/forward phụ trên chuột
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 3) goBack()
      else if (e.button === 4) goForward()
    }
    // capture để phím tắt toàn app chạy trước keymap của editor
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('dragover', blockFileDrop)
      window.removeEventListener('drop', blockFileDrop)
    }
  }, [])

  if (!ready) return <div className="boot" />

  if (noteWindowId) {
    return (
      <div className={cx('app', 'note-window', isMac() && 'mac')}>
        <NoteWindowTitle />
        <NotePane />
        <ContextMenuHost />
        <CommandPalette />
        <HistoryPanel />
        <Notice />
      </div>
    )
  }

  return (
    <div style={{ '--sidebar-size': `${sidebarWidth}px`, '--list-size': `${listWidth}px` } as CSSProperties} className={cx('app', isMac() && 'mac', distractionFree && 'distraction-free', sidebarHidden && 'sidebar-hidden')}>
      <Sidebar />
      {!distractionFree && !sidebarHidden && <ResizeHandle className="resize-sidebar" label="Sidebar width" value={sidebarWidth} min={160} max={420} reset={228} onChange={setSidebarWidth} />}
      <NoteList searchRef={searchRef} />
      {!distractionFree && <ResizeHandle className="resize-notelist" label="Note list width" value={listWidth} min={200} max={600} reset={300} onChange={setListWidth} />}
      <NotePane />
      <ContextMenuHost />
      <CommandPalette />
      <HistoryPanel />
      <ActivityPanel />
      <Presentation />
      <GraphView />
      <IconPicker />
      <Preferences />
      <Notice />
    </div>
  )
}
