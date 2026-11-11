import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

interface Props {
  noteId: string
  tagIds: string[]
  readOnly?: boolean
}

export function TagInput({ noteId, tagIds, readOnly = false }: Props): React.JSX.Element {
  const tags = useStore((s) => s.tags)
  const updateNote = useStore((s) => s.updateNote)
  const ensureTag = useStore((s) => s.ensureTag)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const cancelled = useRef(false)

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()
    return Object.values(tags)
      .filter((t) => !tagIds.includes(t._id) && (!q || t.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [tags, tagIds, text])

  const add = (name: string): void => {
    const trimmed = name.trim().replace(/,+$/, '')
    if (!trimmed) return
    const id = ensureTag(trimmed)
    if (!tagIds.includes(id)) updateNote(noteId, { tags: [...tagIds, id] })
    setText('')
    setActive(-1)
  }

  const remove = (id: string): void => updateNote(noteId, { tags: tagIds.filter((t) => t !== id) })

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // Enter lấy gợi ý đang chọn bằng phím mũi tên, nếu không thì lấy đúng chữ đã gõ
      add(active >= 0 && suggestions[active] ? suggestions[active].name : text)
    } else if (e.key === 'Tab' && text.trim() && suggestions.length) {
      e.preventDefault()
      add(suggestions[Math.max(active, 0)].name)
    } else if (e.key === 'Backspace' && !text && tagIds.length) {
      remove(tagIds[tagIds.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      // Esc hủy chữ đang gõ: báo cho onBlur đừng thêm tag
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
            {tag.name}
            {!readOnly && (
              <button className="tag-remove" title="Remove tag" onClick={() => remove(id)}>
                <X size={11} />
              </button>
            )}
          </span>
        )
      })}
      {!readOnly && (
        <div className="tag-field">
          <input
            value={text}
            placeholder={tagIds.length ? '' : 'Add tags'}
            onChange={(e) => {
              setText(e.target.value)
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
          {focused && suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((t, i) => (
                <button
                  key={t._id}
                  className={cx('tag-suggestion', i === active && 'active')}
                  // mousedown để chạy trước sự kiện blur của ô nhập
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(t.name)
                  }}
                >
                  <span className="tag-dot" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
