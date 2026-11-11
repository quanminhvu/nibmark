import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, CircleDashed, Plus } from 'lucide-react'
import { fuzzyMatch } from '@/lib/fuzzy'
import { getStatuses } from '@/lib/statuses'
import { useStore } from '@/lib/store'
import type { NoteStatus } from '@/lib/types'
import { cx } from '@/lib/util'
import { StatusIcon } from './StatusIcon'

type Option = { id: NoteStatus; label: string; create?: string }

/**
 * Chọn trạng thái: bấm để mở danh sách (có icon màu và dấu ✓), gõ để lọc,
 * mũi tên để chọn, Enter để xác nhận. Gõ một tên chưa có thì tạo trạng thái mới.
 */
export function StatusPicker({
  value,
  onPick,
  placeholder = 'No status',
  allowNone = true,
  compact = false
}: {
  /** '' = chưa chọn (dùng cho thao tác hàng loạt) */
  value: NoteStatus | ''
  onPick: (status: NoteStatus) => void
  placeholder?: string
  allowNone?: boolean
  /** Nút gọn (dùng trong bảng chọn hàng loạt) */
  compact?: boolean
}): React.JSX.Element {
  useStore((s) => s.statuses)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const statuses = getStatuses()
  // Trạng thái đã xóa hoặc không còn tồn tại thì coi như chưa có trạng thái
  const current = statuses.find((s) => s.id === value)

  const options = ((): (Option & { indices: number[] })[] => {
    const base: Option[] = [...(allowNone ? [{ id: 'none' as NoteStatus, label: 'No status' }] : []), ...statuses.map((s) => ({ id: s.id, label: s.label }))]
    const q = query.trim()
    if (!q) return base.map((o) => ({ ...o, indices: [] }))
    const found = base
      .map((o) => {
        const m = fuzzyMatch(q, o.label)
        return m ? { ...o, indices: m.indices, score: m.score } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score)
    const exact = base.some((o) => o.label.toLowerCase() === q.toLowerCase())
    return exact ? found : [...found, { id: 'none' as NoteStatus, label: `Create status “${q}”`, create: q, indices: [] }]
  })()

  // Mở ra thì tô sáng trạng thái hiện tại; gõ để lọc thì về dòng đầu
  useEffect(() => {
    if (query.trim()) setActive(0)
    else setActive(Math.max(0, options.findIndex((o) => o.id === (current?.id ?? 'none'))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    list.current?.querySelector('.stp-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (option: Option | undefined): void => {
    if (!option) return
    setOpen(false)
    setQuery('')
    const id = option.create ? useStore.getState().ensureStatus(option.create) : option.id
    if (id !== value) onPick(id)
  }

  return (
    <div className={cx('stp', compact && 'compact')} ref={wrap}>
      <button
        type="button"
        className={cx('stp-trigger', !current && 'empty')}
        title="Status"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current ? <StatusIcon status={current.id} size={15} /> : <CircleDashed size={15} className="status-none" />}
        <span className="stp-label">{current ? current.label : placeholder}</span>
        <ChevronDown size={13} className="stp-chevron" />
      </button>
      {open && (
        <div className="stp-pop" role="listbox" aria-label="Status">
          <input
            autoFocus
            value={query}
            placeholder="Find or create a status"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, options.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                pick(options[active])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
          <div className="stp-list" ref={list}>
            {options.length === 0 && <div className="stp-empty">No statuses</div>}
            {options.map((o, i) => (
              <div
                key={o.create ? 'create' : o.id}
                role="option"
                aria-selected={!o.create && o.id === (current?.id ?? 'none')}
                className={cx('stp-item', i === active && 'active', o.create && 'create')}
                onMouseMove={() => i !== active && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                <span className="stp-icon">
                  {o.create ? <Plus size={14} /> : o.id === 'none' ? <CircleDashed size={15} className="status-none" /> : <StatusIcon status={o.id} size={15} />}
                </span>
                <span className="stp-name">
                  {o.indices.length
                    ? [...o.label].map((ch, k) => (o.indices.includes(k) ? <mark key={k}>{ch}</mark> : <span key={k}>{ch}</span>))
                    : o.label}
                </span>
                {!o.create && o.id === (current?.id ?? (value === '' ? '' : 'none')) && <Check size={14} className="stp-check" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
