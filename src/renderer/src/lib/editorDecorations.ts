import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

// Trang trí thêm cho editor Markdown: task đã xong, khối alert, và dòng không ngắt
// (khối code, bảng). Chỉ tính trên phần đang hiển thị để ghi chú dài vẫn mượt.

function inCode(view: EditorView, pos: number): boolean {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(view.state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true
  }
  return false
}

function decorator(build: (view: EditorView) => DecorationSet): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations }
  )
}

// ── Task đã xong: gạch ngang phần chữ sau ô [x] ──
const TASK_DONE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[xX]\]\s+)(.+)$/
const doneMark = Decoration.mark({ class: 'cm-task-done' })

export const strikeDoneTasks: Extension = decorator((view) => {
  const out: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      const m = TASK_DONE.exec(line.text)
      if (m && !inCode(view, line.from)) out.push(doneMark.range(line.from + m[1].length, line.to))
      pos = line.to + 1
    }
  }
  return Decoration.set(out)
})

// ── Alert: tô viền và nền cho cả khối > [!NOTE] … ──
const ALERT_HEAD = /^\s*>\s*\[!(note|tip|important|warning|caution)\]/i
const QUOTE = /^\s*>/

export const alertBlocks: Extension = decorator((view) => {
  const out: Range<Decoration>[] = []
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    let n = doc.lineAt(from).number
    const last = doc.lineAt(to).number
    // Khối alert có thể bắt đầu trên phần đang hiển thị: lùi lại tìm dòng đầu khối
    while (n > 1 && QUOTE.test(doc.line(n).text) && !ALERT_HEAD.test(doc.line(n).text)) n--
    let kind: string | null = null
    for (; n <= last; n++) {
      const line = doc.line(n)
      const head = ALERT_HEAD.exec(line.text)
      if (head && !inCode(view, line.from)) kind = head[1].toLowerCase()
      else if (!QUOTE.test(line.text)) kind = null
      if (kind && line.from >= from - 1) {
        out.push(Decoration.line({ class: `cm-alert cm-alert-${kind}${head ? ' cm-alert-head' : ''}` }).range(line.from))
      }
    }
  }
  return Decoration.set(out, true)
})

// ── Không ngắt dòng của khối code và bảng ──
const noWrap = Decoration.line({ class: 'cm-nowrap' })

export const noWrapBlocks: Extension = decorator((view) => {
  const out: Range<Decoration>[] = []
  const seen = new Set<number>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' && node.name !== 'CodeBlock' && node.name !== 'Table') return
        const start = view.state.doc.lineAt(Math.max(node.from, from)).number
        const end = view.state.doc.lineAt(Math.min(node.to, to)).number
        for (let n = start; n <= end; n++) {
          const pos = view.state.doc.line(n).from
          if (!seen.has(pos)) {
            seen.add(pos)
            out.push(noWrap.range(pos))
          }
        }
        return false
      }
    })
  }
  return Decoration.set(out, true)
})
