import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { X } from 'lucide-react'
import { gotoHeading, headingsOf, plainHeading, toggleOutline } from '@/lib/outline'
import { cx } from '@/lib/util'

/** Khoảng cách từ mép trên vùng cuộn: heading đã qua mốc này thì coi là đang đọc */
const READ_LINE = 32

/**
 * Mục lục bên phải ghi chú: liệt kê heading, bấm để nhảy tới,
 * tô đậm heading đang đọc theo vị trí cuộn của editor hoặc preview.
 */
export function Outline({ body, scope, preferPreview }: { body: string; scope: React.RefObject<HTMLElement | null>; preferPreview: boolean }): React.JSX.Element {
  const headings = useMemo(() => headingsOf(body), [body])
  const minLevel = headings.reduce((m, h) => Math.min(m, h.level), 6)
  const [active, setActive] = useState(-1)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scope.current
    if (!root) return
    let frame = 0
    const measure = (): void => {
      frame = 0
      const line = readingLine(root, preferPreview)
      let index = -1
      for (let i = 0; i < headings.length && headings[i].line <= line; i++) index = i
      setActive(index)
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    schedule()
    // Sự kiện cuộn không nổi bọt: bắt ở pha capture cho cả editor lẫn preview
    root.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      root.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scope, headings, preferPreview])

  useEffect(() => {
    list.current?.querySelector('.outline-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <aside className="outline" aria-label="Outline">
      <header className="outline-head">
        <span>Outline</span>
        <button className="icon-btn small" title="Hide outline (Cmd/Ctrl+Shift+O)" aria-label="Hide outline" onClick={toggleOutline}>
          <X size={13} />
        </button>
      </header>
      <div className="outline-list" ref={list}>
        {headings.length === 0 && <p className="outline-empty">No headings yet. Start a line with # to add one.</p>}
        {headings.map((h, i) => (
          <button
            key={`${h.line}:${h.text}`}
            className={cx('outline-item', `level-${h.level}`, i === active && 'active')}
            style={{ paddingLeft: 10 + (h.level - minLevel) * 12 }}
            title={plainHeading(h.text)}
            onClick={() => {
              setActive(i)
              gotoHeading(h.line, i, false)
            }}
          >
            {plainHeading(h.text) || 'Untitled'}
          </button>
        ))}
      </div>
    </aside>
  )
}

/** Dòng nguồn đang ở đầu vùng đọc: theo preview nếu đang xem preview, không thì theo editor */
function readingLine(root: HTMLElement, preferPreview: boolean): number {
  const preview = root.querySelector<HTMLElement>('.note-preview')
  const scroller = root.querySelector<HTMLElement>('.cm-scroller')
  if (preview && (preferPreview || !scroller)) {
    const top = preview.getBoundingClientRect().top + READ_LINE
    // Đã cuộn tới cuối thì coi như đang đọc heading cuối cùng
    if (preview.scrollTop > 0 && preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 2) return Infinity
    let line = -1
    for (const el of preview.querySelectorAll<HTMLElement>(':is(h1, h2, h3, h4, h5, h6)[data-source-line]')) {
      if (el.getBoundingClientRect().top > top) break
      line = Number(el.dataset.sourceLine)
    }
    return line
  }
  if (scroller) {
    const view = EditorView.findFromDOM(scroller)
    if (!view) return -1
    if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) return Infinity
    const block = view.lineBlockAtHeight(scroller.getBoundingClientRect().top + READ_LINE - view.documentTop)
    return view.state.doc.lineAt(block.from).number - 1
  }
  return -1
}
