import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pipette, Search, Trash2, X, icons } from 'lucide-react'
import { cx } from '@/lib/util'

export interface AppearanceTarget {
  name: string
  color: string
  /** Có icon = đang sửa trạng thái; không có = đang sửa tag */
  icon?: string
  /** Số ghi chú đang dùng (hiện trong phần xem trước) */
  count?: number
  onSave: (color: string, icon: string, name: string) => boolean
  /** Có thì hiện nút xóa ở chân hộp thoại */
  onDelete?: () => void
}

/** Bảng màu: hai hàng, từ lạnh tới ấm rồi trung tính */
const PALETTE = [
  '#2F6FE4', '#5B5BD6', '#9B59D0', '#E5487E', '#E5484D', '#F08C1A', '#E8B10E',
  '#7CB82F', '#2FB457', '#14A38B', '#1BA7C9', '#80A4CD', '#B7791F', '#8E8E93'
]

/** Icon gợi ý cho trạng thái (tìm được toàn bộ bộ icon bằng ô tìm kiếm) */
const SUGGESTED = [
  'Circle', 'CircleDot', 'Play', 'Pause', 'Check', 'CheckCheck', 'X', 'Ban',
  'Clock', 'Hourglass', 'Timer', 'CalendarClock', 'Loader', 'RefreshCw', 'Eye', 'Search',
  'Flag', 'Star', 'Heart', 'Bookmark', 'Pin', 'Target', 'Zap', 'Flame',
  'Lightbulb', 'Sparkles', 'Rocket', 'Trophy', 'Bug', 'Code', 'ListTodo', 'MessageCircle',
  'Send', 'Inbox', 'Archive', 'Lock', 'Snowflake', 'Moon', 'Coffee', 'Hand'
]

const HEX = /^#[0-9a-f]{6}$/i

/** Chữ trắng hay đen trên nền màu này (để dấu ✓ và icon luôn đọc được) */
function onColor(hex: string): string {
  if (!HEX.test(hex)) return '#fff'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.68 ? '#1d1d1f' : '#fff'
}

export function AppearancePicker({ target, onClose }: { target: AppearanceTarget; onClose: () => void }): React.JSX.Element {
  const isStatus = target.icon !== undefined
  const [name, setName] = useState(target.name)
  const [color, setColor] = useState(target.color.toUpperCase())
  const [hexText, setHexText] = useState(target.color.toUpperCase())
  const [icon, setIcon] = useState(target.icon ?? 'Circle')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const colorInput = useRef<HTMLInputElement>(null)

  // Bẫy Tab trong hộp thoại; Esc để đóng; trả lại con trỏ cho chỗ cũ khi đóng
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])
        const first = controls[0]
        const last = controls.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [onClose])

  const pickColor = (hex: string): void => {
    setColor(hex.toUpperCase())
    setHexText(hex.toUpperCase())
  }

  // Màu không có trong bảng (màu cũ hoặc tự chọn) hiện ở nút "Custom"
  const isCustom = !PALETTE.some((c) => c.toLowerCase() === color.toLowerCase())

  const iconNames = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SUGGESTED.filter((n) => icons[n as keyof typeof icons])
    return Object.keys(icons)
      .filter((n) => n.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.length - b.length)
      .slice(0, 120)
  }, [query])

  const Glyph = icons[icon as keyof typeof icons] ?? icons.Circle
  const shownName = name.trim() || 'Untitled'
  const fg = onColor(color)
  const save = (): void => {
    if (!target.onSave(color, icon, name.trim())) {
      setError(`Another ${isStatus ? 'status' : 'tag'} already has this name.`)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop appearance-backdrop" onMouseDown={onClose}>
      <form
        ref={formRef}
        className="ap-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${isStatus ? 'status' : 'tag'}`}
        style={{ '--ap': color, '--ap-on': fg } as React.CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <header className="ap-head">
          <h3>{isStatus ? 'Edit Status' : 'Edit Tag'}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {/* Xem trước đúng như sẽ hiện trong app */}
        <div className="ap-preview">
          <div className="ap-preview-row">
            {isStatus ? (
              <span className="ap-status-icon">
                <Glyph size={11} strokeWidth={2.6} />
              </span>
            ) : (
              <span className="ap-ring" />
            )}
            <span className="ap-preview-name">{shownName}</span>
            {target.count !== undefined && <span className="ap-preview-count">{target.count}</span>}
          </div>
          <div className="ap-preview-row ap-preview-chips">
            {isStatus ? (
              <span className="ap-status-pill">
                <span className="ap-status-icon small">
                  <Glyph size={9} strokeWidth={2.8} />
                </span>
                {shownName}
              </span>
            ) : (
              <span className="ap-tag-pill">{shownName}</span>
            )}
            <span className="ap-preview-hint">{isStatus ? 'in the note header and list' : 'on notes'}</span>
          </div>
        </div>

        <div className="ap-body">
          <label className="ap-field">
            <span className="ap-label">Name</span>
            <input
              autoFocus
              aria-label="Name"
              value={name}
              maxLength={100}
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
            />
          </label>
          {error && (
            <p className="ap-error" role="alert">
              {error}
            </p>
          )}

          <div className="ap-section">
            <span className="ap-label">Color</span>
            <div className="ap-swatches">
              {PALETTE.map((c) => {
                const on = color.toLowerCase() === c.toLowerCase()
                return (
                  <button
                    type="button"
                    key={c}
                    className={cx('ap-swatch', on && 'on')}
                    aria-label={`Use ${c}`}
                    aria-pressed={on}
                    title={c}
                    style={{ '--sw': c, color: onColor(c) } as React.CSSProperties}
                    onClick={() => pickColor(c)}
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
            <div className="ap-hex">
              <button
                type="button"
                className={cx('ap-custom', isCustom && 'on')}
                title="Pick any color"
                aria-pressed={isCustom}
                onClick={() => colorInput.current?.click()}
              >
                <span className="ap-custom-dot" style={isCustom ? { background: color } : undefined} />
                <Pipette size={13} />
                Custom
              </button>
              <input ref={colorInput} type="color" aria-label="Color" value={HEX.test(color) ? color.toLowerCase() : '#2f6fe4'} onChange={(e) => pickColor(e.target.value)} />
              <input
                className={cx('ap-hex-input', !HEX.test(hexText) && 'invalid')}
                aria-label="Hex color"
                value={hexText}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => {
                  const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                  setHexText(v.toUpperCase())
                  if (HEX.test(v)) setColor(v.toUpperCase())
                }}
                onBlur={() => setHexText(color)}
              />
            </div>
          </div>

          {isStatus && (
            <div className="ap-section">
              <div className="ap-label-row">
                <span className="ap-label">Icon</span>
                <label className="ap-search">
                  <Search size={13} />
                  <input aria-label="Search icons" placeholder="Search 1,500+ icons" value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
                </label>
              </div>
              <div className="ap-icons">
                {iconNames.length === 0 && <p className="ap-empty">No icons match “{query}”.</p>}
                {iconNames.map((n) => {
                  const Icon = icons[n as keyof typeof icons]
                  const on = icon === n
                  return (
                    <button type="button" key={n} title={n} aria-label={n} aria-pressed={on} className={cx('ap-icon', on && 'on')} onClick={() => setIcon(n)}>
                      <Icon size={17} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="ap-foot">
          {target.onDelete && (
            <button
              type="button"
              className="ap-delete"
              onClick={() => {
                target.onDelete?.()
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="ap-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ap-save" disabled={!name.trim()}>
            Save
          </button>
        </footer>
      </form>
    </div>
  )
}
