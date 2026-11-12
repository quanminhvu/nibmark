import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { renderMermaidIn } from '@/lib/mermaid'
import { fillGithubEmbeds, renderMarkdown } from '@/lib/markdown'
import { fileIdFromUrl, openAttachment, resolveFileUrls, useFileTick } from '@/lib/attachments'
import { followNoteLink } from '@/lib/noteLinks'
import { previewLinkOut, previewLinkOver } from '@/lib/noteHover'
import { PreviewFind } from './PreviewFind'

interface Props {
  source: string
  /** Bỏ trống thì các checkbox chỉ để xem. */
  onToggleTask?: (index: number) => void
  /** Bật ⌘F để tìm trong preview (chỉ preview chính của ghi chú) */
  findable?: boolean
}

export function Preview({ source, onToggleTask, findable }: Props): React.JSX.Element {
  const rendered = useMemo(() => renderMarkdown(source), [source])
  const fileTick = useFileTick((s) => s.tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => resolveFileUrls(rendered), [rendered, fileTick])
  const rootRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const [viewer, setViewer] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)

  // ⌘F khi con trỏ không ở trong editor: tìm trong preview (trong editor, CodeMirror tự lo)
  useEffect(() => {
    if (!findable) return
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return
      if ((document.activeElement as HTMLElement | null)?.closest?.('.cm-editor')) return
      if (!rootRef.current?.isConnected) return
      e.preventDefault()
      setFinding(true)
      // Đã mở thì chọn lại chữ trong ô tìm
      document.querySelector<HTMLInputElement>('.preview-find input')?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findable])

  // Sau mỗi lần HTML đổi: gắn lại sơ đồ Mermaid (từ cache, hoặc vẽ mới)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const gen = ++generation.current
    renderMermaidIn(root, () => generation.current === gen)
    fillGithubEmbeds(root)
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
      const { index, line } = (e as CustomEvent<{ index: number; line: number }>).detail
      const root = rootRef.current
      if (!root?.isConnected) return
      // Tìm heading theo dòng nguồn; không có thì theo thứ tự heading
      const target = root.querySelector(`:is(h1, h2, h3, h4, h5, h6)[data-source-line="${line}"]`) ?? root.querySelectorAll('h1, h2, h3, h4, h5, h6')[index]
      target?.scrollIntoView({ block: 'start' })
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
      const fileId = fileIdFromUrl(href)
      if (fileId) {
        void openAttachment(fileId)
        return
      }
      if (/^(https?:|mailto:)/i.test(href)) window.open(href)
      else if (href.startsWith('#')) {
        event.currentTarget.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'start' })
      }
      return
    }

    if (target instanceof HTMLImageElement && target.src) {
      setViewer(`<img src="${target.src.replace(/"/g, '&quot;')}" alt="" />`)
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
      {finding && <PreviewFind root={rootRef} html={html} onClose={() => setFinding(false)} />}
      <div ref={rootRef} className="preview markdown-body" onClick={handleClick} onMouseOver={previewLinkOver} onMouseOut={previewLinkOut} dangerouslySetInnerHTML={{ __html: html }} />
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
