import { snippet, startCompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { EditorState } from '@codemirror/state'

// Các nguồn gợi ý của editor. CodeMirror gọi mọi nguồn ở mỗi phím gõ,
// nên nguồn nào cũng phải trả về null thật nhanh khi không áp dụng.

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'CodeInfo', 'CodeMark'])

/** Con trỏ có đang nằm trong code (khối ``` hoặc `code`) không */
export function inCode(state: EditorState, pos: number): boolean {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true
  }
  return false
}

// ── Slash command: gõ "/" ở đầu một dòng trống ──

interface SlashItem {
  label: string
  detail: string
  keywords: string
  template?: string
  run?: Completion['apply']
}

const SLASH_ITEMS: SlashItem[] = [
  { label: 'Heading 1', detail: '#', keywords: 'h1 title', template: '# ${}' },
  { label: 'Heading 2', detail: '##', keywords: 'h2 subtitle', template: '## ${}' },
  { label: 'Heading 3', detail: '###', keywords: 'h3', template: '### ${}' },
  { label: 'Bulleted List', detail: '-', keywords: 'ul unordered bullet', template: '- ${}' },
  { label: 'Numbered List', detail: '1.', keywords: 'ol ordered number', template: '1. ${}' },
  { label: 'Task List', detail: '- [ ]', keywords: 'todo checkbox check', template: '- [ ] ${}' },
  { label: 'Quote', detail: '>', keywords: 'blockquote', template: '> ${}' },
  { label: 'Code Block', detail: '```', keywords: 'fence snippet pre', template: '```${language}\n${}\n```' },
  { label: 'Table', detail: '| |', keywords: 'grid columns', template: '| ${Column} | Column |\n| --- | --- |\n|  |  |' },
  { label: 'Divider', detail: '---', keywords: 'hr rule line separator', template: '---\n${}' },
  { label: 'Mermaid Diagram', detail: 'mermaid', keywords: 'chart graph flow diagram', template: '```mermaid\ngraph TD\n  ${A} --> B\n```' },
  { label: 'Math Block', detail: '$$', keywords: 'katex latex equation formula', template: '$$\n${}\n$$' },
  { label: 'Note Alert', detail: '[!NOTE]', keywords: 'callout info github alert', template: '> [!NOTE]\n> ${}' },
  { label: 'Tip Alert', detail: '[!TIP]', keywords: 'callout hint github alert', template: '> [!TIP]\n> ${}' },
  { label: 'Important Alert', detail: '[!IMPORTANT]', keywords: 'callout github alert', template: '> [!IMPORTANT]\n> ${}' },
  { label: 'Warning Alert', detail: '[!WARNING]', keywords: 'callout github alert', template: '> [!WARNING]\n> ${}' },
  { label: 'Caution Alert', detail: '[!CAUTION]', keywords: 'callout danger github alert', template: '> [!CAUTION]\n> ${}' },
  {
    label: 'Link to Note',
    detail: '[[',
    keywords: 'wiki internal reference',
    run: (view, _c, from, to) => {
      view.dispatch({ changes: { from, to, insert: '[[' }, selection: { anchor: from + 2 } })
      startCompletion(view)
    }
  }
]

/** Thêm mục chèn file/ảnh (được gắn từ phần đính kèm) */
export const extraSlashItems: SlashItem[] = []

export function slashCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const m = /^(\s*)\/([\w-]*)$/.exec(before)
  // Chỉ ở đầu một dòng trống (phía sau con trỏ cũng phải trống) và không nằm trong code
  if (!m || line.text.slice(before.length).trim() || inCode(context.state, context.pos)) return null
  const query = m[2].toLowerCase()
  const from = line.from + m[1].length
  const items = [...SLASH_ITEMS, ...extraSlashItems].filter(
    (it) => !query || it.label.toLowerCase().includes(query) || it.keywords.includes(query)
  )
  if (!items.length) return null
  return {
    from,
    filter: false,
    options: items.map((it, i) => ({
      label: it.label,
      detail: it.detail,
      type: 'keyword',
      boost: -i,
      apply: it.run ?? snippet(it.template!)
    }))
  }
}

// ── Gợi ý ngôn ngữ khi gõ ```lang ──

const LANGUAGE_NAMES: string[] = (() => {
  const names = new Set<string>(['mermaid', 'math', 'text'])
  for (const lang of languages) {
    for (const alias of lang.alias) names.add(alias.toLowerCase())
    names.add(lang.name.toLowerCase().replace(/\s+/g, ''))
  }
  return [...names].filter((n) => /^[\w+#-]+$/.test(n)).sort()
})()

export function fenceLanguageCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const m = /^(\s*(?:```|~~~))([\w+#-]*)$/.exec(before)
  // Cần ít nhất một ký tự tên ngôn ngữ, để gõ ``` rồi Enter vẫn tạo khối code thường
  if (!m || (!m[2] && !context.explicit) || line.text.slice(before.length).trim()) return null
  // Chỉ gợi ý ở dòng MỞ khối code: số dòng ``` phía trước phải là số chẵn
  let fences = 0
  for (let n = 1; n < line.number; n++) if (/^\s*(```|~~~)/.test(context.state.doc.line(n).text)) fences++
  if (fences % 2 === 1) return null
  const query = m[2].toLowerCase()
  const names = LANGUAGE_NAMES.filter((n) => n.startsWith(query)).slice(0, 40)
  if (!names.length || (names.length === 1 && names[0] === query)) return null
  return { from: line.from + m[1].length, filter: false, options: names.map((n) => ({ label: n, type: 'type' })) }
}

// ── Emoji: ":" + ít nhất 2 ký tự, đứng sau khoảng trắng hoặc đầu dòng ──

type EmojiEntry = { emoji: string; name: string; keywords: string[] }
let emojiList: EmojiEntry[] | null = null
let emojiLoading: Promise<EmojiEntry[]> | null = null

function loadEmoji(): Promise<EmojiEntry[]> {
  emojiLoading ??= import('emojilib').then((mod) => {
    const data = ((mod as { default?: Record<string, string[]> }).default ?? mod) as Record<string, string[]>
    emojiList = Object.entries(data)
      .filter(([, words]) => Array.isArray(words) && words.length)
      .map(([emoji, words]) => ({ emoji, name: words[0], keywords: words.slice(1) }))
    return emojiList
  })
  return emojiLoading
}

export async function emojiCompletions(context: CompletionContext): Promise<CompletionResult | null> {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const m = /(?:^|[\s(])(:([a-z0-9_+-]{2,}))$/i.exec(before)
  if (!m || inCode(context.state, context.pos)) return null
  // Bỏ qua front matter YAML ở đầu ghi chú
  if (context.state.doc.line(1).text === '---' && line.number > 1) {
    const text = context.state.sliceDoc(0, line.from)
    if ((text.match(/^---$/gm) ?? []).length === 1) return null
  }
  const query = m[2].toLowerCase()
  const list = emojiList ?? (await loadEmoji())
  const starts: EmojiEntry[] = []
  const contains: EmojiEntry[] = []
  for (const e of list) {
    if (e.name.startsWith(query)) starts.push(e)
    else if (e.name.includes(query) || e.keywords.some((k) => k.startsWith(query))) contains.push(e)
    if (starts.length >= 30) break
  }
  const picked = [...starts, ...contains].slice(0, 30)
  if (!picked.length) return null
  return {
    from: context.pos - m[1].length,
    filter: false,
    options: picked.map((e) => ({ label: `:${e.name}:`, displayLabel: `${e.emoji}  ${e.name.replace(/_/g, ' ')}`, apply: e.emoji, type: 'text' }))
  }
}
