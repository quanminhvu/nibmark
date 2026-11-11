import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

/**
 * Tìm chữ trong preview (⌘F khi con trỏ không ở trong editor). Kết quả được tô
 * bằng CSS Custom Highlight API nên không đụng tới DOM của preview.
 */
export function PreviewFind({
  root,
  html,
  onClose
}: {
  root: React.RefObject<HTMLDivElement | null>
  /** Đổi khi nội dung preview đổi, để tìm lại */
  html: string
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [ranges, setRanges] = useState<Range[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
    return () => {
      CSS.highlights?.delete('preview-find')
      CSS.highlights?.delete('preview-find-active')
    }
  }, [])

  // Tìm mọi vị trí khớp (không phân biệt hoa thường), kể cả trong khối code
  useEffect(() => {
    const el = root.current
    const q = query.toLocaleLowerCase()
    if (!el || !q) {
      setRanges([])
      return
    }
    const found: Range[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => ((n.parentElement?.closest('.code-gutter, .code-copy, .mermaid-src, .katex-mathml') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT))
    })
    for (let node = walker.nextNode(); node && found.length < 2000; node = walker.nextNode()) {
      const text = (node.nodeValue ?? '').toLocaleLowerCase()
      for (let i = text.indexOf(q); i >= 0 && found.length < 2000; i = text.indexOf(q, i + q.length)) {
        const r = document.createRange()
        r.setStart(node, i)
        r.setEnd(node, i + q.length)
        found.push(r)
      }
    }
    setRanges(found)
    setActive((a) => (a < found.length ? a : 0))
  }, [query, html, root])

  useEffect(() => {
    if (!CSS.highlights) return
    CSS.highlights.set('preview-find', new Highlight(...ranges))
    const current = ranges[active]
    if (current) {
      CSS.highlights.set('preview-find-active', new Highlight(current))
      current.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    } else CSS.highlights.delete('preview-find-active')
  }, [ranges, active])

  const step = (d: number): void => {
    if (ranges.length) setActive((a) => (a + d + ranges.length) % ranges.length)
  }

  return (
    <div className="preview-find-anchor">
      <div className="preview-find" role="search">
        <input
          ref={input}
          value={query}
          placeholder="Find in preview"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        />
        <span className="preview-find-count">{query ? (ranges.length ? `${active + 1}/${ranges.length}` : 'No results') : ''}</span>
        <button className="icon-btn small" title="Previous (⇧↵)" onClick={() => step(-1)}>
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn small" title="Next (↵)" onClick={() => step(1)}>
          <ChevronDown size={14} />
        </button>
        <button className="icon-btn small" title="Close (Esc)" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
