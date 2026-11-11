import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Files, Notebook, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { childrenByParent, descendantIds } from '@/lib/selectors'
import { STATUSES } from '@/lib/types'
import type { Book, NoteStatus, Selection } from '@/lib/types'
import { cx } from '@/lib/util'
import { exportNotes } from '@/lib/actions'
import { copyId } from '@/lib/clipboard'
import { openMenu } from './ContextMenu'
import { StatusIcon } from './StatusIcon'

export const NOTE_MIME = 'application/x-nibmark-note'

/** Dữ liệu kéo thả ghi chú là một mảng JSON các id (kéo một hoặc nhiều ghi chú) */
export function noteIdsFromDrag(data: string): string[] {
  try {
    const parsed: unknown = JSON.parse(data)
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    // dữ liệu cũ: chỉ một id
  }
  return data ? [data] : []
}
const BOOK_MIME = 'application/x-nibmark-book'

type Editing = { kind: 'new'; parentId: string | null } | { kind: 'rename'; id: string } | { kind: 'renameTag'; id: string } | null

function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'book' && b.kind === 'book') return a.id === b.id
  if (a.kind === 'tag' && b.kind === 'tag') return a.id === b.id
  if (a.kind === 'status' && b.kind === 'status') return a.status === b.status
  return true
}

function NameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <input
      className="side-input"
      autoFocus
      value={value}
      placeholder="Name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') onDone(null)
      }}
    />
  )
}

/** Trạng thái "đang kéo thả vào đây" cho một dòng trong sidebar. */
function useDropTarget(accept: string[], onDrop: (type: string, id: string) => void) {
  const [over, setOver] = useState(false)
  const accepted = (e: React.DragEvent): string | undefined => accept.find((type) => e.dataTransfer.types.includes(type))
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!accepted(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false)
        const type = accepted(e)
        if (!type) return
        e.preventDefault()
        e.stopPropagation()
        const id = e.dataTransfer.getData(type)
        if (id) onDrop(type, id)
      }
    }
  }
}

interface RowProps {
  selection: Selection
  icon: React.ReactNode
  label: string
  count?: number
  depth?: number
  accept?: string[]
  onDropItem?: (type: string, id: string) => void
  onContextMenu?: (e: React.MouseEvent) => void
  children?: React.ReactNode
}

