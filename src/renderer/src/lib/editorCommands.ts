import { copyLineDown, selectLine } from '@codemirror/commands'
import { selectSelectionMatches } from '@codemirror/search'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// Lệnh soạn thảo bổ sung (những lệnh CodeMirror chưa có sẵn), dùng từ command palette.
// Palette cần biết editor đang mở: MarkdownEditor đăng ký view của nó ở đây.

let active: EditorView | null = null

export function setActiveEditor(view: EditorView | null, owner?: EditorView): void {
  // Chỉ xóa khi đúng editor đang đăng ký bị hủy (editor được tạo lại mỗi lần đổi ghi chú)
  if (view === null && owner && active !== owner) return
  active = view
}

export const getActiveEditor = (): EditorView | null => (active?.dom.isConnected ? active : null)

type Command = (view: EditorView) => boolean

/** Áp dụng một phép biến đổi lên các dòng được chọn, trong một lần hoàn tác */
function mapSelectedLines(view: EditorView, transform: (lines: string[]) => string[]): boolean {
  const { state } = view
  const changes = []
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from)
    // Vùng chọn kết thúc ở đầu dòng thì không tính dòng đó
    const lastPos = range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to
    const last = state.doc.lineAt(lastPos)
    const lines = state.sliceDoc(first.from, last.to).split('\n')
    const next = transform(lines).join('\n')
    if (next !== lines.join('\n')) changes.push({ from: first.from, to: last.to, insert: next })
  }
  if (!changes.length) return false
  view.dispatch({ changes, userEvent: 'input', scrollIntoView: true })
  return true
}

/** Áp dụng phép biến đổi lên chữ được chọn (hoặc từ ở con trỏ nếu chưa chọn gì) */
function mapSelectedText(view: EditorView, transform: (text: string) => string): boolean {
  const { state } = view
  const tr = state.changeByRange((range) => {
    let { from, to } = range
    if (range.empty) {
      const word = state.wordAt(range.head)
      if (!word) return { range }
      ;({ from, to } = word)
    }
    const insert = transform(state.sliceDoc(from, to))
    return { changes: { from, to, insert }, range: EditorSelection.range(from, from + insert.length) }
  })
  view.dispatch(state.update(tr, { userEvent: 'input', scrollIntoView: true }))
  return true
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const sortLines: Command = (v) => mapSelectedLines(v, (lines) => (lines.length < 2 ? lines : [...lines].sort(collator.compare)))
export const sortLinesDesc: Command = (v) =>
  mapSelectedLines(v, (lines) => (lines.length < 2 ? lines : [...lines].sort((a, b) => collator.compare(b, a))))
export const uniqueLines: Command = (v) => mapSelectedLines(v, (lines) => [...new Set(lines)])
export const reverseLines: Command = (v) => mapSelectedLines(v, (lines) => [...lines].reverse())

/** Nối các dòng được chọn (hoặc dòng hiện tại với dòng sau) thành một dòng */
export const joinLines: Command = (view) => {
  const { state } = view
  const changes = []
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from)
    let last = state.doc.lineAt(range.to)
    if (first.number === last.number) {
      if (last.number === state.doc.lines) continue
      last = state.doc.line(last.number + 1)
    }
    for (let n = first.number; n < last.number; n++) {
      const line = state.doc.line(n)
      const next = state.doc.line(n + 1)
      // Bỏ dấu "- ", "> "… ở đầu dòng sau khi nối
      const lead = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)?/.exec(next.text)![0].length
      changes.push({ from: line.to, to: next.from + lead, insert: line.text.trim() && next.text.trim() ? ' ' : '' })
    }
  }
  if (!changes.length) return false
  view.dispatch({ changes, userEvent: 'input' })
  return true
}

export const upperCase: Command = (v) => mapSelectedText(v, (t) => t.toLocaleUpperCase())
export const lowerCase: Command = (v) => mapSelectedText(v, (t) => t.toLocaleLowerCase())
export const titleCase: Command = (v) =>
  mapSelectedText(v, (t) => t.toLocaleLowerCase().replace(/(^|[\s\-_/([{"'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase()))

export const duplicateLine: Command = (v) => copyLineDown(v)
export const selectAllOccurrences: Command = (v) => selectSelectionMatches(v)
export const selectCurrentLine: Command = (v) => selectLine(v)

/** Chạy lệnh trên editor đang mở rồi trả con trỏ về editor */
export function runEditorCommand(command: Command): boolean {
  const view = getActiveEditor()
  if (!view) return false
  const ok = command(view)
  view.focus()
  return ok
}
