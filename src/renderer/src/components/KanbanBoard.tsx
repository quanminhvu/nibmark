import { useEffect, useMemo, useRef, useState } from 'react'
import { ListChecks, Plus, X } from 'lucide-react'
import { addCard, addColumn, deleteCard, moveCard, parseBoard, renameCard, renameColumn, toggleCard } from '@/lib/kanban'
import type { KanbanCard } from '@/lib/kanban'
import { renderInlineMarkdown, renderMarkdown } from '@/lib/markdown'
import { fileIdFromUrl, openAttachment, resolveFileUrls } from '@/lib/attachments'
import { followNoteLink } from '@/lib/noteLinks'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

interface Props {
  source: string
  /** Bỏ trống = chỉ xem (ví dụ ghi chú trong Trash) */
  onChange?: (source: string) => void
}

/** Kiểu dữ liệu riêng khi kéo thẻ, để sidebar và các vùng thả khác không nhận nhầm */
const DRAG_TYPE = 'application/x-nibmark-kanban-card'
const TAG = /(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu

/** Tách `#tag` khỏi tiêu đề thẻ để hiện thành viên tag riêng */
function splitTags(text: string): { title: string; tags: string[] } {
  const tags: string[] = []
  // Bỏ qua phần trong `code` để `#include` không thành tag
  const parts = text.split(/(`[^`]*`)/)
  const title = parts
    .map((p, i) =>
      i % 2
        ? p
        : p.replace(TAG, (_all, space: string, name: string) => {
            tags.push(name)
            return space
          })
    )
    .join('')
    .trim()
  return { title, tags }
}

type Editing = { kind: 'card'; col: number; card: number } | { kind: 'new'; col: number } | { kind: 'column'; col: number } | { kind: 'newColumn' } | null

export function KanbanBoard({ source, onChange }: Props): React.JSX.Element {
  const columns = useMemo(() => parseBoard(source), [source])
  const tags = useStore((s) => s.tags)
  const tagColor = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of Object.values(tags)) map.set(t.name.toLowerCase(), t.color)
    return map
  }, [tags])

  const drag = useRef<{ col: number; card: number } | null>(null)
  const [drop, setDrop] = useState<{ col: number; index: number } | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const editable = !!onChange

  const change = (next: string): void => {
    if (onChange && next !== source) onChange(next)
  }

  const dropIndex = (list: HTMLElement, y: number): number => {
    const cards = [...list.querySelectorAll<HTMLElement>(':scope > .kanban-card')]
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    return i < 0 ? cards.length : i
  }

  const handleClick = (event: React.MouseEvent): void => {
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return
    event.preventDefault()
    event.stopPropagation()
    const href = link.getAttribute('href') ?? ''
    if (followNoteLink(href)) return
    const fileId = fileIdFromUrl(href)
    if (fileId) void openAttachment(fileId)
    else if (/^(https?:|mailto:)/i.test(href)) window.open(href)
  }

  if (!columns.length) {
    return (
      <div className="kanban-empty">
        <p>This board has no columns yet. Add a `## Heading` for each column, or:</p>
        {editable && (
          <InlineInput placeholder="Column name" onSubmit={(t) => change(addColumn(source, t))} onCancel={() => {}} autoFocus={false} />
        )}
      </div>
    )
  }

  return (
    <div className="kanban" onClick={handleClick}>
      {columns.map((col, ci) => (
        <section key={`${ci}:${col.title}`} className="kanban-col">
          <header className="kanban-col-head">
            {editing?.kind === 'column' && editing.col === ci ? (
              <InlineInput
                initial={col.title}
                onSubmit={(t) => (change(renameColumn(source, ci, t)), setEditing(null))}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <h3
                title={editable ? 'Double-click to rename' : undefined}
                onDoubleClick={() => editable && setEditing({ kind: 'column', col: ci })}
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(col.title) }}
              />
            )}
            <span className="kanban-count">{col.cards.length}</span>
            {editable && (
              <button className="icon-btn small" title="Add a card" onClick={() => setEditing({ kind: 'new', col: ci })}>
                <Plus size={14} />
              </button>
            )}
          </header>

          <div
            className={cx('kanban-list', drop?.col === ci && 'drop-target')}
            onDragOver={(e) => {
              if (!drag.current || !e.dataTransfer.types.includes(DRAG_TYPE)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const index = dropIndex(e.currentTarget, e.clientY)
              if (drop?.col !== ci || drop.index !== index) setDrop({ col: ci, index })
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d?.col === ci ? null : d))
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = drag.current
              const index = dropIndex(e.currentTarget, e.clientY)
              drag.current = null
              setDrop(null)
              if (from) change(moveCard(source, from.col, from.card, ci, index))
            }}
          >
            {col.cards.map((card, ki) => (
              <CardView
                key={`${card.start}:${card.text}`}
                card={card}
                tagColor={tagColor}
                editable={editable}
                dropBefore={drop?.col === ci && drop.index === ki}
                editing={editing?.kind === 'card' && editing.col === ci && editing.card === ki}
                onEdit={() => setEditing({ kind: 'card', col: ci, card: ki })}
                onRename={(t) => (change(renameCard(source, ci, ki, t)), setEditing(null))}
                onCancel={() => setEditing(null)}
                onToggle={() => change(toggleCard(source, ci, ki))}
                onDelete={() => change(deleteCard(source, ci, ki))}
                onDragStart={(e) => {
                  drag.current = { col: ci, card: ki }
                  e.dataTransfer.setData(DRAG_TYPE, `${ci}:${ki}`)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  drag.current = null
                  setDrop(null)
                }}
              />
            ))}
            {drop?.col === ci && drop.index === col.cards.length && <div className="kanban-drop-line" />}

            {editing?.kind === 'new' && editing.col === ci ? (
              <InlineInput
                placeholder="Card title, then Enter"
                multiline
                onSubmit={(t) => change(addCard(source, ci, t))}
                onCancel={() => setEditing(null)}
              />
            ) : (
              editable && (
                <button className="kanban-add" onClick={() => setEditing({ kind: 'new', col: ci })}>
                  <Plus size={13} /> Add a card
                </button>
              )
            )}
          </div>
        </section>
      ))}

      {editable && (
        <section className="kanban-col kanban-col-new">
          {editing?.kind === 'newColumn' ? (
            <InlineInput
              placeholder="Column name"
              onSubmit={(t) => (change(addColumn(source, t)), setEditing(null))}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button className="kanban-add" onClick={() => setEditing({ kind: 'newColumn' })}>
              <Plus size={13} /> Add a column
            </button>
          )}
        </section>
      )}
    </div>
  )
}

