import type { CSSProperties } from 'react'
import { ResizeHandle, usePaneSize } from './ResizeHandle'
import { useEffect, useRef } from 'react'
import { syncScroll } from '@/lib/scrollSync'
import { ArrowLeft, ArrowRight, CircleDashed, Columns2, EllipsisVertical, Eye, LayoutTemplate, Maximize2, Minimize2, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { toggleTask } from '@/lib/markdown'
import { getStatuses } from '@/lib/statuses'
import type { NoteStatus, ViewMode } from '@/lib/types'
import { cx, isMac, relativeTime } from '@/lib/util'
import { goBack, goForward, useNav } from '@/lib/navigation'
import { BulkPanel } from './BulkPanel'
import { openMenu } from './ContextMenu'
import { MarkdownEditor } from './MarkdownEditor'
import { noteMenu } from './NoteList'
import { Preview } from './Preview'
import { NotebookPicker } from './NotebookPicker'
import { KanbanBoard } from './KanbanBoard'
import { isKanban } from '@/lib/kanban'
import { StatusIcon } from './StatusIcon'
import { TagInput } from './TagInput'

const VIEW_MODES: { mode: ViewMode; title: string; icon: React.ReactNode }[] = [
  { mode: 'edit', title: 'Editor', icon: <Pencil size={14} /> },
  { mode: 'split', title: 'Side by side (Cmd/Ctrl+P)', icon: <Columns2 size={14} /> },
  { mode: 'preview', title: 'Preview (Cmd/Ctrl+E)', icon: <Eye size={14} /> }
]


export function NotePane(): React.JSX.Element {
  const [split, setSplit] = usePaneSize('nibmark:editor-split', 50)
  useStore((s) => s.statuses)
  const note = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined))
  const books = useStore((s) => s.books)
  const viewMode = useStore((s) => s.viewMode)
  const distractionFree = useStore((s) => s.distractionFree)
  const { updateNote, setViewMode, toggleDistractionFree, restoreNote, deleteNoteForever } = useStore.getState()
  const multiCount = useStore((s) => s.multi.length)

  const bodyRef = useRef<HTMLDivElement>(null)
  const syncEnabled = !!note && !note.trashed && viewMode === 'split' && !isKanban(note.body) && multiCount <= 1
  useEffect(() => {
    if (!syncEnabled) return
    const editor = bodyRef.current?.querySelector<HTMLElement>('.cm-scroller')
    const preview = bodyRef.current?.querySelector<HTMLElement>('.note-preview')
    if (editor && preview) return syncScroll(editor, preview)
  }, [note?._id, syncEnabled])

  if (multiCount > 1) return <BulkPanel />

  if (!note) {
    return (
      <main className="notepane empty">
        <div className="titlebar-drag notepane-drag" />
        <div className="empty-state">
          <p>No note selected</p>
          <span>Press Cmd/Ctrl+N to create one.</span>
        </div>
      </main>
    )
  }

  const readOnly = note.trashed
  const mode: ViewMode = readOnly ? 'preview' : viewMode
  const kanban = isKanban(note.body)

  return (
    <main className="notepane">
      <header className="notepane-header titlebar-drag">
        <button
          className="icon-btn"
          title={distractionFree ? 'Exit distraction-free mode' : 'Distraction-free mode (Cmd/Ctrl+Shift+D)'}
          onClick={toggleDistractionFree}
        >
          {distractionFree ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <NavButtons />
        <span className="flex-1" />
        {!readOnly && (
          <div className="segmented" role="group" aria-label="View mode">
            {VIEW_MODES.map((v) => (
              <button key={v.mode} title={v.title} className={cx(mode === v.mode && 'on')} onClick={() => setViewMode(v.mode)}>
                {v.icon}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        {!readOnly && (
          <button
            className={cx('icon-btn', note.pinned && 'on')}
            title={note.pinned ? 'Unpin from top' : 'Pin to top'}
            onClick={() => updateNote(note._id, { pinned: !note.pinned })}
          >
            <Pin size={15} />
          </button>
        )}
        <button className="icon-btn" title="More actions" onClick={(e) => openMenu(e, noteMenu(note), true)}>
          <EllipsisVertical size={16} />
        </button>
      </header>

      <div className="note-title-row">
        <input
          className="note-title"
          value={note.title}
          placeholder="Untitled"
          readOnly={readOnly}
          spellCheck
          onChange={(e) => updateNote(note._id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              document.querySelector<HTMLElement>('.cm-content')?.focus()
            }
          }}
        />
      </div>

      {readOnly ? (
        <div className="trash-banner">
          <Trash2 size={14} />
          <span>This note is in the Trash.</span>
          <span className="flex-1" />
          <button className="text-btn" onClick={() => restoreNote(note._id)}>
            <RotateCcw size={13} /> Restore
          </button>
          <button
            className="text-btn danger"
            onClick={() => {
              if (window.confirm(`Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`)) deleteNoteForever(note._id)
            }}
          >
            Delete Permanently
          </button>
        </div>
      ) : (
        <div className="note-meta">
          <NotebookPicker value={books[note.bookId] ? note.bookId : ''} placeholder="No notebook" onPick={(bookId) => updateNote(note._id, { bookId })} />
          <label className="meta-field" title="Status">
            {note.status === 'none' ? <CircleDashed size={15} className="status-none" /> : <StatusIcon status={note.status} size={15} />}
            <select value={note.status} onChange={(e) => updateNote(note._id, { status: e.target.value as NoteStatus })}>
              <option value="none">No status</option>
              {getStatuses().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <TagInput noteId={note._id} tagIds={note.tags} />
          <span className="note-updated" title={new Date(note.updatedAt).toLocaleString()}>
            {relativeTime(note.updatedAt)}
          </span>
        </div>
      )}

      {!readOnly && !note.title && !note.body && (
        <div className="template-hint">
          <button onClick={() => useStore.getState().setPalette('templates')}>
            <LayoutTemplate size={13} /> Choose a template
          </button>
          <span>{isMac() ? '⌘T' : 'Ctrl+T'}</span>
        </div>
      )}

      <div ref={bodyRef} style={{ '--editor-split': `${Math.max(20, Math.min(80, split))}%` } as CSSProperties} className={cx('note-body', `mode-${mode}`)}>
        {mode !== 'preview' && (
          <div className="note-editor">
            <MarkdownEditor key={note._id} value={note.body} onChange={(body) => {
                // Bỏ qua khi nội dung không đổi (ví dụ editor vừa nhận nội dung từ bên ngoài)
                if (body !== useStore.getState().notes[note._id]?.body) updateNote(note._id, { body })
              }}
            />
          </div>
        )}
        {mode === 'split' && <ResizeHandle className="resize-editor" label="Editor width" value={split} min={20} max={80} reset={50} percent onChange={setSplit} />}
        {mode !== 'edit' && (
          <div className={cx('note-preview', kanban && 'is-kanban')}>
            {kanban ? (
              <KanbanBoard source={note.body} onChange={readOnly ? undefined : (body) => updateNote(note._id, { body })} />
            ) : (
              <Preview
                findable
                source={note.body}
                onToggleTask={readOnly ? undefined : (index) => updateNote(note._id, { body: toggleTask(note.body, index) })}
              />
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function NavButtons(): React.JSX.Element {
  const canBack = useNav((s) => s.back.length > 0)
  const canForward = useNav((s) => s.forward.length > 0)
  const mac = isMac()
  return (
    <div className="nav-buttons">
      <button className="icon-btn" disabled={!canBack} title={mac ? 'Back (⌘⌥←)' : 'Back (Ctrl+Alt+←)'} onClick={() => goBack()}>
        <ArrowLeft size={17} />
      </button>
      <button className="icon-btn" disabled={!canForward} title={mac ? 'Forward (⌘⌥→)' : 'Forward (Ctrl+Alt+→)'} onClick={() => goForward()}>
        <ArrowRight size={17} />
      </button>
    </div>
  )
}
