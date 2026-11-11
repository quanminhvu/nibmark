import { useMemo, useState } from 'react'
import { ChevronDown, FileText, Link2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Note } from '@/lib/types'
import { linkedNoteIds } from '@/lib/markdown'

const linkCache = new WeakMap<Note, Set<string>>()
function targets(note: Note): Set<string> {
  let ids = linkCache.get(note)
  if (!ids) { ids = linkedNoteIds(note.body); linkCache.set(note, ids) }
  return ids
}

export function Backlinks({ noteId }: { noteId: string }): React.JSX.Element {
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const [open, setOpen] = useState(true)
  const links = useMemo(() => Object.values(notes)
    .filter((n) => !n.trashed && n._id !== noteId && targets(n).has(noteId))
    .sort((a, b) => b.updatedAt - a.updatedAt), [notes, noteId])
  return <section className="backlinks" aria-label="Backlinks">
    <button className="backlinks-heading" aria-expanded={open} onClick={() => setOpen(!open)}><Link2 size={13} /><span>Backlinks</span><span className="backlinks-count">{links.length}</span><ChevronDown size={13} style={{ transform: open ? undefined : 'rotate(-90deg)' }} /></button>
    {open && <div className="backlinks-list">{links.length ? links.map((n) => <button key={n._id} title={n.title || 'Untitled'} onClick={() => useStore.getState().openNote(n._id)}><FileText size={14} /><span>{n.title || 'Untitled'}</span><small>{books[n.bookId]?.name ?? ''}</small></button>) : <p>No other notes link here yet. Type [[ in another note to create a link.</p>}</div>}
  </section>
}
