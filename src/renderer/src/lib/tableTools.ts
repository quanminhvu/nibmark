import { syntaxTree } from '@codemirror/language'
import { EditorSelection, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { EditorView, showTooltip } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'

// Chỉnh bảng Markdown: thêm/xóa/di chuyển hàng và cột, căn lề cột, căn thẳng các cột.
// Bảng được tìm bằng cây cú pháp (node "Table") nên bảng nằm trong khối code bị bỏ qua.

type Align = 'left' | 'center' | 'right' | null

interface Table {
  from: number
  to: number
  header: string[]
  aligns: Align[]
  body: string[][]
}

interface Cursor {
  /** -1 = hàng tiêu đề, 0.. = hàng dữ liệu; hàng phân cách tính như tiêu đề */
  row: number
  col: number
}

// ── Đọc bảng ──

/**
 * Tách một dòng thành các ô. Theo chuẩn GFM, dấu | luôn tách ô (kể cả trong `code`),
 * chỉ \| là không tách, nên kết quả khớp với cách preview hiển thị bảng.
 */
export function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      cell += ch + text[++i]
      continue
    }
    if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += ch
  }
  cells.push(cell.trim())
  return cells
}

function parseAlign(cell: string): Align {
  const c = cell.replace(/\s/g, '')
  if (/^:-+:$/.test(c)) return 'center'
  if (/^-+:$/.test(c)) return 'right'
  if (/^:-+$/.test(c)) return 'left'
  return null
}

function findTable(state: EditorState, pos: number): Table | null {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name !== 'Table') continue
    const from = state.doc.lineAt(node.from).from
    const to = state.doc.lineAt(node.to).to
    const lines = state.sliceDoc(from, to).split('\n')
    if (lines.length < 2) return null
    const header = splitRow(lines[0])
    const aligns = splitRow(lines[1]).map(parseAlign)
    const body = lines.slice(2).map(splitRow)
    return { from, to, header, aligns, body }
  }
  return null
}

function cursorIn(state: EditorState, table: Table, pos: number): Cursor {
  const line = state.doc.lineAt(pos)
  const first = state.doc.lineAt(table.from).number
  const index = line.number - first
  const before = line.text.slice(0, pos - line.from)
  // số dấu | (không thoát, ngoài code) trước con trỏ
  const col = Math.max(0, splitRow(before + 'x').length - 1)
  return { row: index <= 1 ? -1 : index - 2, col }
}

// ── Ghi bảng ──

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u

/** Độ rộng hiển thị: chữ CJK và emoji chiếm 2 cột, dấu tiếng Việt không chiếm thêm cột */
export function displayWidth(text: string): number {
  let width = 0
  for (const { segment } of segmenter.segment(text.normalize('NFC'))) {
    width += /\p{Extended_Pictographic}/u.test(segment) || WIDE.test(segment) ? 2 : 1
  }
  return width
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - displayWidth(text))
  if (align === 'right') return ' '.repeat(gap) + text
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2))
  return text + ' '.repeat(gap)
}

function delimiter(align: Align, width: number): string {
  const w = Math.max(3, width)
  if (align === 'center') return ':' + '-'.repeat(w - 2) + ':'
  if (align === 'right') return '-'.repeat(w - 1) + ':'
  if (align === 'left') return ':' + '-'.repeat(w - 1)
  return '-'.repeat(w)
}

/** Dựng lại bảng với các cột thẳng hàng; trả về văn bản và vị trí đầu mỗi ô */
function render(t: Table): { text: string; cellStart: (row: number, col: number) => number } {
  const cols = Math.max(t.header.length, t.aligns.length, ...t.body.map((r) => r.length), 1)
  const norm = (row: string[]): string[] => Array.from({ length: cols }, (_, i) => row[i] ?? '')
  const header = norm(t.header)
  const body = t.body.map(norm)
  const aligns = Array.from({ length: cols }, (_, i) => t.aligns[i] ?? null)
  const widths = Array.from({ length: cols }, (_, i) => Math.max(3, displayWidth(header[i]), ...body.map((r) => displayWidth(r[i]))))
  const offsets: number[][] = []
  const line = (cells: string[], rowIndex: number, base: number): string => {
    const starts: number[] = []
    let out = '|'
    cells.forEach((c, i) => {
      starts.push(base + out.length + 1)
      out += ` ${c} |`
    })
    offsets[rowIndex] = starts
    return out
  }
  const lines: string[] = []
  let base = 0
  const push = (text: string): void => {
    lines.push(text)
    base += text.length + 1
  }
  push(line(header.map((c, i) => pad(c, widths[i], aligns[i])), 0, base))
  push(line(aligns.map((a, i) => delimiter(a, widths[i])), 1, base))
  body.forEach((r, k) => push(line(r.map((c, i) => pad(c, widths[i], aligns[i])), k + 2, base)))
  return {
    text: lines.join('\n'),
    cellStart: (row, col) => {
      const r = Math.max(0, Math.min(offsets.length - 1, row < 0 ? 0 : row + 2))
      const starts = offsets[r]
      return starts[Math.max(0, Math.min(starts.length - 1, col))]
    }
  }
}

// ── Thao tác ──

type Op = (t: Table, c: Cursor) => Cursor

const cols = (t: Table): number => Math.max(t.header.length, ...t.body.map((r) => r.length), 1)

