import type { ChangeSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { diffLines } from 'diff'

// "Format Document": dọn trình bày Markdown bằng Prettier (nạp khi dùng lần đầu, không làm chậm
// lúc mở app), cộng vài bước trước/sau để hợp với cách viết trong Nibmark:
// - trước: "#Tiêu đề" → "# Tiêu đề"; ký hiệu danh sách * và + → - (không thì Prettier tách
//   thành nhiều danh sách)
// - sau: đánh số danh sách tăng dần, giữ số bắt đầu (Prettier đổi "3. 5." thành "1. 1.")
// Không đụng vào front matter và nội dung khối code; khối code, công thức giữ nguyên từng ký tự.

const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const ORDERED = /^(\s*)(\d{1,9})([.)])(\s+)/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/

/** Gọi fn cho từng dòng ngoài khối code; dòng trong khối code giữ nguyên */
function mapProse(text: string, fn: (line: string) => string): string {
  let fence: string | null = null
  return text
    .split('\n')
    .map((line) => {
      const m = FENCE.exec(line)
      if (m) {
        const mark = m[1]
        if (!fence) fence = mark
        else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null
        return line
      }
      return fence ? line : fn(line)
    })
    .join('\n')
}

function splitFrontMatter(text: string): [string, string] {
  const m = FRONT_MATTER.exec(text)
  return m ? [m[0], text.slice(m[0].length)] : ['', text]
}

function preprocess(body: string): string {
  return mapProse(body, (line) => {
    // "#Tiêu đề" chưa phải heading trong Markdown chuẩn: thêm dấu cách, chỉ khi sau # là chữ in hoa
    // (để "#golang…" hay "#1" kiểu hashtag/đánh số giữ nguyên)
    let next = line.replace(/^(#{1,6})(?=\p{Lu})/u, '$1 ')
    // * và + đầu mục → -, trừ đường kẻ ngang (* * *)
    if (!RULE.test(next)) next = next.replace(/^(\s*)[*+](\s+)/, '$1-$2')
    return next
  })
}

/** Đánh số mỗi danh sách tăng dần từ số đầu tiên của nó */
export function renumberLists(body: string): string {
  const lists: { indent: number; delim: string; next: number }[] = []
  return mapProse(body, (line) => {
    if (!line.trim()) return line
    const indent = line.length - line.trimStart().length
    const m = ORDERED.exec(line)
    if (m) {
      const [, lead, num, delim, space] = m
      while (lists.length && lists[lists.length - 1].indent > indent) lists.pop()
      const top = lists[lists.length - 1]
      if (top && top.indent === indent && top.delim === delim) {
        const value = top.next++
        return lead + String(value) + delim + space + line.slice(m[0].length)
      }
      if (top && top.indent === indent) lists.pop()
      lists.push({ indent, delim, next: Number(num) + 1 })
      return line
    }
    // Dòng khác: kết thúc các danh sách thụt bằng hoặc sâu hơn nó
    // (mục không đánh số cùng cấp, đoạn văn quay về lề trái…)
    while (lists.length && lists[lists.length - 1].indent >= indent) lists.pop()
    return line
  })
}

type Prettier = typeof import('prettier/standalone')
let loading: Promise<{ prettier: Prettier; plugins: unknown[] }> | null = null

function loadPrettier(): Promise<{ prettier: Prettier; plugins: unknown[] }> {
  loading ??= Promise.all([import('prettier/standalone'), import('prettier/plugins/markdown')]).then(([prettier, markdown]) => ({
    prettier,
    plugins: [markdown]
  }))
  return loading
}

/** Các dòng kẻ ngang (---, ***, ___) theo thứ tự, ngoài khối code */
function rules(body: string): string[] {
  const out: string[] = []
  mapProse(body, (line) => {
    if (RULE.test(line)) out.push(line.trim())
    return line
  })
  return out
}

/**
 * Prettier đổi mọi đường kẻ thành "---"; trình chiếu dùng "---" để ngắt slide, nên giữ lại
 * đúng kiểu kẻ ban đầu (*** hay ___) theo thứ tự xuất hiện.
 */
function restoreRules(source: string, formatted: string): string {
  const original = rules(source)
  if (!original.length || original.every((r) => /^-/.test(r))) return formatted
  let i = 0
  return mapProse(formatted, (line) => (RULE.test(line) && i < original.length ? original[i++].replace(/\s+/g, '') : line))
}

/** Văn bản đã format (giữ nguyên front matter; ném lỗi nếu Markdown không đọc được) */
export async function formatMarkdown(text: string): Promise<string> {
  const [frontMatter, body] = splitFrontMatter(text.replace(/\r\n/g, '\n'))
  if (!body.trim()) return text
  const { prettier, plugins } = await loadPrettier()
  const pretty = await prettier.format(preprocess(body), {
    parser: 'markdown',
    plugins: plugins as never,
    proseWrap: 'preserve',
    embeddedLanguageFormatting: 'off',
    tabWidth: 2
  })
  const result = restoreRules(body, renumberLists(pretty))
  return frontMatter ? `${frontMatter.replace(/\n?$/, '\n')}\n${result}` : result
}

/** Thay nội dung editor bằng bản đã format, chỉ sửa những dòng đổi (giữ con trỏ, một bước hoàn tác) */
export function applyFormatted(view: EditorView, formatted: string): boolean {
  const current = view.state.doc.toString()
  if (formatted === current) return false
  const changes: ChangeSpec[] = []
  const parts = diffLines(current, formatted)
  let pos = 0
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const next = parts[i + 1]
    if (part.removed && next?.added) {
      // Một đoạn bị thay: chỉ thay phần chữ khác nhau, giữ phần giống ở đầu và cuối
      // (để con trỏ trên dòng chỉ đổi khoảng trắng/xuống dòng không bị nhảy đi)
      const a = part.value
      const b = next.value
      let start = 0
      while (start < a.length && start < b.length && a[start] === b[start]) start++
      let end = 0
      while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
      changes.push({ from: pos + start, to: pos + a.length - end, insert: b.slice(start, b.length - end) })
      pos += a.length
      i++
    } else if (part.added) changes.push({ from: pos, insert: part.value })
    else if (part.removed) {
      changes.push({ from: pos, to: pos + part.value.length })
      pos += part.value.length
    } else pos += part.value.length
  }
  view.dispatch({ changes, userEvent: 'format', scrollIntoView: false })
  return true
}
