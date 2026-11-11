import { useEffect, useMemo, useState } from 'react'
import { Notebook, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

// Icon cho notebook. Bộ hơn 2.000 icon Lucide khá nặng nên chỉ nạp khi cần,
// trong lúc chưa nạp xong thì hiện icon notebook mặc định.

type IconMap = Record<string, LucideIcon>

const ICON_NAME = /^[A-Z][A-Za-z0-9]{1,60}$/
const useIcons = create<{ map: IconMap | null }>(() => ({ map: null }))
let loading = false

function loadIcons(): void {
  if (loading) return
  loading = true
  void import('lucide-react').then((m) => useIcons.setState({ map: m.icons as IconMap }))
}

export function BookIcon({ name, size = 15 }: { name?: string; size?: number }): React.JSX.Element {
  const map = useIcons((s) => s.map)
  useEffect(() => {
    if (name) loadIcons()
  }, [name])
  const Icon = name && ICON_NAME.test(name) ? map?.[name] : undefined
  return Icon ? <Icon size={size} /> : <Notebook size={size} />
}

// ── Hộp chọn icon ──

const usePicker = create<{ bookId: string | null }>(() => ({ bookId: null }))

export function openIconPicker(bookId: string): void {
  loadIcons()
  usePicker.setState({ bookId })
}

// Gợi ý vài icon hay dùng khi chưa gõ tìm kiếm
const SUGGESTED = [
  'Notebook', 'BookOpen', 'Briefcase', 'Code', 'Terminal', 'Lightbulb', 'Star', 'Heart', 'House', 'GraduationCap',
  'FlaskConical', 'Rocket', 'Bug', 'Calendar', 'Inbox', 'Archive', 'Folder', 'Bookmark', 'PenTool', 'Palette',
  'Music', 'Camera', 'Plane', 'Coffee', 'Dumbbell', 'Wallet', 'ShoppingCart', 'Users', 'MessageCircle', 'Globe',
  'Database', 'Server', 'Cloud', 'Cpu', 'GitBranch', 'Package', 'Wrench', 'Shield', 'Target', 'Flag',
  'Leaf', 'Sun', 'Moon', 'Mountain', 'Map', 'Compass', 'Clock', 'ListTodo', 'NotebookPen', 'Feather'
]

export function IconPicker(): React.JSX.Element | null {
  const bookId = usePicker((s) => s.bookId)
  const book = useStore((s) => (bookId ? s.books[bookId] : undefined))
  const map = useIcons((s) => s.map)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!bookId) return
    setQuery('')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        usePicker.setState({ bookId: null })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bookId])

  const names = useMemo(() => {
    if (!map) return []
    const q = query.trim().toLowerCase().replace(/[\s-]+/g, '')
    if (!q) return SUGGESTED.filter((n) => map[n])
    return Object.keys(map)
      .filter((n) => n.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.length - b.length)
      .slice(0, 240)
  }, [map, query])

  if (!bookId || !book) return null
  const close = (): void => usePicker.setState({ bookId: null })
  const pick = (icon: string | null): void => {
    useStore.getState().setBookIcon(bookId, icon)
    close()
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="icon-picker" role="dialog" aria-label="Choose an icon" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Search size={16} />
          <input autoFocus value={query} placeholder={`Icon for “${book.name}”…`} onChange={(e) => setQuery(e.target.value)} />
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </div>
        <div className="icon-grid">
          {!map && <div className="pal-empty">Loading icons…</div>}
          {map && names.length === 0 && <div className="pal-empty">No icons match “{query}”.</div>}
          {map &&
            names.map((name) => {
              const Icon = map[name]
              return (
                <button key={name} title={name} className={cx('icon-cell', book.icon === name && 'selected')} onClick={() => pick(name)}>
                  <Icon size={18} />
                </button>
              )
            })}
        </div>
        <div className="icon-footer">
          <span>{map ? `${Object.keys(map).length.toLocaleString()} icons from Lucide` : ''}</span>
          <span className="flex-1" />
          <button className="btn" onClick={() => pick(null)}>
            Use Default Icon
          </button>
        </div>
      </div>
    </div>
  )
}
