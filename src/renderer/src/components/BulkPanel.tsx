import { useState } from 'react'
import { CircleDashed, Files, Pin, RotateCcw, Trash2, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { NotebookPicker } from './NotebookPicker'
import { StatusIcon } from './StatusIcon'
import { StatusPicker } from './StatusPicker'
import { getStatuses } from '@/lib/statuses'
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
    ...getStatuses().map((st) => ({
      label: `Set Status: ${st.label}`,
      icon: <StatusIcon status={st.id} size={14} />,
      onClick: () => ids.forEach((id) => s.updateNote(id, { status: st.id }))
    })),
    { label: 'Clear Status', icon: <CircleDashed size={14} className="status-none" />, onClick: () => ids.forEach((id) => s.updateNote(id, { status: 'none' })) },
    { separator: true },
    { label: `Move ${plural(ids.length)} to Trash`, danger: true, onClick: () => trashMany(ids) }
  ]
}


/** Khung bên phải khi đang chọn nhiều ghi chú */
export function BulkPanel(): React.JSX.Element {
  useStore((s) => s.statuses)
  const ids = useStore((s) => s.multi)
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const s = useStore.getState()
  const [tagText, setTagText] = useState('')
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
            <div className="bulk-row">
              <span>Move to</span>
              <NotebookPicker
                value=""
                showIcon={false}
                onPick={(bookId) => {
                  for (const n of selected) s.updateNote(n._id, { bookId })
                  s.showNotice(`Moved ${plural(selected.length)} to “${books[bookId]?.name}”.`)
                }}
              />
            </div>
            <div className="bulk-row">
              <span>Status</span>
              <StatusPicker
                value=""
                compact
                placeholder="Choose a status…"
                onPick={(status) => {
                  for (const n of selected) s.updateNote(n._id, { status })
                }}
              />
            </div>
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
