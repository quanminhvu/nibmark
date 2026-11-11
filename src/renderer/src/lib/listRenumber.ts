import { EditorState } from '@codemirror/state'
import type { ChangeSpec, Text, Transaction, TransactionSpec } from '@codemirror/state'

// Tự đánh lại số thứ tự danh sách (1. 2. 3.) sau khi thêm, xóa, dán hay di chuyển dòng.
// Dùng transactionFilter để phần sửa số nằm CHUNG một bước hoàn tác với thao tác của người dùng
// (không dispatch thêm từ updateListener).
// - Giữ nguyên số bắt đầu của danh sách.
// - Danh sách "lười" (toàn 1. 1. 1.) thì để nguyên.
// - Không đụng vào khối code ```.

const ITEM = /^(\s*)(\d{1,9})([.)])(\s+)/
const FENCE = /^\s*(```|~~~)/

interface Item {
  line: number
  indent: number
  num: number
  numFrom: number
  numTo: number
}

function itemAt(doc: Text, n: number): Item | null {
  const line = doc.line(n)
  const m = ITEM.exec(line.text)
  if (!m) return null
  const numFrom = line.from + m[1].length
  return { line: n, indent: m[1].length, num: Number(m[2]), numFrom, numTo: numFrom + m[2].length }
}

/** Dòng n có nằm trong khối code ``` không (đếm số dòng ``` phía trên) */
function inFence(doc: Text, n: number): boolean {
  let open = false
  for (let i = 1; i < n; i++) if (FENCE.test(doc.line(i).text)) open = !open
  return open
}

/** Các mục cùng cấp của danh sách chứa dòng n */
function siblings(doc: Text, start: Item): Item[] {
  const sameLevel = (n: number): 'item' | 'inside' | 'stop' => {
    const text = doc.line(n).text
    const it = itemAt(doc, n)
    if (it && it.indent === start.indent) return 'item'
    if (!text.trim()) return 'inside' // dòng trống: xét tiếp
    const indent = /^\s*/.exec(text)![0].length
    return indent > start.indent ? 'inside' : 'stop' // dòng thụt sâu hơn thuộc về mục phía trên
  }
  let top = start.line
  for (let n = start.line - 1; n >= 1; n--) {
    const kind = sameLevel(n)
    if (kind === 'stop') break
    if (kind === 'item') top = n
  }
  const items: Item[] = []
  for (let n = top; n <= doc.lines; n++) {
    const kind = sameLevel(n)
    if (kind === 'stop') break
    if (kind === 'item') items.push(itemAt(doc, n)!)
    // Hai dòng trống liền nhau thì coi như danh sách đã kết thúc
    if (!doc.line(n).text.trim() && n < doc.lines && !doc.line(n + 1).text.trim()) break
  }
  return items
}

function renumber(tr: Transaction): ChangeSpec[] {
  const doc = tr.newDoc
  const touched = new Set<number>()
  tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
    const a = doc.lineAt(fromB).number
    const b = doc.lineAt(Math.min(toB, doc.length)).number
    for (let n = Math.max(1, a - 1); n <= Math.min(doc.lines, b + 1); n++) touched.add(n)
  })
  const changes: ChangeSpec[] = []
  const done = new Set<number>()
  for (const n of touched) {
    const item = itemAt(doc, n)
    if (!item || done.has(n)) continue
    const items = siblings(doc, item)
    items.forEach((i) => done.add(i.line))
    if (items.length < 2 || inFence(doc, items[0].line)) continue
    if (items.every((i) => i.num === items[0].num)) continue // danh sách "lười"
    // Số bắt đầu: giữ số của mục đầu, trừ khi mục đầu vừa bị thay bằng một dòng khác
    // (ví dụ kéo dòng lên đầu). Khi đó lấy số nhỏ nhất của danh sách.
    const first = items[0]
    let onlyNumberEdited = true
    let touchedFirst = false
    const firstLine = doc.line(first.line)
    tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
      if (toB < firstLine.from || fromB > firstLine.to) return
      touchedFirst = true
      if (fromB < first.numFrom || toB > first.numTo) onlyNumberEdited = false
    })
    const start = !touchedFirst || onlyNumberEdited ? first.num : Math.min(...items.map((i) => i.num))
    items.forEach((i, k) => {
      const want = String(start + k)
      if (String(i.num) !== want) changes.push({ from: i.numFrom, to: i.numTo, insert: want })
    })
  }
  return changes
}

export const listRenumber = EditorState.transactionFilter.of((tr): Transaction | readonly (Transaction | TransactionSpec)[] => {
  if (!tr.docChanged || tr.isUserEvent('undo') || tr.isUserEvent('redo') || tr.isUserEvent('input.renumber')) return tr
  // Nhanh: không có dòng danh sách số nào quanh chỗ sửa thì thôi
  let relevant = false
  tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
    if (relevant) return
    const doc = tr.newDoc
    const a = doc.lineAt(fromB).number
    const b = doc.lineAt(Math.min(toB, doc.length)).number
    for (let n = Math.max(1, a - 1); n <= Math.min(doc.lines, b + 1) && !relevant; n++) relevant = ITEM.test(doc.line(n).text)
  })
  if (!relevant) return tr
  const changes = renumber(tr)
  if (!changes.length) return tr
  return [tr, { changes, sequential: true, userEvent: 'input.renumber' }]
})
