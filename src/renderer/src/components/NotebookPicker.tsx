import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fuzzyMatch } from '@/lib/fuzzy'
import { childrenByParent } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import type { Book } from '@/lib/types'
import { cx } from '@/lib/util'
import { BookIcon } from './BookIcon'

function flatten(books: Record<string, Book>): { book: Book; depth: number; path: string }[] {
  const children = childrenByParent(books)
  const out: { book: Book; depth: number; path: string }[] = []
  const walk = (parent: string | null, depth: number, prefix: string): void => {
    for (const book of children.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${book.name}` : book.name
      out.push({ book, depth, path })
      walk(book._id, depth + 1, path)
    }
  }
  walk(null, 0, '')
  return out
}

/**
 * Chọn notebook: bấm để mở danh sách, gõ để tìm mờ (khớp cả đường dẫn
 * "Cha / Con"), mũi tên để chọn, Enter để xác nhận.
 */
export function NotebookPicker({
  value,
  onPick,
  placeholder = 'Choose a notebook…',
  showIcon = true
}: {
  value: string
  onPick: (bookId: string) => void
  placeholder?: string
  showIcon?: boolean
}): React.JSX.Element {
  const books = useStore((s) => s.books)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => flatten(books), [books])

  const results = useMemo(() => {
    if (!query.trim()) return all.map((b) => ({ ...b, indices: [] as number[] }))
    return all
      .map((b) => {
        const m = fuzzyMatch(query, b.book.name) ?? (fuzzyMatch(query, b.path) ? { score: -3, indices: [] } : null)
        return m ? { ...b, indices: m.indices, score: m.score } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score)
  }, [all, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    list.current?.querySelector('.nbp-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (id: string | undefined): void => {
    if (!id) return
    setOpen(false)
    setQuery('')
    if (id !== value) onPick(id)
  }

  const current = books[value]
  return (
    <div className="nbp" ref={wrap}>
      <button type="button" className="nbp-trigger" title="Notebook" onClick={() => setOpen((o) => !o)}>
        {showIcon && <BookIcon name={current?.icon} size={15} />}
        <span className={cx('nbp-label', !current && 'placeholder')}>{current ? current.name : placeholder}</span>
        <ChevronDown size={13} className="nbp-chevron" />
      </button>
      {open && (
        <div className="nbp-pop" role="listbox">
          <input
            autoFocus
            value={query}
            placeholder="Find a notebook"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                pick(results[active]?.book._id)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
          <div className="nbp-list" ref={list}>
            {results.length === 0 && <div className="nbp-empty">No notebooks match</div>}
            {results.map((r, i) => (
              <div
                key={r.book._id}
                className={cx('nbp-item', i === active && 'active', r.book._id === value && 'current')}
                style={{ paddingLeft: 10 + (query.trim() ? 0 : r.depth * 14) }}
                onMouseMove={() => i !== active && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r.book._id)}
              >
                <BookIcon name={r.book.icon} size={14} />
                <span className="nbp-name">
                  {r.indices.length
                    ? [...r.book.name].map((ch, k) => (r.indices.includes(k) ? <mark key={k}>{ch}</mark> : <span key={k}>{ch}</span>))
                    : r.book.name}
                </span>
                {query.trim() && r.depth > 0 && <span className="nbp-path">{r.path.split(' / ').slice(0, -1).join(' / ')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
