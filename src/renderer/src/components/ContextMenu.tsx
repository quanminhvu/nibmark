import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { cx } from '@/lib/util'

export type MenuItem =
  | { label: string; onClick: () => void; danger?: boolean; checked?: boolean; disabled?: boolean }
  | { separator: true }

interface MenuState {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
}

const useMenu = create<MenuState>(() => ({ open: false, x: 0, y: 0, items: [] }))

const close = (): void => useMenu.setState({ open: false })

/** Mở menu tại vị trí con trỏ (chuột phải) hoặc ngay dưới một nút bấm. */
export function openMenu(event: React.MouseEvent, items: MenuItem[], anchorToTarget = false): void {
  event.preventDefault()
  event.stopPropagation()
  let { clientX: x, clientY: y } = event
  if (anchorToTarget) {
    const rect = event.currentTarget.getBoundingClientRect()
    x = rect.left
    y = rect.bottom + 4
  }
  useMenu.setState({ open: true, x, y, items })
}

export function ContextMenuHost(): React.JSX.Element | null {
  const { open, x, y, items } = useMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Giữ menu nằm trọn trong cửa sổ
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8))
    })
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="menu-backdrop" onMouseDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
      <div className="menu" ref={ref} style={pos} role="menu" onMouseDown={(e) => e.stopPropagation()}>
        {items.map((item, i) =>
          'separator' in item ? (
            <div key={i} className="menu-separator" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={cx('menu-item', item.danger && 'danger')}
              disabled={item.disabled}
              onClick={() => {
                close()
                item.onClick()
              }}
            >
              <span className="menu-check">{item.checked ? '✓' : ''}</span>
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
