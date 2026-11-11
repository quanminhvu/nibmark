import { useEffect, useRef, useState } from 'react'

export function usePaneSize(key: string, fallback: number): [number, (value: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key))
      return Number.isFinite(saved) && saved > 0 ? saved : fallback
    } catch { return fallback }
  })
  return [value, (next) => {
    setValue(next)
    try { localStorage.setItem(key, String(next)) } catch { /* Storage may be unavailable. */ }
  }]
}

interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
  percent?: boolean
  reset: number
}

/** An overlay on a pane boundary: does not consume a grid column. */
export function ResizeHandle({ label, value, min, max, onChange, className = '', percent, reset }: Props): React.JSX.Element {
  const drag = useRef<{ x: number; value: number; width: number } | null>(null)
  const cleanup = (): void => {
    drag.current = null
    document.documentElement.classList.remove('resizing-panes')
  }
  useEffect(() => cleanup, [])
  const change = (next: number): void => onChange(Math.max(min, Math.min(max, next)))
  return <div
    className={`pane-resizer ${className}`}
    role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max}
    tabIndex={0}
    onDoubleClick={() => change(reset)}
    onKeyDown={(e) => {
      const step = percent ? 2 : 16
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        change(value + (e.key === 'ArrowLeft' ? -step : step))
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        change(e.key === 'Home' ? min : max)
      }
    }}
    onPointerDown={(e) => {
      if (e.button !== 0) return
      e.preventDefault()
      const parent = e.currentTarget.parentElement!
      const previous = e.currentTarget.previousElementSibling
      drag.current = { x: e.clientX, value: percent ? value : previous?.getBoundingClientRect().width ?? value, width: parent.clientWidth }
      e.currentTarget.setPointerCapture(e.pointerId)
      document.documentElement.classList.add('resizing-panes')
    }}
    onPointerMove={(e) => {
      if (!drag.current) return
      const { x, value: start, width } = drag.current
      change(start + (e.clientX - x) * (percent ? 100 / Math.max(1, width) : 1))
    }}
    onPointerUp={cleanup} onPointerCancel={cleanup} onLostPointerCapture={cleanup}
  />
}
