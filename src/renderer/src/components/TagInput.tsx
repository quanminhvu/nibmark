import { useMemo, useRef, useState } from 'react'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Tag } from '@/lib/types'
import { cx } from '@/lib/util'
import { fuzzyMatch } from '@/lib/fuzzy'

interface Props {
  noteId: string
  tagIds: string[]
  readOnly?: boolean
}

type Row = { tag: Tag; indices: number[]; count: number } | { create: string }

/** Tag theo thứ tự tự sắp trong sidebar (kéo thả), rồi theo tên */
const byOrder = (a: Tag, b: Tag): number => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)

export function TagInput({ noteId, tagIds, readOnly = false }: Props): React.JSX.Element {
  const tags = useStore((s) => s.tags)
  const notes = useStore((s) => s.notes)
  const updateNote = useStore((s) => s.updateNote)
  const ensureTag = useStore((s) => s.ensureTag)
  const select = useStore((s) => s.select)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const cancelled = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  // Số ghi chú của từng tag, hiện bên phải gợi ý
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of Object.values(notes)) if (!n.trashed) for (const id of n.tags) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [notes])

  const rows = useMemo<Row[]>(() => {
    const q = text.trim().replace(/,+$/, '')
    const free = Object.values(tags).filter((t) => !tagIds.includes(t._id))
    if (!q) return free.sort(byOrder).slice(0, 8).map((tag) => ({ tag, indices: [], count: counts.get(tag._id) ?? 0 }))
    // Tìm mờ: "fe" khớp "frontend", "feature"…; khớp tốt hơn lên trước
    const found: Row[] = free
      .map((tag) => ({ tag, m: fuzzyMatch(q, tag.name) }))
      .filter((x) => x.m)
      .sort((a, b) => b.m!.score - a.m!.score || byOrder(a.tag, b.tag))
      .slice(0, 8)
      .map((x) => ({ tag: x.tag, indices: x.m!.indices, count: counts.get(x.tag._id) ?? 0 }))
    const exists = Object.values(tags).some((t) => t.name.toLowerCase() === q.toLowerCase())
    return exists ? found : [...found, { create: q }]
  }, [tags, tagIds, text, counts])

  const add = (name: string): void => {
    const trimmed = name.trim().replace(/,+$/, '')
    if (!trimmed) return
    const id = ensureTag(trimmed)
    if (!tagIds.includes(id)) updateNote(noteId, { tags: [...tagIds, id] })
    setText('')
    setActive(-1)
  }

  const pickRow = (row: Row | undefined): void => {
    if (!row) return
    add('create' in row ? row.create : row.tag.name)
  }

  const remove = (id: string): void => updateNote(noteId, { tags: tagIds.filter((t) => t !== id) })

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // Enter lấy gợi ý đang chọn bằng phím mũi tên, nếu không thì lấy đúng chữ đã gõ
      if (active >= 0 && rows[active]) pickRow(rows[active])
      else add(text)
    } else if (e.key === 'Tab' && text.trim() && rows.some((r) => 'tag' in r)) {
      e.preventDefault()
      const row = active >= 0 && rows[active] ? rows[active] : rows.find((r) => 'tag' in r)
      pickRow(row)
    } else if (e.key === 'Backspace' && !text && tagIds.length) {
      remove(tagIds[tagIds.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      // Esc hủy chữ đang gõ: báo cho onBlur đừng thêm tag
      e.preventDefault()
      e.stopPropagation()
      cancelled.current = true
      setText('')
      e.currentTarget.blur()
    }
  }

  return (
    <div className="tag-input">
      {tagIds.map((id) => {
        const tag = tags[id]
        if (!tag) return null
        return (
          <span key={id} className="tag-chip" style={{ '--tag': tag.color } as React.CSSProperties}>
            <button className="tag-chip-name" title={`Show notes tagged “${tag.name}”`} onClick={() => select({ kind: 'tag', id })}>
              {tag.name}
            </button>
            {!readOnly && (
              <button className="tag-remove" title="Remove tag" aria-label={`Remove tag ${tag.name}`} onClick={() => remove(id)}>
                <X size={11} />
              </button>
            )}
          </span>
        )
      })}
      {!readOnly && (
        <div className={cx('tag-field', focused && 'focused')} onMouseDown={(e) => e.target === e.currentTarget && (e.preventDefault(), input.current?.focus())}>
          {!focused && !text && <TagIcon size={13} className="tag-field-icon" />}
          <input
            ref={input}
            value={text}
            placeholder={tagIds.length ? 'Add tag' : 'Add tags'}
            aria-label="Add tag"
            onChange={(e) => {
              setText(e.target.value)
              // Enter thêm đúng chữ đã gõ; muốn lấy gợi ý thì chọn bằng mũi tên (hoặc Tab)
              setActive(-1)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              if (cancelled.current) cancelled.current = false
              else add(text)
            }}
          />
          {focused && rows.length > 0 && (
            <div className="tag-suggestions" role="listbox">
              {!text.trim() && <div className="tag-suggestions-head">Tags</div>}
              {rows.map((row, i) =>
                'create' in row ? (
                  <button
                    key="create"
                    className={cx('tag-suggestion', 'create', i === active && 'active')}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(e) => {
                      // mousedown để chạy trước sự kiện blur của ô nhập
                      e.preventDefault()
                      pickRow(row)
                    }}
                  >
                    <Plus size={13} className="tag-suggestion-plus" />
                    <span className="tag-suggestion-name">Create tag “{row.create}”</span>
                  </button>
                ) : (
                  <button
                    key={row.tag._id}
                    className={cx('tag-suggestion', i === active && 'active')}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickRow(row)
                    }}
                  >
                    <span className="tag-dot" style={{ background: row.tag.color }} />
                    <span className="tag-suggestion-name">
                      {row.indices.length
                        ? [...row.tag.name].map((ch, k) => (row.indices.includes(k) ? <mark key={k}>{ch}</mark> : <span key={k}>{ch}</span>))
                        : row.tag.name}
                    </span>
                    {row.count > 0 && <span className="tag-suggestion-count">{row.count}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