function Row({ selection, icon, label, count, depth = 0, accept = [], onDropItem, onContextMenu, children }: RowProps): React.JSX.Element {
  const current = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const drop = useDropTarget(accept, (type, id) => onDropItem?.(type, id))
  return (
    <div
      className={cx('side-row', sameSelection(current, selection) && 'selected', drop.over && 'drop-over')}
      style={{ paddingLeft: 10 + depth * 14 }}
      onClick={() => select(selection)}
      onContextMenu={onContextMenu}
      {...drop.props}
    >
      {children}
      <span className="side-icon">{icon}</span>
      <span className="side-label">{label}</span>
      {count !== undefined && count > 0 && <span className="side-count">{count}</span>}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)
  const collapsed = useStore((s) => s.collapsedBooks)
  const actions = useStore.getState()
  const [editing, setEditing] = useState<Editing>(null)

  const children = useMemo(() => childrenByParent(books), [books])

  const counts = useMemo(() => {
    const byBook = new Map<string, number>()
    const byStatus = new Map<NoteStatus, number>()
    const byTag = new Map<string, number>()
    let all = 0
    let trash = 0
    for (const note of Object.values(notes)) {
      if (note.trashed) {
        trash++
        continue
      }
      all++
      byBook.set(note.bookId, (byBook.get(note.bookId) ?? 0) + 1)
      byStatus.set(note.status, (byStatus.get(note.status) ?? 0) + 1)
      for (const tag of note.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + 1)
    }
    return { byBook, byStatus, byTag, all, trash }
  }, [notes])

  const moveNoteTo = (data: string, patch: Parameters<typeof actions.updateNote>[1]): void => {
    for (const id of noteIdsFromDrag(data)) actions.updateNote(id, { trashed: false, ...patch })
  }

  const bookMenu = (book: Book) => (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'New Sub-notebook', onClick: () => setEditing({ kind: 'new', parentId: book._id }) },
      { label: 'Rename', onClick: () => setEditing({ kind: 'rename', id: book._id }) },
      ...(book.parentId ? [{ label: 'Move to Top Level', onClick: () => actions.moveBook(book._id, null) }] : []),
      { label: 'Export as Markdown…', onClick: () => void exportNotes(book._id) },
      { label: 'Copy Notebook ID', onClick: () => copyId(book._id) },
      { separator: true },
      {
        label: 'Delete Notebook',
        danger: true,
        onClick: () => {
          const total = [book._id, ...descendantIds(children, book._id)].reduce((sum, id) => sum + (counts.byBook.get(id) ?? 0), 0)
          const message = total
            ? `Delete "${book.name}"? Its ${total} note${total === 1 ? '' : 's'} will be moved to the Trash.`
            : `Delete "${book.name}"?`
          if (window.confirm(message)) actions.deleteBook(book._id)
        }
      }
    ])

  const renderBooks = (parentId: string | null, depth: number): React.ReactNode => (
    <>
      {(children.get(parentId) ?? []).map((book) => {
        const kids = children.get(book._id) ?? []
        const isCollapsed = !!collapsed[book._id]
        const count = isCollapsed
          ? [book._id, ...descendantIds(children, book._id)].reduce((sum, id) => sum + (counts.byBook.get(id) ?? 0), 0)
          : counts.byBook.get(book._id) ?? 0
        if (editing?.kind === 'rename' && editing.id === book._id) {
          return (
            <div key={book._id} className="side-row editing" style={{ paddingLeft: 10 + depth * 14 }}>
              <NameInput
                initial={book.name}
                onDone={(name) => {
                  if (name) actions.renameBook(book._id, name)
                  setEditing(null)
                }}
              />
            </div>
          )
        }
        return (
          <div key={book._id}>
            <div
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.setData(BOOK_MIME, book._id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDoubleClick={() => setEditing({ kind: 'rename', id: book._id })}
            >
              <Row
                selection={{ kind: 'book', id: book._id }}
                icon={<Notebook size={15} />}
                label={book.name}
                count={count}
                depth={depth}
                accept={[NOTE_MIME, BOOK_MIME]}
                onDropItem={(type, id) => {
                  if (type === NOTE_MIME) moveNoteTo(id, { bookId: book._id })
                  else actions.moveBook(id, book._id)
                }}
                onContextMenu={bookMenu(book)}
              >
                <button
                  className={cx('side-chevron', kids.length === 0 && 'hidden')}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.toggleBookCollapsed(book._id)
                  }}
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              </Row>
            </div>
            {!isCollapsed && renderBooks(book._id, depth + 1)}
            {editing?.kind === 'new' && editing.parentId === book._id && (
              <div className="side-row editing" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
                <NameInput
                  initial=""
                  onDone={(name) => {
                    if (name) actions.select({ kind: 'book', id: actions.createBook(name, book._id) })
                    setEditing(null)
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </>
  )

  const rootDrop = useDropTarget([BOOK_MIME], (_type, id) => actions.moveBook(id, null))
  const sortedTags = useMemo(() => Object.values(tags).sort((a, b) => a.name.localeCompare(b.name)), [tags])

  return (
    <aside className="sidebar">
      <div className="titlebar-drag sidebar-top" />
      <div className="sidebar-scroll">
        <Row selection={{ kind: 'all' }} icon={<Files size={15} />} label="All Notes" count={counts.all} />

        <div className={cx('side-heading', rootDrop.over && 'drop-over')} {...rootDrop.props}>
          <span>Notebooks</span>
          <button title="New notebook" onClick={() => setEditing({ kind: 'new', parentId: null })}>
            <Plus size={14} />
          </button>
        </div>
        {renderBooks(null, 0)}
        {editing?.kind === 'new' && editing.parentId === null && (
          <div className="side-row editing" style={{ paddingLeft: 10 }}>
            <NameInput
              initial=""
              onDone={(name) => {
                if (name) actions.select({ kind: 'book', id: actions.createBook(name, null) })
                setEditing(null)
              }}
            />
          </div>
        )}

        <div className="side-heading">
          <span>Status</span>
        </div>
        {STATUSES.map((status) => (
          <Row
            key={status.id}
            selection={{ kind: 'status', status: status.id }}
            icon={<StatusIcon status={status.id} size={15} />}
            label={status.label}
            count={counts.byStatus.get(status.id) ?? 0}
            accept={[NOTE_MIME]}
            onDropItem={(_type, id) => moveNoteTo(id, { status: status.id })}
          />
        ))}

        {sortedTags.length > 0 && (
          <div className="side-heading">
            <span>Tags</span>
          </div>
        )}
        {sortedTags.map((tag) =>
          editing?.kind === 'renameTag' && editing.id === tag._id ? (
            <div key={tag._id} className="side-row editing" style={{ paddingLeft: 10 }}>
              <NameInput
                initial={tag.name}
                onDone={(name) => {
                  if (name) actions.renameTag(tag._id, name)
                  setEditing(null)
                }}
              />
            </div>
          ) : (
            <Row
              key={tag._id}
              selection={{ kind: 'tag', id: tag._id }}
              icon={<span className="tag-dot" style={{ background: tag.color }} />}
              label={tag.name}
              count={counts.byTag.get(tag._id) ?? 0}
              accept={[NOTE_MIME]}
              onDropItem={(_type, data) => {
                for (const id of noteIdsFromDrag(data)) {
                  const note = useStore.getState().notes[id]
                  if (note && !note.tags.includes(tag._id)) actions.updateNote(id, { tags: [...note.tags, tag._id] })
                }
              }}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Rename', onClick: () => setEditing({ kind: 'renameTag', id: tag._id }) },
                  { label: 'Copy Tag ID', onClick: () => copyId(tag._id) },
                  { separator: true },
                  {
                    label: 'Delete Tag',
                    danger: true,
                    onClick: () => {
                      if (window.confirm(`Delete the tag "${tag.name}"? Notes keep their content.`)) actions.deleteTag(tag._id)
                    }
                  }
                ])
              }
            />
          )
        )}

        <div className="side-spacer" />
        <Row
          selection={{ kind: 'trash' }}
          icon={<Trash2 size={15} />}
          label="Trash"
          count={counts.trash}
          accept={[NOTE_MIME]}
          onDropItem={(_type, data) => noteIdsFromDrag(data).forEach((id) => actions.trashNote(id))}
          onContextMenu={(e) =>
            openMenu(e, [
              {
                label: 'Empty Trash',
                danger: true,
                disabled: counts.trash === 0,
                onClick: () => {
                  if (window.confirm(`Permanently delete ${counts.trash} note${counts.trash === 1 ? '' : 's'}? This cannot be undone.`)) {
                    actions.emptyTrash()
                  }
                }
              }
            ])
          }
        />
      </div>
    </aside>
  )
}
