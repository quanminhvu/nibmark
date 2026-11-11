import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Columns2, Ellipsis, Eye, LayoutTemplate, Maximize2, Minimize2, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { childrenByParent } from '@/lib/selectors'
import { toggleTask } from '@/lib/markdown'
import { STATUSES } from '@/lib/types'
import type { Book, NoteStatus, ViewMode } from '@/lib/types'
import { cx, isMac, relativeTime } from '@/lib/util'
import { goBack, goForward, useNav } from '@/lib/navigation'
import { openMenu } from './ContextMenu'
import { MarkdownEditor } from './MarkdownEditor'
import { noteMenu } from './NoteList'
import { Preview } from './Preview'
import { StatusIcon } from './StatusIcon'
import { TagInput } from './TagInput'

const VIEW_MODES: { mode: ViewMode; title: string; icon: React.ReactNode }[] = [
  { mode: 'edit', title: 'Editor', icon: <Pencil size={14} /> },
  { mode: 'split', title: 'Side by side (Cmd/Ctrl+P)', icon: <Columns2 size={14} /> },
  { mode: 'preview', title: 'Preview (Cmd/Ctrl+E)', icon: <Eye size={14} /> }
]

function flattenBooks(books: Record<string, Book>): { book: Book; depth: number }[] {
  const children = childrenByParent(books)
  const out: { book: Book; depth: number }[] = []
  const walk = (parent: string | null, depth: number): void => {
    for (const book of children.get(parent) ?? []) {
      out.push({ book, depth })
      walk(book._id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function NotePane(): React.JSX.Element {
  const note = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined))
  const books = useStore((s) => s.books)
  const viewMode = useStore((s) => s.viewMode)
  const distractionFree = useStore((s) => s.distractionFree)
  const { updateNote, setViewMode, toggleDistractionFree, restoreNote, deleteNoteForever } = useStore.getState()
  const bookOptions = useMemo(() => flattenBooks(books), [books])

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

  return (
    <main className="notepane">
      <header className="notepane-header titlebar-drag">
        <NavButtons />
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
        {!readOnly && (
          <div className="segmented" role="group" aria-label="View mode">
            {VIEW_MODES.map((v) => (
              <button key={v.mode} title={v.title} className={cx(mode === v.mode && 'on')} onClick={() => setViewMode(v.mode)}>
                {v.icon}
              </button>
            ))}
          </div>
        )}
        {!readOnly && (
          <button
            className={cx('icon-btn', note.pinned && 'on')}
            title={note.pinned ? 'Unpin from top' : 'Pin to top'}
            onClick={() => updateNote(note._id, { pinned: !note.pinned })}
          >
            <Pin size={15} />
          </button>
        )}
        <button
          className="icon-btn"
          title={distractionFree ? 'Exit distraction-free mode' : 'Distraction-free mode (Cmd/Ctrl+Shift+D)'}
          onClick={toggleDistractionFree}
        >
          {distractionFree ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button className="icon-btn" title="More actions" onClick={(e) => openMenu(e, noteMenu(note), true)}>
          <Ellipsis size={16} />
        </button>
      </header>

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
          <label className="meta-field" title="Notebook">
            <select value={books[note.bookId] ? note.bookId : ''} onChange={(e) => updateNote(note._id, { bookId: e.target.value })}>
              {!books[note.bookId] && <option value="">No notebook</option>}
              {bookOptions.map(({ book, depth }) => (
                <option key={book._id} value={book._id}>
                  {'  '.repeat(depth) + book.name}
                </option>
              ))}
            </select>
          </label>
          <label className="meta-field" title="Status">
            <StatusIcon status={note.status} />
            <select value={note.status} onChange={(e) => updateNote(note._id, { status: e.target.value as NoteStatus })}>
              <option value="none">No status</option>
              {STATUSES.map((s) => (
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

      <div className={cx('note-body', `mode-${mode}`)}>
        {mode !== 'preview' && (
          <div className="note-editor">
            <MarkdownEditor key={note._id} value={note.body} onChange={(body) => {
                // Bỏ qua khi nội dung không đổi (ví dụ editor vừa nhận nội dung từ bên ngoài)
                if (body !== useStore.getState().notes[note._id]?.body) updateNote(note._id, { body })
              }}
            />
          </div>
        )}
        {mode !== 'edit' && (
          <div className="note-preview">
            <Preview
              source={note.body}
              onToggleTask={readOnly ? undefined : (index) => updateNote(note._id, { body: toggleTask(note.body, index) })}
            />
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
        <ChevronLeft size={16} />
      </button>
      <button className="icon-btn" disabled={!canForward} title={mac ? 'Forward (⌘⌥→)' : 'Forward (Ctrl+Alt+→)'} onClick={() => goForward()}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
