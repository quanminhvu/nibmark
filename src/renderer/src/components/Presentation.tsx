import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react'
import { resolveFileUrls, useFileTick } from '@/lib/attachments'
import { renderMarkdown } from '@/lib/markdown'
import { renderMermaidIn } from '@/lib/mermaid'
import { splitSlides, stopPresentation, usePresentation } from '@/lib/slides'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

/** Trình chiếu ghi chú: mỗi đoạn ngăn bằng `---` là một slide */
export function Presentation(): React.JSX.Element | null {
  const noteId = usePresentation((s) => s.noteId)
  const note = useStore((s) => (noteId ? s.notes[noteId] : undefined))
  if (!noteId || !note) return null
  return <Deck key={noteId} body={note.body} title={note.title} />
}

function Deck({ body, title }: { body: string; title: string }): React.JSX.Element {
  const slides = useMemo(() => {
    const parts = splitSlides(body)
    return parts.length ? parts : [`# ${title || 'Untitled'}`]
  }, [body, title])
  const [index, setIndex] = useState(() => Math.min(usePresentation.getState().start, slides.length - 1))
  const [idle, setIdle] = useState(false)
  const [scale, setScale] = useState(1)
  const root = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const startedFullscreen = useRef(false)
  const fileTick = useFileTick((s) => s.tick)

  const current = Math.min(index, slides.length - 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => resolveFileUrls(renderMarkdown(slides[current])), [slides, current, fileTick])
  const go = useCallback((step: number) => setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + step))), [slides.length])

  // Vào toàn màn hình khi bắt đầu; thoát toàn màn hình (Esc) thì kết thúc trình chiếu
  useEffect(() => {
    const el = root.current
    el?.focus()
    if (el && !document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => (startedFullscreen.current = true))
        .catch(() => {})
    }
    const onChange = (): void => {
      if (!document.fullscreenElement && startedFullscreen.current) stopPresentation()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'l', 'j']
      const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'h', 'k']
      let handled = true
      if (next.includes(e.key)) go(e.shiftKey && e.key === ' ' ? -1 : 1)
      else if (prev.includes(e.key)) go(-1)
      else if (e.key === 'Home') setIndex(0)
      else if (e.key === 'End') setIndex(slides.length - 1)
      else if (e.key === 'Escape') stopPresentation()
      else if (e.key === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void root.current?.requestFullscreen?.().then(() => (startedFullscreen.current = true))
      } else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, slides.length])

  // Ẩn thanh điều khiển khi không động chuột
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 2000)
    const wake = (): void => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 2000)
    }
    window.addEventListener('mousemove', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
    }
  }, [])

  // Nội dung dài hơn khung slide thì thu nhỏ cho vừa (không bao giờ phóng to)
  useLayoutEffect(() => {
    const box = frame.current
    const inner = content.current
    if (!box || !inner) return
    renderMermaidIn(inner, () => true)
    const fit = (): void => {
      inner.style.transform = 'none'
      const k = Math.min(1, box.clientHeight / Math.max(1, inner.scrollHeight), box.clientWidth / Math.max(1, inner.scrollWidth))
      setScale(k)
      inner.style.transform = k < 1 ? `scale(${k})` : 'none'
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [html])

  return (
    <div
      ref={root}
      className={cx('present', idle && 'idle')}
      tabIndex={-1}
      role="dialog"
      aria-label={`Presenting ${title || 'Untitled'}`}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('.present-bar, button')) return
        const link = target.closest('a')
        if (link) {
          e.preventDefault()
          const href = link.getAttribute('href') ?? ''
          if (/^(https?:|mailto:)/i.test(href)) window.open(href)
          return
        }
        // Bấm nửa trái: lùi lại, còn lại: tiếp theo
        go(e.clientX < window.innerWidth / 3 ? -1 : 1)
      }}
    >
      <div className="present-frame" ref={frame}>
        <div
          ref={content}
          className={cx('present-slide', 'markdown-body', scale < 1 && 'scaled', isTitleSlide(slides[current]) && 'title-slide')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <div className="present-progress" style={{ width: `${((current + 1) / slides.length) * 100}%` }} />
      <div className="present-bar">
        <button className="icon-btn" title="Previous (←)" disabled={current === 0} onClick={() => go(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="present-count">
          {current + 1} / {slides.length}
        </span>
        <button className="icon-btn" title="Next (→)" disabled={current === slides.length - 1} onClick={() => go(1)}>
          <ChevronRight size={18} />
        </button>
        <span className="present-sep" />
        <button
          className="icon-btn"
          title="Full screen (F)"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            else void root.current?.requestFullscreen?.().then(() => (startedFullscreen.current = true))
          }}
        >
          <Maximize size={16} />
        </button>
        <button className="icon-btn" title="End presentation (Esc)" onClick={stopPresentation}>
          <X size={17} />
        </button>
      </div>
    </div>
  )
}

/** Slide chỉ có heading (và có thể một dòng phụ): canh giữa như trang bìa */
function isTitleSlide(source: string): boolean {
  const lines = source.split('\n').filter((l) => l.trim())
  return lines.length > 0 && lines.length <= 3 && /^#{1,2}\s/.test(lines[0]) && lines.slice(1).every((l) => !/^\s*([-*+]|\d+\.|```|>|\|)/.test(l))
}
