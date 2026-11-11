import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { renderMermaidIn } from '@/lib/mermaid'
import { renderMarkdown } from '@/lib/markdown'
import { followNoteLink } from '@/lib/noteLinks'

interface Props {
  source: string
  /** Bỏ trống thì các checkbox chỉ để xem. */
  onToggleTask?: (index: number) => void
}

export function Preview({ source, onToggleTask }: Props): React.JSX.Element {
  const html = useMemo(() => renderMarkdown(source), [source])
  const rootRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const [viewer, setViewer] = useState<string | null>(null)

  // Sau mỗi lần HTML đổi: gắn lại sơ đồ Mermaid (từ cache, hoặc vẽ mới)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const gen = ++generation.current
    renderMermaidIn(root, () => generation.current === gen)
  }, [html])

  // Đổi theme: vẽ lại sơ đồ với màu mới
  useEffect(() => {
    const onTheme = (): void => {
      const root = rootRef.current
      if (!root) return
      root.querySelectorAll('.mermaid-block').forEach((b) => b.classList.remove('rendered', 'failed'))
      const gen = ++generation.current
      renderMermaidIn(root, () => generation.current === gen)
    }
    window.addEventListener('nibmark-theme', onTheme)
    return () => window.removeEventListener('nibmark-theme', onTheme)
  }, [])

  useEffect(() => {
    const onGoto = (e: Event): void => {
      const { index } = (e as CustomEvent<{ index: number }>).detail
      rootRef.current?.querySelectorAll('h1, h2, h3, h4, h5, h6')[index]?.scrollIntoView({ block: 'start' })
    }
    window.addEventListener('nibmark-goto', onGoto)
    return () => window.removeEventListener('nibmark-goto', onGoto)
  }, [])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement

    const link = target.closest('a')
    if (link) {
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (followNoteLink(href)) return
      if (/^(https?:|mailto:)/i.test(href)) window.open(href)
      else if (href.startsWith('#')) {
        event.currentTarget.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'start' })
      }
      return
    }

    const diagram = target.closest('.mermaid-block.rendered .mermaid-out')
    if (diagram) {
      setViewer(diagram.innerHTML)
      return
    }

    if (target instanceof HTMLButtonElement && target.classList.contains('code-copy')) {
      const code = target.parentElement?.querySelector('code')?.textContent ?? ''
      void navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => {
        target.textContent = 'Copied'
        setTimeout(() => (target.textContent = 'Copy'), 1200)
      })
      return
    }

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      event.preventDefault()
      if (!onToggleTask) return
      const boxes = [...event.currentTarget.querySelectorAll('input.task-list-item-checkbox')]
      const index = boxes.indexOf(target)
      if (index >= 0) onToggleTask(index)
    }
  }

  if (!source.trim()) {
    return <div className="preview preview-empty">Nothing to preview yet.</div>
  }

  return (
    <>
      <div ref={rootRef} className="preview markdown-body" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
      {viewer && <DiagramViewer svg={viewer} onClose={() => setViewer(null)} />}
    </>
  )
}

/** Xem sơ đồ toàn màn hình: cuộn chuột để phóng to/thu nhỏ, kéo để di chuyển. */
function DiagramViewer({ svg, onClose }: { svg: string; onClose: () => void }): React.JSX.Element {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="diagram-viewer"
      onWheel={(e) => setZoom((z) => Math.min(6, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9))))}
      onMouseDown={(e) => (drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y })}
      onMouseMove={(e) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
    >
      <div
        className="diagram-canvas"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="diagram-tools" onMouseDown={(e) => e.stopPropagation()}>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="text-btn" onClick={() => (setZoom(1), setPan({ x: 0, y: 0 }))}>
          Reset
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
