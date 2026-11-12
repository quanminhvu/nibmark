import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, X } from 'lucide-react'
import { buildGraph, closeGraph, noteLinks, tick, useGraph } from '@/lib/graph'
import type { Graph, GraphMode } from '@/lib/graph'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

/** Bảng đồ thị liên kết giữa các ghi chú */
export function GraphView(): React.JSX.Element | null {
  const open = useGraph((s) => s.open)
  if (!open) return null
  return <GraphPanel />
}

interface View {
  x: number
  y: number
  k: number
}

function themeColors(): Record<'ink' | 'ink2' | 'ink3' | 'line' | 'accent' | 'bg', string> {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  return {
    ink: v('--ink', '#1d1d1f'),
    ink2: v('--ink-2', '#48484d'),
    ink3: v('--ink-3', '#8e8e93'),
    line: v('--line', 'rgba(0,0,0,.12)'),
    accent: v('--accent', '#2f6fe4'),
    bg: v('--surface-2', '#fff')
  }
}

const radius = (degree: number): number => 3.5 + Math.sqrt(degree) * 1.8

function GraphPanel(): React.JSX.Element {
  const mode = useGraph((s) => s.mode)
  const focus = useGraph((s) => s.focus)
  const notes = useStore((s) => s.notes)
  const selected = useStore((s) => s.selectedNoteId)
  const [orphans, setOrphans] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const center = focus ?? selected

  // Dựng lại đồ thị khi đổi chế độ hoặc khi danh sách link đổi (không theo từng phím gõ)
  const linkKey = useMemo(
    () => Object.values(notes).filter((n) => !n.trashed).map((n) => `${n._id}\t${n.title}\t${[...noteLinks(n)].join(',')}`).join('\n'),
    [notes]
  )
  const graph = useMemo<Graph>(
    () => buildGraph(Object.values(notes), mode, center, orphans),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linkKey, mode, center, orphans]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeGraph()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')!
    let colors = themeColors()
    const view: View = { x: 0, y: 0, k: 1 }
    let alpha = 1
    let hover = -1
    let frame = 0
    let width = 0
    let height = 0
    const { nodes, edges, adjacent } = graph
    const centerIndex = nodes.findIndex((n) => n.id === center)

    // Chạy trước một đoạn mô phỏng để lần vẽ đầu đã gần ổn định
    for (let i = 0; i < 160 && alpha > 0.05; i++) {
      tick(graph, alpha)
      alpha *= 0.985
    }

    const fit = (): void => {
      if (!nodes.length) return
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of nodes) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
      }
      const pad = 60
      view.k = Math.min(2, Math.max(0.15, Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))))
      view.x = width / 2 - ((minX + maxX) / 2) * view.k
      view.y = height / 2 - ((minY + maxY) / 2) * view.k
    }

    const resize = (): void => {
      const r = host.getBoundingClientRect()
      width = r.width
      height = r.height
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      schedule()
    }

    // Nhãn hiện khi phóng to đủ, hoặc cho nút đang rê chuột, hàng xóm của nó, nút trung tâm và các nút nhiều link
    const bigDegree = [...nodes].map((n) => n.degree).sort((a, b) => b - a)[Math.min(nodes.length - 1, 12)] ?? Infinity

    const draw = (): void => {
      ctx.clearRect(0, 0, width, height)
      const focusSet = hover >= 0 ? adjacent[hover] : null
      ctx.lineWidth = 1
      for (const [i, j] of edges) {
        const a = nodes[i]
        const b = nodes[j]
        const lit = hover >= 0 && (i === hover || j === hover)
        ctx.strokeStyle = lit ? colors.accent : colors.line
        ctx.globalAlpha = hover >= 0 && !lit ? 0.35 : 1
        ctx.lineWidth = lit ? 1.6 : 1
        ctx.beginPath()
        ctx.moveTo(a.x * view.k + view.x, a.y * view.k + view.y)
        ctx.lineTo(b.x * view.k + view.x, b.y * view.k + view.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      nodes.forEach((n, i) => {
        const x = n.x * view.k + view.x
        const y = n.y * view.k + view.y
        if (x < -40 || y < -40 || x > width + 40 || y > height + 40) return
        const near = i === hover || focusSet?.has(i)
        ctx.globalAlpha = hover >= 0 && !near ? 0.3 : 1
        ctx.fillStyle = i === hover || i === centerIndex ? colors.accent : near ? colors.ink2 : colors.ink3
        ctx.beginPath()
        ctx.arc(x, y, radius(n.degree) * Math.max(0.7, Math.min(1.4, view.k)), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      nodes.forEach((n, i) => {
        const near = i === hover || focusSet?.has(i)
        const show = view.k > 1.15 || near || i === centerIndex || (hover < 0 && n.degree >= bigDegree && n.degree > 1)
        if (!show) return
        const x = n.x * view.k + view.x
        const y = n.y * view.k + view.y + radius(n.degree) * Math.max(0.7, Math.min(1.4, view.k)) + 4
        if (x < -100 || y < -20 || x > width + 100 || y > height + 20) return
        const label = n.title.length > 40 ? n.title.slice(0, 39) + '…' : n.title
        ctx.globalAlpha = hover >= 0 && !near ? 0.3 : 1
        // Viền chữ cùng màu nền để nhãn đọc được khi đè lên cạnh
        ctx.lineWidth = 3
        ctx.strokeStyle = colors.bg
        ctx.strokeText(label, x, y)
        ctx.fillStyle = i === hover ? colors.ink : colors.ink2
        ctx.fillText(label, x, y)
      })
      ctx.globalAlpha = 1
    }

    const loop = (): void => {
      frame = 0
      if (alpha > 0.01) {
        tick(graph, alpha)
        alpha *= 0.985
        schedule()
      }
      draw()
    }
    function schedule(): void {
      if (!frame) frame = requestAnimationFrame(loop)
    }

    const toWorld = (sx: number, sy: number): [number, number] => [(sx - view.x) / view.k, (sy - view.y) / view.k]
    const hit = (sx: number, sy: number): number => {
      let best = -1
      let bestD = Infinity
      nodes.forEach((n, i) => {
        const dx = n.x * view.k + view.x - sx
        const dy = n.y * view.k + view.y - sy
        const d = dx * dx + dy * dy
        const r = radius(n.degree) * Math.max(0.7, Math.min(1.4, view.k)) + 5
        if (d < r * r && d < bestD) (best = i), (bestD = d)
      })
      return best
    }

    let drag: { kind: 'node'; index: number; moved: boolean } | { kind: 'pan'; x: number; y: number; vx: number; vy: number } | null = null
    const local = (e: MouseEvent): [number, number] => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const onDown = (e: MouseEvent): void => {
      if (e.button !== 0) return
      const [sx, sy] = local(e)
      const i = hit(sx, sy)
      if (i >= 0) {
        drag = { kind: 'node', index: i, moved: false }
        nodes[i].fixed = true
      } else drag = { kind: 'pan', x: sx, y: sy, vx: view.x, vy: view.y }
    }
    const onMove = (e: MouseEvent): void => {
      const [sx, sy] = local(e)
      if (drag?.kind === 'node') {
        const [wx, wy] = toWorld(sx, sy)
        const n = nodes[drag.index]
        if (Math.abs(n.x - wx) + Math.abs(n.y - wy) > 2 / view.k) drag.moved = true
        n.x = wx
        n.y = wy
        alpha = Math.max(alpha, 0.25)
        schedule()
        return
      }
      if (drag?.kind === 'pan') {
        view.x = drag.vx + sx - drag.x
        view.y = drag.vy + sy - drag.y
        schedule()
        return
      }
      const i = hit(sx, sy)
      if (i !== hover) {
        hover = i
        canvas.style.cursor = i >= 0 ? 'pointer' : 'grab'
        canvas.title = i >= 0 ? `${nodes[i].title} — click to open` : ''
        schedule()
      }
    }
    const onUp = (): void => {
      if (drag?.kind === 'node') {
        const n = nodes[drag.index]
        n.fixed = false
        if (!drag.moved) {
          // Bấm (không kéo) vào một nút: mở ghi chú đó
          useStore.getState().openNote(n.id)
          closeGraph()
        }
      }
      drag = null
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const [sx, sy] = local(e)
      const k = Math.min(6, Math.max(0.1, view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
      view.x = sx - ((sx - view.x) * k) / view.k
      view.y = sy - ((sy - view.y) * k) / view.k
      view.k = k
      schedule()
    }
    const onLeave = (): void => {
      if (hover >= 0) (hover = -1), schedule()
    }
    const onTheme = (): void => {
      colors = themeColors()
      schedule()
    }
    const recenter = (): void => {
      fit()
      schedule()
    }

    // Cho kiểm thử tự động biết vị trí các nút (canvas không có phần tử để bấm)
    ;(canvas as HTMLCanvasElement & { nibmarkGraph?: unknown }).nibmarkGraph = { nodes, view }
    const observer = new ResizeObserver(() => {
      resize()
    })
    observer.observe(host)
    resize()
    fit()
    schedule()
    canvas.style.cursor = 'grab'
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mouseleave', onLeave)
    window.addEventListener('nibmark-theme', onTheme)
    host.addEventListener('nibmark-graph-fit', recenter)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('nibmark-theme', onTheme)
      host.removeEventListener('nibmark-graph-fit', recenter)
    }
  }, [graph, center])

  const setMode = (m: GraphMode): void => useGraph.setState({ mode: m, focus: m === 'local' ? center : null })
  const linkCount = graph.edges.length

  return (
    <div className="modal-backdrop" onMouseDown={closeGraph}>
      <div className="modal graph-modal" role="dialog" aria-label="Graph" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header graph-head">
          <h2>Graph</h2>
          <div className="segmented graph-mode" role="group" aria-label="Graph scope">
            <button className={cx(mode === 'all' && 'on')} onClick={() => setMode('all')}>
              All notes
            </button>
            <button className={cx(mode === 'local' && 'on')} disabled={!center} onClick={() => setMode('local')}>
              This note
            </button>
          </div>
          {mode === 'all' && (
            <label className="graph-orphans">
              <input type="checkbox" checked={orphans} onChange={(e) => setOrphans(e.target.checked)} />
              Notes without links
            </label>
          )}
          <span className="graph-meta">
            {graph.nodes.length} {graph.nodes.length === 1 ? 'note' : 'notes'} · {linkCount} {linkCount === 1 ? 'link' : 'links'}
          </span>
          <span className="flex-1" />
          <button className="icon-btn" title="Fit to view" onClick={() => hostRef.current?.dispatchEvent(new Event('nibmark-graph-fit'))}>
            <Crosshair size={16} />
          </button>
          <button className="icon-btn" title="Close (Esc)" onClick={closeGraph}>
            <X size={16} />
          </button>
        </header>
        <div className="graph-host" ref={hostRef}>
          <canvas ref={canvasRef} />
          {graph.nodes.length === 0 && <p className="graph-empty">No links yet. Type [[ in a note to link it to another note.</p>}
          {graph.nodes.length > 0 && <p className="graph-hint">Click a note to open it · drag to move · scroll to zoom</p>}
        </div>
      </div>
    </div>
  )
}
