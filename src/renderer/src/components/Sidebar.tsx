import { AppearancePicker } from './AppearancePicker'
import type { AppearanceTarget } from './AppearancePicker'
import { useMemo, useState } from 'react'
import { openActivity } from './ActivityPanel'
import { ArrowUpToLine, ChartNoAxesColumn, ChevronDown, ChevronRight, Copy, Download, Files, FolderPlus, LayoutTemplate, MoreHorizontal, Palette, Pencil, Plus, Search, Settings, Smile, Trash2, Upload, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { childrenByParent, descendantIds } from '@/lib/selectors'
import { getStatuses } from '@/lib/statuses'
import type { Book, NoteStatus, Selection } from '@/lib/types'
import { cx } from '@/lib/util'
import { exportNotes } from '@/lib/actions'
import { copyId } from '@/lib/clipboard'
import { fuzzyMatch } from '@/lib/fuzzy'
import { runImport } from '@/lib/importer'
import { BookIcon, openIconPicker } from './BookIcon'
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
const STATUS_MIME = 'application/x-nibmark-status'
const TAG_MIME = 'application/x-nibmark-tag'
const BOOK_MIME = 'application/x-nibmark-book'

type Editing = { kind: 'new'; parentId: string | null } | { kind: 'rename'; id: string } | { kind: 'renameTag'; id: string } | { kind: 'renameStatus'; id: NoteStatus } | { kind: 'newTag' | 'newStatus' } | null

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

export type DropZone = 'before' | 'inside' | 'after'

/**
 * Trạng thái "đang kéo thả vào đây" cho một dòng trong sidebar.
 * Với notebook đang được kéo (zoned): thả ở mép trên/dưới = đặt trước/sau, ở giữa = lồng vào.
 */
function useDropTarget(accept: string[], onDrop: (type: string, id: string, zone: DropZone) => void, zoned: string[] = []) {
  const [zone, setZone] = useState<DropZone | null>(null)
  const accepted = (e: React.DragEvent): string | undefined => accept.find((type) => e.dataTransfer.types.includes(type))
  const zoneOf = (e: React.DragEvent, type: string): DropZone => {
    if (!zoned.includes(type)) return 'inside'
    const rect = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'
  }
  return {
    over: zone !== null,
    zone,
    props: {
      onDragOver: (e: React.DragEvent) => {
        const type = accepted(e)
        if (!type) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setZone(zoneOf(e, type))
      },
      onDragLeave: () => setZone(null),
      onDrop: (e: React.DragEvent) => {
        setZone(null)
        const type = accepted(e)
        if (!type) return
        e.preventDefault()
        e.stopPropagation()
        const id = e.dataTransfer.getData(type)
        if (id) onDrop(type, id, zoneOf(e, type))
      }
    }
  }
}

/** Màu và icon đang dùng của một trạng thái (trạng thái có sẵn có giá trị mặc định) */
function statusLook(status: { id: NoteStatus; color?: string; icon?: string }): { color: string; icon: string } {
  const colors: Record<string, string> = { active: '#80A4CD', onHold: '#F5A623', completed: '#2FB457', dropped: '#E5484D' }
  const glyphs: Record<string, string> = { active: 'Play', onHold: 'Pause', completed: 'Check', dropped: 'X' }
  return { color: status.color ?? colors[status.id] ?? '#2F6FE4', icon: status.icon ?? glyphs[status.id] ?? 'Circle' }
}

interface RowProps {
  selection: Selection
  icon: React.ReactNode
  label: string
  count?: number
  depth?: number
  accept?: string[]
  /** Loại dữ liệu kéo thả được chia vùng trước/giữa/sau */
  zoned?: string[]
  onDropItem?: (type: string, id: string, zone: DropZone) => void
  onContextMenu?: (e: React.MouseEvent) => void
  /** Nháy đúp (ví dụ để đổi tên ngay tại chỗ) */
  onDoubleClick?: () => void
  children?: React.ReactNode
  dragData?: { type: string; id: string }
}

function Row({ selection, icon, label, count, depth = 0, accept = [], zoned = [], onDropItem, onContextMenu, onDoubleClick, children, dragData }: RowProps): React.JSX.Element {
  const current = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const drop = useDropTarget(accept, (type, id, zone) => onDropItem?.(type, id, zone), zoned)
  return (
    <div
      className={cx(
        'side-row',
        sameSelection(current, selection) && 'selected',
        drop.zone === 'inside' && 'drop-over',
        drop.zone === 'before' && 'drop-before',
        drop.zone === 'after' && 'drop-after'
      )}
      style={{ paddingLeft: 10 + depth * 14 }}
      draggable={!!dragData}
      onDragStart={dragData ? (e) => { e.stopPropagation(); e.dataTransfer.setData(dragData.type, dragData.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
      onClick={() => select(selection)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      {...drop.props}
    >
      {children}
      <span className="side-icon">{icon}</span>
      <span className="side-label">{label}</span>
      {count !== undefined && count > 0 && <span className="side-count">{count}</span>}
      {onContextMenu && (
        // Nút ⋯ hiện khi rê chuột: cùng menu với chuột phải, để sửa mà không cần nhớ chuột phải
        <button
          className="side-more"
          title="More actions"
          aria-label={`More actions for ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
  )
}

const SECTIONS_KEY = 'nibmark:sidebar-sections'

function readCollapsedSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Tiêu đề một nhóm trong sidebar: thu gọn được, có nút tìm và nút thêm */
function SectionHeading({
  title,
  collapsed,
  onToggle,
  onSearch,
  onAdd,
  addTitle,
  dropProps,
  dropOver
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  onSearch?: () => void
  onAdd?: () => void
  addTitle?: string
  dropProps?: React.HTMLAttributes<HTMLDivElement>
  dropOver?: boolean
}): React.JSX.Element {
  return (
    <div className={cx('side-heading', dropOver && 'drop-over')} {...dropProps}>
      <button className="side-heading-title" onClick={onToggle} title={collapsed ? `Show ${title}` : `Hide ${title}`}>
        {title}
        <ChevronDown size={12} className={cx('side-heading-chevron', collapsed && 'collapsed')} />
      </button>
      <span className="side-heading-actions">
        {onSearch && !collapsed && (
          <button title={`Filter ${title.toLowerCase()}`} onClick={onSearch}>
            <Search size={13} />
          </button>
        )}
        {onAdd && (
          <button title={addTitle} onClick={onAdd}>
            <Plus size={14} />
          </button>
        )}
      </span>
    </div>
  )
}

function FilterInput({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }): React.JSX.Element {
  return (
    <div className="side-filter">
      <Search size={12} />
      <input
        autoFocus
        value={value}
        placeholder="Filter"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <button title="Close filter" onClick={onClose}>
        <X size={12} />
      </button>
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  useStore((s) => s.statuses)
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)
  const collapsed = useStore((s) => s.collapsedBooks)
  const actions = useStore.getState()
  const [appearance, setAppearance] = useState<AppearanceTarget | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [sections, setSections] = useState<Record<string, boolean>>(readCollapsedSections)
  const [bookFilter, setBookFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const toggleSection = (key: string): void =>
    setSections((s) => {
      const next = { ...s, [key]: !s[key] }
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next))
      } catch {
        // chỉ là tiện ích
      }
      return next
    })

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
      { label: 'New Sub-notebook', icon: <FolderPlus size={14} />, onClick: () => setEditing({ kind: 'new', parentId: book._id }) },
      { label: 'Rename', icon: <Pencil size={14} />, hint: 'Double-click', onClick: () => setEditing({ kind: 'rename', id: book._id }) },
      { label: 'Change Icon…', icon: <Smile size={14} />, onClick: () => openIconPicker(book._id) },
      ...(book.parentId ? [{ label: 'Move to Top Level', icon: <ArrowUpToLine size={14} />, onClick: () => actions.moveBook(book._id, null) }] : []),
      { separator: true },
      { label: 'Import into Notebook…', icon: <Download size={14} />, onClick: () => void runImport(book._id) },
      { label: 'Export as Markdown…', icon: <Upload size={14} />, onClick: () => void exportNotes(book._id) },
      { label: 'Copy Notebook ID', icon: <Copy size={14} />, onClick: () => copyId(book._id) },
      { separator: true },
      {
        label: 'Delete Notebook',
        icon: <Trash2 size={14} />,
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
                icon={<BookIcon name={book.icon} />}
                label={book.name}
                count={count}
                depth={depth}
                accept={[NOTE_MIME, BOOK_MIME]}
                zoned={[BOOK_MIME]}
                onDropItem={(type, id, zone) => {
                  if (type === NOTE_MIME) moveNoteTo(id, { bookId: book._id })
                  else if (zone === 'inside') actions.moveBook(id, book._id)
                  else actions.placeBook(id, book._id, zone)
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
  const sortedTags = useMemo(() => Object.values(tags).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)), [tags])

  return (
    <aside className="sidebar">
      {appearance && <AppearancePicker target={appearance} onClose={() => setAppearance(null)} />}
      <div className="titlebar-drag sidebar-top">
        <span className="flex-1" />
        <button className="icon-btn" title="Activity" onClick={openActivity}>
          <ChartNoAxesColumn size={16} />
        </button>
        <button className="icon-btn" title="Preferences (⌘,)" onClick={() => actions.setPrefsOpen(true)}>
          <Settings size={16} />
        </button>
      </div>
      <div className="sidebar-scroll">
        <Row selection={{ kind: 'all' }} icon={<Files size={15} />} label="All Notes" count={counts.all} />
        <div className="side-row" style={{ paddingLeft: 10 }} onClick={() => actions.setPalette('templates')}>
          <span className="side-icon">
            <LayoutTemplate size={15} />
          </span>
          <span className="side-label">Note Templates</span>
        </div>

        <SectionHeading
          title="Notebooks"
          collapsed={!!sections.books}
          onToggle={() => toggleSection('books')}
          onSearch={() => setBookFilter(bookFilter === null ? '' : null)}
          onAdd={() => {
            if (sections.books) toggleSection('books')
            setEditing({ kind: 'new', parentId: null })
          }}
          addTitle="New notebook"
          dropProps={rootDrop.props}
          dropOver={rootDrop.over}
        />
        {!sections.books && bookFilter !== null && <FilterInput value={bookFilter} onChange={setBookFilter} onClose={() => setBookFilter(null)} />}
        {!sections.books &&
          (bookFilter
            ? Object.values(books)
                .map((b) => ({ b, m: fuzzyMatch(bookFilter, b.name) }))
                .filter((x) => x.m)
                .sort((a, z) => z.m!.score - a.m!.score)
                .map(({ b }) => (
                  <Row
                    key={b._id}
                    selection={{ kind: 'book', id: b._id }}
                    icon={<BookIcon name={b.icon} />}
                    label={b.name}
                    count={counts.byBook.get(b._id) ?? 0}
                    onContextMenu={bookMenu(b)}
                  />
                ))
            : renderBooks(null, 0))}
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

        <SectionHeading title="Status" collapsed={!!sections.status} onToggle={() => toggleSection('status')}
          addTitle="New status" onAdd={() => { setSections((s) => ({ ...s, status: false })); setEditing({ kind: 'newStatus' }) }} />
        {editing?.kind === 'newStatus' && <div className="side-row editing"><NameInput initial="" onDone={(name) => {
          if (name) actions.select({ kind: 'status', status: actions.ensureStatus(name) })
          setEditing(null)
        }} /></div>}
        {!sections.status && getStatuses().map((status) => {
          const look = statusLook(status)
          const editLook = (): void =>
            setAppearance({ name: status.label, color: look.color, icon: look.icon, onSave: (color, icon, name) => actions.setStatusAppearance(status.id, color, icon, name) })
          const menu = (e: React.MouseEvent): void =>
            openMenu(e, [
              { label: 'Rename', icon: <Pencil size={14} />, hint: 'Double-click', onClick: () => setEditing({ kind: 'renameStatus', id: status.id }) },
              { label: 'Change Color & Icon…', icon: <Palette size={14} />, onClick: editLook },
              { separator: true },
              { label: 'Delete Status', icon: <Trash2 size={14} />, danger: true, onClick: () => {
                if (window.confirm(`Delete the status "${status.label}"? Notes and templates using it will be changed to No status. Their content will be kept.`)) actions.deleteStatus(status.id)
              } }
            ])
          if (editing?.kind === 'renameStatus' && editing.id === status.id) {
            return (
              <div key={status.id} className="side-row editing">
                <NameInput
                  initial={status.label}
                  onDone={(name) => {
                    if (name && name !== status.label && !actions.setStatusAppearance(status.id, look.color, look.icon, name)) {
                      actions.showNotice(`A status named “${name}” already exists.`, 'error')
                    }
                    setEditing(null)
                  }}
                />
              </div>
            )
          }
          return (
          <Row
            key={status.id}
            dragData={{ type: STATUS_MIME, id: status.id }}
            zoned={[STATUS_MIME]}
            selection={{ kind: 'status', status: status.id }}
            icon={<StatusIcon status={status.id} size={15} />}
            onContextMenu={menu}
            onDoubleClick={() => setEditing({ kind: 'renameStatus', id: status.id })}
            label={status.label}
            count={counts.byStatus.get(status.id) ?? 0}
            accept={[NOTE_MIME, STATUS_MIME]}
            onDropItem={(type, id, zone) => {
              if (type === NOTE_MIME) moveNoteTo(id, { status: status.id })
              else {
                const ids = getStatuses().map((s) => s.id)
                if (id === status.id || !ids.includes(id as NoteStatus)) return
                const next = ids.filter((x) => x !== id)
                next.splice(next.indexOf(status.id) + (zone === 'after' ? 1 : 0), 0, id as NoteStatus)
                actions.setStatusOrder(next)
              }
            }}
          />
          )
        })}

        <SectionHeading
            title="Tags"
            addTitle="New tag" onAdd={() => { setSections((s) => ({ ...s, tags: false })); setTagFilter(null); setEditing({ kind: 'newTag' }) }}
            collapsed={!!sections.tags}
            onToggle={() => toggleSection('tags')}
            onSearch={() => setTagFilter(tagFilter === null ? '' : null)}
          />
        {editing?.kind === 'newTag' && <div className="side-row editing"><NameInput initial="" onDone={(name) => {
          if (name) actions.select({ kind: 'tag', id: actions.ensureTag(name) })
          setEditing(null)
        }} /></div>}
        {!sections.tags && tagFilter !== null && <FilterInput value={tagFilter} onChange={setTagFilter} onClose={() => setTagFilter(null)} />}
        {!sections.tags &&
          sortedTags
            .filter((tag) => !tagFilter || fuzzyMatch(tagFilter, tag.name))
            .map((tag) =>
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
              dragData={{ type: TAG_MIME, id: tag._id }}
              zoned={[TAG_MIME]}
              selection={{ kind: 'tag', id: tag._id }}
              icon={<span className="tag-dot ring" style={{ '--tag': tag.color } as React.CSSProperties} />}
              onDoubleClick={() => setEditing({ kind: 'renameTag', id: tag._id })}
              label={tag.name}
              count={counts.byTag.get(tag._id) ?? 0}
              accept={[NOTE_MIME, TAG_MIME]}
              onDropItem={(type, data, zone) => {
                if (type === TAG_MIME) {
                  if (data === tag._id || !tags[data]) return
                  const next = sortedTags.map((t) => t._id).filter((id) => id !== data)
                  next.splice(next.indexOf(tag._id) + (zone === 'after' ? 1 : 0), 0, data)
                  actions.setTagOrder(next)
                  return
                }
                for (const id of noteIdsFromDrag(data)) {
                  const note = useStore.getState().notes[id]
                  if (note && !note.tags.includes(tag._id)) actions.updateNote(id, { tags: [...note.tags, tag._id] })
                }
              }}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Rename', icon: <Pencil size={14} />, hint: 'Double-click', onClick: () => setEditing({ kind: 'renameTag', id: tag._id }) },
                  { label: 'Change Color…', icon: <Palette size={14} />, onClick: () => setAppearance({ name: tag.name, color: tag.color, onSave: (color, _icon, name) => actions.setTagDetails(tag._id, name, color) }) },
                  { label: 'Copy Tag ID', icon: <Copy size={14} />, onClick: () => copyId(tag._id) },
                  { separator: true },
                  {
                    label: 'Delete Tag',
                    icon: <Trash2 size={14} />,
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