const ops: Record<string, Op> = {
  format: (_t, c) => c,
  rowAbove: (t, c) => {
    const at = Math.max(0, c.row)
    t.body.splice(at, 0, Array(cols(t)).fill(''))
    return { row: at, col: c.col }
  },
  rowBelow: (t, c) => {
    const at = c.row + 1
    t.body.splice(at, 0, Array(cols(t)).fill(''))
    return { row: at, col: c.col }
  },
  deleteRow: (t, c) => {
    if (c.row < 0) return c // không xóa hàng tiêu đề
    t.body.splice(c.row, 1)
    return { row: Math.min(c.row, t.body.length - 1), col: c.col }
  },
  colLeft: (t, c) => {
    for (const row of [t.header, ...t.body]) row.splice(c.col, 0, '')
    t.aligns.splice(c.col, 0, null)
    return { row: c.row, col: c.col }
  },
  colRight: (t, c) => {
    for (const row of [t.header, ...t.body]) row.splice(c.col + 1, 0, '')
    t.aligns.splice(c.col + 1, 0, null)
    return { row: c.row, col: c.col + 1 }
  },
  deleteCol: (t, c) => {
    if (cols(t) <= 1) return c
    for (const row of [t.header, ...t.body]) row.splice(c.col, 1)
    t.aligns.splice(c.col, 1)
    return { row: c.row, col: Math.min(c.col, cols(t) - 1) }
  },
  rowUp: (t, c) => {
    if (c.row <= 0) return c
    ;[t.body[c.row - 1], t.body[c.row]] = [t.body[c.row], t.body[c.row - 1]]
    return { row: c.row - 1, col: c.col }
  },
  rowDown: (t, c) => {
    if (c.row < 0 || c.row >= t.body.length - 1) return c
    ;[t.body[c.row + 1], t.body[c.row]] = [t.body[c.row], t.body[c.row + 1]]
    return { row: c.row + 1, col: c.col }
  },
  colLeftMove: (t, c) => {
    if (c.col <= 0) return c
    for (const row of [t.header, ...t.body, t.aligns as unknown as string[]]) [row[c.col - 1], row[c.col]] = [row[c.col], row[c.col - 1]]
    return { row: c.row, col: c.col - 1 }
  },
  colRightMove: (t, c) => {
    if (c.col >= cols(t) - 1) return c
    for (const row of [t.header, ...t.body, t.aligns as unknown as string[]]) [row[c.col + 1], row[c.col]] = [row[c.col], row[c.col + 1]]
    return { row: c.row, col: c.col + 1 }
  },
  alignLeft: (t, c) => ((t.aligns[c.col] = 'left'), c),
  alignCenter: (t, c) => ((t.aligns[c.col] = 'center'), c),
  alignRight: (t, c) => ((t.aligns[c.col] = 'right'), c)
}

export type TableOp = keyof typeof ops

/** Chạy một thao tác trên bảng chứa con trỏ, trong một lần hoàn tác, giữ con trỏ ở đúng ô */
export function runTableOp(view: EditorView, op: TableOp): boolean {
  const { state } = view
  const pos = state.selection.main.head
  const table = findTable(state, pos)
  if (!table) return false
  const cursor = ops[op](table, cursorIn(state, table, pos))
  const { text, cellStart } = render(table)
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: text },
    selection: EditorSelection.cursor(table.from + cellStart(cursor.row, cursor.col)),
    userEvent: 'input',
    scrollIntoView: true
  })
  view.focus()
  return true
}

// ── Thanh công cụ ──

const BUTTONS: { op: TableOp; label: string; title: string; sep?: boolean }[] = [
  { op: 'format', label: 'Format', title: 'Align all columns' },
  { op: 'rowAbove', label: '+ Row ↑', title: 'Insert row above', sep: true },
  { op: 'rowBelow', label: '+ Row ↓', title: 'Insert row below' },
  { op: 'deleteRow', label: '− Row', title: 'Delete row' },
  { op: 'rowUp', label: '↑', title: 'Move row up' },
  { op: 'rowDown', label: '↓', title: 'Move row down' },
  { op: 'colLeft', label: '+ Col ←', title: 'Insert column left', sep: true },
  { op: 'colRight', label: '+ Col →', title: 'Insert column right' },
  { op: 'deleteCol', label: '− Col', title: 'Delete column' },
  { op: 'colLeftMove', label: '←', title: 'Move column left' },
  { op: 'colRightMove', label: '→', title: 'Move column right' },
  { op: 'alignLeft', label: '⇤', title: 'Align column left', sep: true },
  { op: 'alignCenter', label: '↔', title: 'Center column' },
  { op: 'alignRight', label: '⇥', title: 'Align column right' }
]

function computeTableTooltip(state: EditorState): Tooltip | null {
  if (state.readOnly || state.selection.ranges.length > 1 || !state.selection.main.empty) return null
  const table = findTable(state, state.selection.main.head)
  if (!table) return null
  return {
    pos: table.from,
    above: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement('div')
      dom.className = 'cm-table-toolbar'
      for (const b of BUTTONS) {
        const el = document.createElement('button')
        el.type = 'button'
        el.textContent = b.label
        el.title = b.title
        if (b.sep) el.className = 'tb-sep'
        el.addEventListener('mousedown', (e) => {
          e.preventDefault()
          runTableOp(view, b.op)
        })
        dom.appendChild(el)
      }
      return { dom }
    }
  }
}

const tableToolbarField = StateField.define<Tooltip | null>({
  create: computeTableTooltip,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection && tr.startState.readOnly === tr.state.readOnly) return value
    const next = computeTableTooltip(tr.state)
    // Giữ nguyên tooltip cũ nếu vẫn là cùng một bảng, để không bị nháy
    if (value && next && value.pos === next.pos) return value
    return next
  },
  provide: (f) => showTooltip.from(f)
})

export function tableToolbar(): Extension {
  return [tableToolbarField]
}
