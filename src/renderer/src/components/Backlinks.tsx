import { useMemo, useState } from 'react'
import { ChevronDown, FileText, Link2, Unlink } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Note } from '@/lib/types'
import { linkedNoteIds } from '@/lib/markdown'
import { linkMention, unlinkedMentions } from '@/lib/mentions'

const linkCache = new WeakMap<Note, Set<string>>()
function targets(note: Note): Set<string> {
  let ids = linkCache.get(note)
  if (!ids) { ids = linkedNoteIds(note.body); linkCache.set(note, ids) }
  return ids
}

export function Backlinks({ noteId }: { noteId: string }): React.JSX.Element | null {
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const [open, setOpen] = useState(true)
  const [mentionsOpen, setMentionsOpen] = useState(false)
  const links = useMemo(() => Object.values(notes)
    .filter((n) => !n.trashed && n._id !== noteId && targets(n).has(noteId))
    .sort((a, b) => b.updatedAt - a.updatedAt), [notes, noteId])
  const target = notes[noteId]
  const title = target?.title ?? ''
  // Chỉ tính lại khi danh sách ghi chú hoặc tiêu đề đổi (gõ nội dung ghi chú này không đổi kết quả)
  const mentions = useMemo(() => (target ? unlinkedMentions(Object.values(notes), target, targets) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, noteId, title])
  const mentionCount = mentions.reduce((n, g) => n + g.mentions.length, 0)

  const link = (note: Note, index: number): void => {
    const group = mentions.find((g) => g.note._id === note._id)
    const mention = group?.mentions[index]
    if (!mention) return
    const body = linkMention(note.body, mention, noteId)
    if (body !== note.body) useStore.getState().updateNote(note._id, { body })
  }

  // Không có backlink lẫn chỗ nhắc tới nào: ẩn hẳn, không chiếm chỗ dưới ghi chú
  if (!links.length && !mentions.length) return null

  return <section className="backlinks" aria-label="Backlinks">
    <div className="backlinks-headings">
      {links.length > 0 && <button className="backlinks-heading" aria-expanded={open} onClick={() => setOpen(!open)}><Link2 size={13} /><span>Backlinks</span><span className="backlinks-count">{links.length}</span><ChevronDown size={13} style={{ transform: open ? undefined : 'rotate(-90deg)' }} /></button>}
      {mentions.length > 0 && <button className="backlinks-heading mentions-heading" aria-expanded={mentionsOpen} title="Notes that mention this title without linking to it" onClick={() => setMentionsOpen(!mentionsOpen)}><Unlink size={13} /><span>Unlinked mentions</span><span className="mentions-count">{mentionCount}</span><ChevronDown size={13} style={{ transform: mentionsOpen ? undefined : 'rotate(-90deg)' }} /></button>}
    </div>
    {open && links.length > 0 && <div className="backlinks-list">{links.map((n) => <button key={n._id} title={n.title || 'Untitled'} onClick={() => useStore.getState().openNote(n._id)}><FileText size={14} /><span>{n.title || 'Untitled'}</span><small>{books[n.bookId]?.name ?? ''}</small></button>)}</div>}
    {mentionsOpen && mentions.length > 0 && <div className="mentions-list">
      {mentions.map(({ note, mentions: list }) => <div key={note._id} className="mention-group">
        <button className="mention-note" title={`Open “${note.title || 'Untitled'}”`} onClick={() => useStore.getState().openNote(note._id)}><FileText size={13} /><span>{note.title || 'Untitled'}</span></button>
        {list.slice(0, 3).map((m, i) => <div key={m.index} className="mention-row">
          <span className="mention-text">{m.before}<mark>{m.match}</mark>{m.after}</span>
          <button className="mention-link" title={`Turn this mention into a link to “${title}”`} onClick={() => link(note, i)}>Link</button>
        </div>)}
        {list.length > 3 && <div className="mention-more">{list.length - 3} more in this note</div>}
      </div>)}
    </div>}
  </section>
}
