import { useMemo, useState } from 'react'
import { Files, Pin, RotateCcw, Trash2, X } from 'lucide-react'
import { childrenByParent } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { STATUSES } from '@/lib/types'
import type { Book, NoteStatus } from '@/lib/types'
import type { MenuItem } from './ContextMenu'

const plural = (n: number): string => `${n} note${n === 1 ? '' : 's'}`

function trashMany(ids: string[]): void {
  if (window.confirm(`Move ${plural(ids.length)} to the Trash?`)) {
    const s = useStore.getState()
    ids.forEach((id) => s.trashNote(id))
    s.setMulti([])
  }
}

function deleteMany(ids: string[]): void {
  if (window.confirm(`Permanently delete ${plural(ids.length)}? This cannot be undone.`)) {
    const s = useStore.getState()
    ids.forEach((id) => s.deleteNoteForever(id))
    s.setMulti([])
  }
}

function restoreMany(ids: string[]): void {
  const s = useStore.getState()
  ids.forEach((id) => s.restoreNote(id))
  s.setMulti([])
}

/** Menu chuột phải khi đang chọn nhiều ghi chú */
export function bulkMenu(ids: string[]): MenuItem[] {
  const s = useStore.getState()
  const inTrash = ids.every((id) => s.notes[id]?.trashed)
  if (inTrash) {
    return [
      { label: `Restore ${plural(ids.length)}`, onClick: () => restoreMany(ids) },
      { separator: true },
      { label: 'Delete Permanently', danger: true, onClick: () => deleteMany(ids) }
    ]
  }
  return [
    ...STATUSES.map((st) => ({
      label: `Set Status: ${st.label}`,
      onClick: () => ids.forEach((id) => s.updateNote(id, { status: st.id }))
    })),
    { label: 'Clear Status', onClick: () => ids.forEach((id) => s.updateNote(id, { status: 'none' })) },
    { separator: true },
    { label: `Move ${plural(ids.length)} to Trash`, danger: true, onClick: () => trashMany(ids) }
  ]
}

function flatBooks(books: Record<string, Book>): { book: Book; depth: number }[] {
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

/** Khung bên phải khi đang chọn nhiều ghi chú */
export function BulkPanel(): React.JSX.Element {
  const ids = useStore((s) => s.multi)
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const s = useStore.getState()
  const [tagText, setTagText] = useState('')
  const bookOptions = useMemo(() => flatBooks(books), [books])
  const selected = ids.map((id) => notes[id]).filter(Boolean)
  const inTrash = selected.length > 0 && selected.every((n) => n.trashed)
  const allPinned = selected.every((n) => n.pinned)

  const addTag = (): void => {
    const name = tagText.trim()
    if (!name) return
    const tagId = s.ensureTag(name)
    for (const n of selected) if (!n.tags.includes(tagId)) s.updateNote(n._id, { tags: [...n.tags, tagId] })
    setTagText('')
    s.showNotice(`Tagged ${plural(selected.length)} with “${name}”.`)
  }

  return (
    <main className="notepane bulk">
      <div className="titlebar-drag notepane-drag" />
      <div className="bulk-card">
        <div className="bulk-head">
          <Files size={22} />
          <div>
            <h2>{plural(selected.length)} selected</h2>
            <p>{inTrash ? 'All selected notes are in the Trash.' : 'Changes apply to every selected note.'}</p>
          </div>
          <span className="flex-1" />
          <button className="icon-btn" title="Clear selection (Esc)" onClick={() => s.setMulti([])}>
            <X size={16} />
          </button>
        </div>

        {inTrash ? (
          <div className="bulk-actions">
            <button className="btn" onClick={() => restoreMany(ids)}>
              <RotateCcw size={13} /> Restore
            </button>
            <button className="btn danger" onClick={() => deleteMany(ids)}>
              Delete Permanently
            </button>
          </div>
        ) : (
          <>
            <label className="bulk-row">
              <span>Move to</span>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  for (const n of selected) s.updateNote(n._id, { bookId: e.target.value })
                  s.showNotice(`Moved ${plural(selected.length)} to “${books[e.target.value]?.name}”.`)
                }}
              >
                <option value="">Choose a notebook…</option>
                {bookOptions.map(({ book, depth }) => (
                  <option key={book._id} value={book._id}>
                    {'  '.repeat(depth) + book.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="bulk-row">
              <span>Status</span>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  for (const n of selected) s.updateNote(n._id, { status: e.target.value as NoteStatus })
                }}
              >
                <option value="">Choose a status…</option>
                <option value="none">No status</option>
                {STATUSES.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="bulk-row">
              <span>Add tag</span>
              <input
                value={tagText}
                placeholder="Tag name, then Enter"
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
            </div>
            <div className="bulk-actions">
              <button className="btn" onClick={() => selected.forEach((n) => s.updateNote(n._id, { pinned: !allPinned }))}>
                <Pin size={13} /> {allPinned ? 'Unpin' : 'Pin to Top'}
              </button>
              <span className="flex-1" />
              <button className="btn danger" onClick={() => trashMany(ids)}>
                <Trash2 size={13} /> Move to Trash
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
