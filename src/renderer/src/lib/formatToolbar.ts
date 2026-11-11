import { completionStatus } from '@codemirror/autocomplete'
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { StateCommand, Extension } from '@codemirror/state'
import { EditorView, showTooltip, ViewPlugin } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'

// Thanh công cụ nổi hiện ra khi bôi đen chữ (không hiện khi đang kéo chuột,
// khi ghi chú chỉ đọc, hoặc khi đang có danh sách gợi ý).

/** Bọc/bỏ bọc vùng chọn bằng một cặp ký hiệu, ví dụ ** cho chữ đậm. */
export function toggleWrap(open: string, close = open): StateCommand {
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - open.length, range.from)
      const after = state.sliceDoc(range.to, range.to + close.length)
      if (before === open && after === close) {
        return {
          changes: [
            { from: range.from - open.length, to: range.from },
            { from: range.to, to: range.to + close.length }
          ],
          range: EditorSelection.range(range.from - open.length, range.to - open.length)
        }
      }
      return {
        changes: [
          { from: range.from, insert: open },
          { from: range.to, insert: close }
        ],
        range: EditorSelection.range(range.from + open.length, range.to + open.length)
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

/** Thêm hoặc bỏ tiền tố ở đầu mọi dòng trong vùng chọn (ví dụ "- " hay "> "). */
export function toggleLinePrefix(prefix: string, strip: RegExp): StateCommand {
  return ({ state, dispatch }) => {
    const { from, to } = state.selection.main
    const first = state.doc.lineAt(from).number
    const last = state.doc.lineAt(to).number
    const lines = []
    for (let n = first; n <= last; n++) lines.push(state.doc.line(n))
    const allHave = lines.every((l) => l.text.startsWith(prefix) || !l.text.trim())
    const changes = lines
      .filter((l) => l.text.trim())
      .map((l) => {
        const m = strip.exec(l.text)
        if (allHave) return { from: l.from, to: l.from + prefix.length, insert: '' }
        // Đổi kiểu (ví dụ "- " sang "> ") thì bỏ tiền tố cũ trước
        return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: prefix }
      })
    dispatch(state.update({ changes, userEvent: 'input' }))
    return true
  }
}

function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  const insert = `[${text}](url)`
  view.dispatch({
    changes: { from, to, insert },
    // chọn sẵn chữ "url" để gõ đè
    selection: EditorSelection.range(from + text.length + 3, from + text.length + 6),
    userEvent: 'input'
  })
  return true
}

/** Biến các dòng đang chọn thành một khối alert: `> [!NOTE]` rồi từng dòng có `> `. */
export function insertAlert(kind = 'NOTE'): (view: EditorView) => boolean {
  return (view) => {
    const { state } = view
    const { from, to } = state.selection.main
    const first = state.doc.lineAt(from)
    const last = state.doc.lineAt(to)
    const body = state
      .sliceDoc(first.from, last.to)
      .split('\n')
      .map((l) => (l.trim() ? `> ${l.replace(/^\s*>\s?/, '')}` : '>'))
      .join('\n')
    const insert = `> [!${kind}]\n${body}`
    view.dispatch({
      changes: { from: first.from, to: last.to, insert },
      // Chọn sẵn chữ NOTE để gõ đè thành TIP, WARNING…
      selection: EditorSelection.range(first.from + 4, first.from + 4 + kind.length),
      userEvent: 'input'
    })
    return true
  }
}

const LIST_PREFIX = /^\s*(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> |#{1,6} )/

interface ToolbarButton {
  label: string
  title: string
  className?: string
  run: (view: EditorView) => boolean
}

const BUTTONS: ToolbarButton[] = [
  { label: 'B', title: 'Bold (⌘B)', className: 'tb-bold', run: (v) => toggleWrap('**')(v) },
  { label: 'I', title: 'Italic (⌘I)', className: 'tb-italic', run: (v) => toggleWrap('*')(v) },
  { label: 'S', title: 'Strikethrough', className: 'tb-strike', run: (v) => toggleWrap('~~')(v) },
  { label: '</>', title: 'Inline code', className: 'tb-code', run: (v) => toggleWrap('`')(v) },
  { label: 'Mark', title: 'Highlight', className: 'tb-mark', run: (v) => toggleWrap('<mark>', '</mark>')(v) },
  { label: 'Link', title: 'Link', run: insertLink },
  { label: 'H', title: 'Heading', className: 'tb-sep', run: (v) => toggleLinePrefix('## ', LIST_PREFIX)(v) },
  { label: '•', title: 'Bulleted list', run: (v) => toggleLinePrefix('- ', LIST_PREFIX)(v) },
  { label: '☐', title: 'Task list', run: (v) => toggleLinePrefix('- [ ] ', LIST_PREFIX)(v) },
  { label: '❝', title: 'Quote', run: (v) => toggleLinePrefix('> ', LIST_PREFIX)(v) },
  { label: '!', title: 'Alert (note, tip, warning…)', className: 'tb-alert', run: insertAlert() }
]

const setPointerDown = StateEffect.define<boolean>()

const pointerDown = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPointerDown)) return e.value
    return value
  }
})

function computeToolbar(state: EditorState): Tooltip | null {
  if (state.readOnly || state.field(pointerDown)) return null
  if (state.selection.ranges.length > 1) return null
  const sel = state.selection.main
  if (sel.empty || completionStatus(state)) return null
  return {
    pos: sel.from,
    end: sel.to,
    above: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement('div')
      dom.className = 'cm-format-toolbar'
      for (const button of BUTTONS) {
        const el = document.createElement('button')
        el.type = 'button'
        el.textContent = button.label
        el.title = button.title
        if (button.className) el.className = button.className
        // mousedown + preventDefault để vùng chọn trong editor không bị mất
        el.addEventListener('mousedown', (e) => {
          e.preventDefault()
          button.run(view)
          view.focus()
        })
        dom.appendChild(el)
      }
      return { dom }
    }
  }
}

const toolbarField = StateField.define<Tooltip | null>({
  create: computeToolbar,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection && !tr.effects.some((e) => e.is(setPointerDown)) && tr.startState.readOnly === tr.state.readOnly) {
      return value
    }
    return computeToolbar(tr.state)
  },
  provide: (f) => showTooltip.from(f)
})

// Theo dõi chuột: ẩn thanh công cụ khi đang kéo chọn, hiện lại khi nhả chuột
const pointerTracker = ViewPlugin.fromClass(
  class {
    private onUp = (): void => {
      if (this.view.state.field(pointerDown)) this.view.dispatch({ effects: setPointerDown.of(false) })
    }
    constructor(private view: EditorView) {
      document.addEventListener('mouseup', this.onUp)
    }
    destroy(): void {
      document.removeEventListener('mouseup', this.onUp)
    }
  },
  {
    eventHandlers: {
      mousedown(event, view) {
        if (event.button === 0) view.dispatch({ effects: setPointerDown.of(true) })
      }
    }
  }
)

export function formatToolbar(): Extension {
  return [pointerDown, toolbarField, pointerTracker]
}
