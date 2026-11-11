import { useEffect, useMemo, useRef } from 'react'
import { ArrowUpDown, Pin, Search, SquarePen, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { visibleNotes } from '@/lib/selectors'
import { highlightWords, parseQuery } from '@/lib/search'
import { countTasks } from '@/lib/markdown'
import { STATUSES } from '@/lib/types'
import type { Note, SortKey } from '@/lib/types'
import { cx, relativeTime, snippet } from '@/lib/util'
import { exportNote } from '@/lib/actions'
import { openMenu } from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { NOTE_MIME } from './Sidebar'
import { StatusIcon } from './StatusIcon'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updatedAt', label: 'Date Updated' },
  { key: 'createdAt', label: 'Date Created' },
  { key: 'title', label: 'Title' }
]

function Highlight({ text, words }: { text: string; words: string[] }): React.JSX.Element {
  if (!words.length || !text) return <>{text}</>
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </>
  )
}

export function noteMenu(note: Note): MenuItem[] {
  const a = useStore.getState()
  if (note.trashed) {
    return [
      { label: 'Restore', onClick: () => a.restoreNote(note._id) },
      { separator: true },
      {
        label: 'Delete Permanently',
        danger: true,
        onClick: () => {
          if (window.confirm(`Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`)) a.deleteNoteForever(note._id)
        }
      }
    ]
  }
  return [
    { label: note.pinned ? 'Unpin from Top' : 'Pin to Top', onClick: () => a.updateNote(note._id, { pinned: !note.pinned }) },
    { label: 'Duplicate', onClick: () => a.duplicateNote(note._id) },
    { label: 'Export as Markdown…', onClick: () => void exportNote(note._id) },
    { separator: true },
    { label: 'No Status', checked: note.status === 'none', onClick: () => a.updateNote(note._id, { status: 'none' }) },
    ...STATUSES.map((s) => ({
      label: s.label,
      checked: note.status === s.id,
      onClick: () => a.updateNote(note._id, { status: s.id })
    })),
    { separator: true },
    { label: 'Move to Trash', danger: true, onClick: () => a.trashNote(note._id) }
  ]
}

export function NoteList({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }): React.JSX.Element {
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)
  const selection = useStore((s) => s.selection)
  const query = useStore((s) => s.query)
  const sort = useStore((s) => s.sort)
  const collapsedBooks = useStore((s) => s.collapsedBooks)
  const selectedNoteId = useStore((s) => s.selectedNoteId)
  const { selectNote, setQuery, setSort, createNote, emptyTrash } = useStore.getState()
  const listRef = useRef<HTMLDivElement>(null)

  const list = useMemo(
    () => visibleNotes({ notes, books, tags, selection, query, sort, collapsedBooks }),
    [notes, books, tags, selection, query, sort, collapsedBooks]
  )
  const words = useMemo(() => highlightWords(parseQuery(query)), [query])

  // Luôn có một ghi chú được chọn nếu danh sách không rỗng
  useEffect(() => {
    if (!list.some((n) => n._id === selectedNoteId)) selectNote(list[0]?._id ?? null)
  }, [list, selectedNoteId, selectNote])

  useEffect(() => {
    listRef.current?.querySelector('.note-item.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedNoteId])

  const heading =
    selection.kind === 'all'
      ? 'All Notes'
      : selection.kind === 'trash'
        ? 'Trash'
        : selection.kind === 'book'
          ? (books[selection.id]?.name ?? 'Notebook')
          : selection.kind === 'tag'
            ? `#${tags[selection.id]?.name ?? ''}`
            : (STATUSES.find((s) => s.id === selection.status)?.label ?? '')

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const index = list.findIndex((n) => n._id === selectedNoteId)
    const next = list[Math.max(0, Math.min(list.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) selectNote(next._id)
  }

  return (
    <section className="notelist">
      <header className="notelist-header titlebar-drag">
        <div className="notelist-title">
          <h2>{heading}</h2>
          <span className="notelist-count">{list.length}</span>
          <span className="flex-1" />
          <button
            className="icon-btn"
            title="Sort"
            onClick={(e) =>
              openMenu(
                e,
                SORTS.map((s) => ({ label: s.label, checked: sort === s.key, onClick: () => setSort(s.key) })),
                true
              )
            }
          >
            <ArrowUpDown size={15} />
          </button>
          {selection.kind === 'trash' ? (
            <button
              className="text-btn danger"
              disabled={list.length === 0}
              onClick={() => {
                if (window.confirm('Permanently delete all notes in the Trash? This cannot be undone.')) emptyTrash()
              }}
            >
              Empty
            </button>
          ) : (
            <button className="icon-btn accent" title="New note (Cmd/Ctrl+N)" onClick={() => createNote()}>
              <SquarePen size={16} />
            </button>
          )}
        </div>
        <div className="search-box">
          <Search size={14} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                listRef.current?.focus()
              }
            }}
          />
          {query && (
            <button className="search-clear" title="Clear" onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      <div className="notelist-items" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
        {list.length === 0 && (
          <div className="empty-hint">{query ? 'No notes match your search.' : selection.kind === 'trash' ? 'Trash is empty.' : 'No notes here yet.'}</div>
        )}
        {list.map((note) => {
          const tasks = countTasks(note.body)
          const book = books[note.bookId]
          return (
            <div
              key={note._id}
              className={cx('note-item', note._id === selectedNoteId && 'selected')}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(NOTE_MIME, note._id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => selectNote(note._id)}
              onContextMenu={(e) => {
                selectNote(note._id)
                openMenu(e, noteMenu(note))
              }}
            >
              <div className="note-item-title">
                <StatusIcon status={note.status} />
                <span className={cx('note-item-name', !note.title && 'untitled')}>
                  <Highlight text={note.title || 'Untitled'} words={words} />
                </span>
                {note.pinned && <Pin size={12} className="pin-mark" />}
              </div>
              <div className="note-item-snippet">
                <Highlight text={snippet(note.body)} words={words} />
              </div>
              <div className="note-item-meta">
                <span>{relativeTime(sort === 'createdAt' ? note.createdAt : note.updatedAt)}</span>
                {selection.kind !== 'book' && book && <span className="note-item-book">{book.name}</span>}
                {tasks.total > 0 && (
                  <span className={cx('note-item-tasks', tasks.done === tasks.total && 'done')}>
                    {tasks.done}/{tasks.total}
                  </span>
                )}
                {note.tags.slice(0, 3).map((id) =>
                  tags[id] ? (
                    <span key={id} className="tag-chip small" style={{ '--tag': tags[id].color } as React.CSSProperties}>
                      {tags[id].name}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
