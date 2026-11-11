import { StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { EditorView, showTooltip } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'

// Kích thước ảnh ghi ngay trong chữ thay thế, giống Obsidian:
//   ![ảnh](url)          tự động
//   ![ảnh|small](url)    nhỏ · |half nửa · |full đầy
//   ![ảnh|320](url)      rộng 320px (|320x200 cũng được, chỉ lấy chiều rộng)

export type ImageSize = 'small' | 'half' | 'full' | number | null

const SIZE = /\|(small|half|full|\d{1,4}(?:x\d{1,4})?)$/

/** Tách chữ thay thế và kích thước. */
export function parseImageAlt(alt: string): { alt: string; size: ImageSize } {
  const m = SIZE.exec(alt)
  if (!m) return { alt, size: null }
  const v = m[1]
  const size: ImageSize = v === 'small' || v === 'half' || v === 'full' ? v : Number(v.split('x')[0])
  return { alt: alt.slice(0, m.index).trim(), size }
}

const IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function imageAt(state: EditorState, pos: number): { from: number; altFrom: number; altTo: number; alt: string } | null {
  const line = state.doc.lineAt(pos)
  for (const m of line.text.matchAll(IMAGE)) {
    const from = line.from + m.index
    const to = from + m[0].length
    if (pos >= from && pos <= to) return { from, altFrom: from + 2, altTo: from + 2 + m[1].length, alt: m[1] }
  }
  return null
}

function setSize(view: EditorView, size: ImageSize): void {
  const img = imageAt(view.state, view.state.selection.main.head)
  if (!img) return
  const base = parseImageAlt(img.alt).alt
  const alt = size === null ? base : `${base}|${size}`
  view.dispatch({ changes: { from: img.altFrom, to: img.altTo, insert: alt }, userEvent: 'input' })
}

const BUTTONS: { label: string; title: string; size: ImageSize }[] = [
  { label: 'Auto', title: 'Natural size (up to the page width)', size: null },
  { label: 'Small', title: 'Small (|small)', size: 'small' },
  { label: 'Half', title: 'Half the page width (|half)', size: 'half' },
  { label: 'Full', title: 'Full page width (|full)', size: 'full' }
]

function compute(state: EditorState): Tooltip | null {
  if (state.readOnly || state.selection.ranges.length > 1 || !state.selection.main.empty) return null
  const img = imageAt(state, state.selection.main.head)
  if (!img) return null
  const current = parseImageAlt(img.alt).size
  return {
    pos: img.from,
    above: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement('div')
      dom.className = 'cm-table-toolbar cm-image-toolbar'
      const label = document.createElement('span')
      label.className = 'tb-label'
      label.textContent = 'Image size'
      dom.appendChild(label)
      for (const b of BUTTONS) {
        const el = document.createElement('button')
        el.type = 'button'
        el.textContent = b.label
        el.title = b.title
        if (b.size === current) el.className = 'active'
        el.addEventListener('mousedown', (e) => {
          e.preventDefault()
          setSize(view, b.size)
        })
        dom.appendChild(el)
      }
      if (typeof current === 'number') {
        const px = document.createElement('span')
        px.className = 'tb-label'
        px.textContent = `${current}px`
        dom.appendChild(px)
      }
      return { dom }
    }
  }
}

const field = StateField.define<Tooltip | null>({
  create: compute,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection && tr.startState.readOnly === tr.state.readOnly) return value
    return compute(tr.state)
  },
  provide: (f) => showTooltip.from(f)
})

export function imageToolbar(): Extension {
  return [field]
}
