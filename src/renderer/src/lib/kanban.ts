/**
 * Bảng Kanban là một ghi chú Markdown bình thường:
 *
 *   ---
 *   view: kanban
 *   ---
 *   ## Backlog          ← mỗi heading cấp 2 là một cột
 *   - [ ] Thẻ A         ← mỗi mục danh sách cấp ngoài cùng là một thẻ
 *     - [ ] việc con    ← dòng thụt vào thuộc về thẻ phía trên
 *
 * Mọi thao tác trên bảng (kéo thẻ, thêm, sửa, xoá, đánh dấu xong) chỉ cắt/dán
 * đúng các dòng của thẻ; phần còn lại của ghi chú giữ nguyên từng ký tự.
 */

export interface KanbanCard {
  /** Dòng đầu tiên của thẻ (chỉ số dòng, đếm từ 0) */
  start: number
  /** Ngay sau dòng cuối cùng có chữ của thẻ */
  end: number
  /** Nội dung dòng đầu, đã bỏ dấu danh sách và ô checkbox */
  text: string
  /** null = thẻ không có ô checkbox */
  done: boolean | null
  /** Các dòng còn lại của thẻ, đã bỏ phần thụt đầu dòng */
  detail: string
  tasks: { done: number; total: number }
}

export interface KanbanColumn {
  title: string
  /** Dòng heading của cột */
  line: number
  /** Ngay sau dòng cuối của cột (heading kế tiếp hoặc hết ghi chú) */
  end: number
  cards: KanbanCard[]
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const FENCE = /^\s*(```|~~~)/
const COLUMN = /^##[ \t]+(.*?)[ \t#]*$/
const CARD = /^[-*+][ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/
const SUB_TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/

/** Ghi chú có `view: kanban` (hoặc `kanban-plugin: …` của Obsidian) trong front matter. */
export function isKanban(source: string): boolean {
  const fm = FRONT_MATTER.exec(source)
  if (!fm) return false
  return /^(?:view:[ \t]*["']?kanban["']?|kanban-plugin:.*)[ \t]*$/im.test(fm[1])
}

/** Bỏ front matter ở đầu ghi chú (dùng cho đoạn trích trong danh sách). */
export function stripFrontMatter(source: string): string {
  return source.replace(FRONT_MATTER, '')
}

const isBlank = (line: string): boolean => !line.trim()

export function parseBoard(source: string): KanbanColumn[] {
  const lines = source.split('\n')
  const fm = FRONT_MATTER.exec(source)
  const first = fm ? fm[0].split('\n').length - (fm[0].endsWith('\n') ? 1 : 0) : 0

  // Tìm heading cột, bỏ qua heading nằm trong khối code
  const columns: KanbanColumn[] = []
  let inFence = false
  for (let i = first; i < lines.length; i++) {
    if (FENCE.test(lines[i])) inFence = !inFence
    if (inFence) continue
    const m = COLUMN.exec(lines[i])
    if (m) {
      if (columns.length) columns[columns.length - 1].end = i
      columns.push({ title: m[1].trim(), line: i, end: lines.length, cards: [] })
    }
  }

  for (const col of columns) {
    let card: KanbanCard | null = null
    let fence = false
    const close = (): void => {
      if (!card) return
      const body = lines.slice(card.start + 1, card.end)
      const indent = Math.min(...body.filter((l) => !isBlank(l)).map((l) => /^\s*/.exec(l)![0].length), 99)
      card.detail = body.map((l) => l.slice(Math.min(indent, /^\s*/.exec(l)![0].length))).join('\n').trim()
      for (const l of body) {
        const t = SUB_TASK.exec(l)
        if (!t) continue
        card.tasks.total++
        if (t[1] !== ' ') card.tasks.done++
      }
      col.cards.push(card)
      card = null
    }
    for (let i = col.line + 1; i < col.end; i++) {
      const line = lines[i]
      if (card && fence) {
        card.end = i + 1
        if (FENCE.test(line)) fence = false
        continue
      }
      const m = CARD.exec(line)
      if (m) {
        close()
        card = { start: i, end: i + 1, text: m[2], done: m[1] === undefined ? null : m[1] !== ' ', detail: '', tasks: { done: 0, total: 0 } }
        continue
      }
      if (card && /^\s+\S/.test(line)) {
        card.end = i + 1
        if (FENCE.test(line)) fence = true
        continue
      }
      if (isBlank(line)) continue
      // Đoạn văn thường trong cột: kết thúc thẻ hiện tại, giữ nguyên trong ghi chú
      close()
    }
    close()
  }
  return columns
}

/** Vị trí chèn thẻ mới vào cuối cột: ngay sau dòng có chữ cuối cùng của cột. */
function columnTail(lines: string[], col: KanbanColumn): number {
  if (col.cards.length) return col.cards[col.cards.length - 1].end
  let i = col.end
  while (i > col.line + 1 && isBlank(lines[i - 1])) i--
  return i
}

function insertBlock(lines: string[], col: KanbanColumn, index: number, block: string[]): string[] {
  const out = [...lines]
  if (index < col.cards.length) {
    out.splice(col.cards[index].start, 0, ...block)
    return out
  }
  const at = columnTail(lines, col)
  const pad: string[] = []
  // Cột trống: chừa một dòng trống sau heading cho dễ đọc
  if (!col.cards.length && at === col.line + 1) pad.push('')
  // Giữ một dòng trống trước heading kế tiếp
  const after = out[at]
  const tail = after !== undefined && COLUMN.test(after) ? [''] : []
  out.splice(at, 0, ...pad, ...block, ...tail)
  return out
}

/** Cắt các dòng [start, end); không để lại hai dòng trống liền nhau ở chỗ cắt. */
function removeBlock(lines: string[], start: number, end: number): string[] {
  const out = [...lines.slice(0, start), ...lines.slice(end)]
  if (start > 0 && start < out.length && isBlank(out[start - 1]) && isBlank(out[start])) out.splice(start, 1)
  return out
}

/** Chuyển thẻ `card` của cột `from` tới vị trí `index` của cột `to`. */
export function moveCard(source: string, from: number, card: number, to: number, index: number): string {
  const lines = source.split('\n')
  const cols = parseBoard(source)
  const c = cols[from]?.cards[card]
  if (!c || !cols[to]) return source
  if (from === to && (index === card || index === card + 1)) return source
  const block = lines.slice(c.start, c.end)
  const removed = removeBlock(lines, c.start, c.end)
  // Bỏ thẻ xong thì cột đích có thể đã dịch lên; đọc lại cho chắc
  const after = parseBoard(removed.join('\n'))
  const target = after[to]
  if (!target) return source
  const at = from === to && index > card ? index - 1 : index
  return insertBlock(removed, target, at, block).join('\n')
}

export function addCard(source: string, col: number, text: string): string {
  const cols = parseBoard(source)
  const target = cols[col]
  const clean = text.replace(/\s*\n\s*/g, ' ').trim()
  if (!target || !clean) return source
  return insertBlock(source.split('\n'), target, target.cards.length, [`- [ ] ${clean}`]).join('\n')
}

/** Sửa nội dung dòng đầu của thẻ, giữ nguyên dấu danh sách, checkbox và các dòng con. */
export function renameCard(source: string, col: number, card: number, text: string): string {
  const c = parseBoard(source)[col]?.cards[card]
  const clean = text.replace(/\s*\n\s*/g, ' ').trim()
  if (!c || !clean) return source
  const lines = source.split('\n')
  const prefix = /^[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/.exec(lines[c.start])![0]
  lines[c.start] = prefix + clean
  return lines.join('\n')
}

export function deleteCard(source: string, col: number, card: number): string {
  const c = parseBoard(source)[col]?.cards[card]
  if (!c) return source
  return removeBlock(source.split('\n'), c.start, c.end).join('\n')
}

export function toggleCard(source: string, col: number, card: number): string {
  const c = parseBoard(source)[col]?.cards[card]
  if (!c) return source
  const lines = source.split('\n')
  const line = lines[c.start]
  lines[c.start] =
    c.done === null
      ? line.replace(/^([-*+][ \t]+)/, '$1[x] ')
      : line.replace(/^([-*+][ \t]+\[)([ xX])(\])/, (_a, pre: string, mark: string, post: string) => pre + (mark === ' ' ? 'x' : ' ') + post)
  return lines.join('\n')
}

export function addColumn(source: string, title: string): string {
  const clean = title.replace(/\s*\n\s*/g, ' ').trim()
  if (!clean) return source
  const body = source.replace(/\s+$/, '')
  return `${body}\n\n## ${clean}\n`
}

export function renameColumn(source: string, col: number, title: string): string {
  const c = parseBoard(source)[col]
  const clean = title.replace(/\s*\n\s*/g, ' ').trim()
  if (!c || !clean) return source
  const lines = source.split('\n')
  lines[c.line] = `## ${clean}`
  return lines.join('\n')
}

export const KANBAN_TEMPLATE = `---
view: kanban
---

## 📥 Backlog

- [ ] An idea or a task #idea
- [ ] Drag cards between columns

## 🚧 Doing

- [ ] Something in progress
  - [ ] First step
  - [ ] Second step

## 👀 Review

## ✅ Done

- [x] Create this board
`