interface CardProps {
  card: KanbanCard
  tagColor: Map<string, string>
  editable: boolean
  editing: boolean
  dropBefore: boolean
  onEdit: () => void
  onRename: (text: string) => void
  onCancel: () => void
  onToggle: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function CardView(p: CardProps): React.JSX.Element {
  const { card } = p
  const { title, tags } = useMemo(() => splitTags(card.text), [card.text])
  const titleHtml = useMemo(() => resolveFileUrls(renderInlineMarkdown(title)), [title])
  // Chi tiết thẻ: bỏ các dòng việc con (đã có thanh tiến độ), phần còn lại hiện nhỏ bên dưới
  const detail = useMemo(() => {
    const rest = card.detail
      .split('\n')
      .filter((l) => !/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(l))
      .join('\n')
      .trim()
    return rest ? resolveFileUrls(renderMarkdown(rest)) : ''
  }, [card.detail])

  return (
    <>
      {p.dropBefore && <div className="kanban-drop-line" />}
      <article
        className={cx('kanban-card', card.done && 'done')}
        draggable={p.editable && !p.editing}
        onDragStart={p.onDragStart}
        onDragEnd={p.onDragEnd}
        onDoubleClick={(e) => {
          if (!p.editable || (e.target as HTMLElement).closest('a, input, button')) return
          p.onEdit()
        }}
      >
        {p.editing ? (
          <InlineInput initial={card.text} multiline onSubmit={p.onRename} onCancel={p.onCancel} />
        ) : (
          <>
            <div className="kanban-card-main">
              {card.done !== null && (
                <input
                  type="checkbox"
                  checked={card.done}
                  disabled={!p.editable}
                  onChange={p.onToggle}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <div className="kanban-card-title" dangerouslySetInnerHTML={{ __html: titleHtml || '&nbsp;' }} />
              {p.editable && (
                <button className="kanban-card-delete" title="Delete card" onClick={p.onDelete}>
                  <X size={12} />
                </button>
              )}
            </div>
            {detail && <div className="kanban-card-detail markdown-body" dangerouslySetInnerHTML={{ __html: detail }} />}
            {(card.tasks.total > 0 || tags.length > 0) && (
              <div className="kanban-card-meta">
                {card.tasks.total > 0 && (
                  <span className={cx('note-item-tasks', card.tasks.done === card.tasks.total && 'done')}>
                    <ListChecks size={12} />
                    <span className="task-bar">
                      <span style={{ width: `${(card.tasks.done / card.tasks.total) * 100}%` }} />
                    </span>
                    {card.tasks.done} of {card.tasks.total}
                  </span>
                )}
                {tags.map((t) => (
                  <span
                    key={t}
                    className="tag-chip small"
                    style={{ '--tag': p.tagColor.get(t.toLowerCase()) ?? 'var(--accent)' } as React.CSSProperties}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </article>
    </>
  )
}

/** Ô nhập tại chỗ: Enter để lưu, Esc để huỷ; rời ô cũng lưu (nếu có chữ). */
function InlineInput({
  initial = '',
  placeholder,
  multiline,
  autoFocus = true,
  onSubmit,
  onCancel
}: {
  initial?: string
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !autoFocus) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])

  // Tự giãn chiều cao theo nội dung
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const submit = (keepOpen: boolean): void => {
    const text = value.trim()
    if (text && text !== initial.trim()) onSubmit(text)
    if (keepOpen && text && !initial) {
      setValue('')
      return
    }
    done.current = true
    onCancel()
  }

  return (
    <textarea
      ref={ref}
      className={cx('kanban-input', multiline && 'multiline')}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          submit(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          done.current = true
          onCancel()
        }
      }}
      onBlur={() => {
        if (!done.current) submit(false)
      }}
    />
  )
}
