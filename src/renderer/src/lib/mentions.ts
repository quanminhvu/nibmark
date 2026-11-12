import { linkedNoteIds } from './markdown'
import { noteLinkUrl } from './noteLinks'
import type { Note } from './types'

/** Tiêu đề quá ngắn thì nhắc tới ở đâu cũng khớp, dễ nhiễu */
const MIN_TITLE = 3
const CONTEXT = 48

export interface Mention {
  /** Vị trí trong nội dung ghi chú */
  index: number
  length: number
  before: string
  match: string
  after: string
}

// Những vùng không tính là "nhắc tới": front matter, khối code, code trong dòng,
// link và ảnh đã có, link tự động <…>, URL trần, comment HTML
const SKIP = /^---\n[\s\S]*?\n---(?:\n|$)|^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?:\n|$)|$)|`[^`\n]+`|!?\[[^\]\n]*\]\([^)\n]*\)|<https?:[^>\s]+>|https?:\/\/\S+|<!--[\s\S]*?-->/gm

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}_]/u.test(ch)

function skipRanges(body: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of body.matchAll(SKIP)) out.push([m.index, m.index + m[0].length])
  return out
}

/** Các chỗ nhắc tới tiêu đề (không phân biệt hoa thường, đúng nguyên từ) mà chưa là link */
export function findMentions(body: string, title: string): Mention[] {
  const target = title.trim().toLowerCase()
  if ([...target].length < MIN_TITLE) return []
  const lower = body.toLowerCase()
  // Chữ thường hóa có thể đổi độ dài (hiếm): khi đó bỏ qua để không lệch vị trí
  if (lower.length !== body.length) return []
  const skips = skipRanges(body)
  const out: Mention[] = []
  for (let i = lower.indexOf(target); i >= 0; i = lower.indexOf(target, i + target.length)) {
    const end = i + target.length
    if (isWordChar(body[i - 1]) || isWordChar(body[end])) continue
    if (skips.some(([a, b]) => i < b && end > a)) continue
    const lineStart = body.lastIndexOf('\n', i - 1) + 1
    const lineEndRaw = body.indexOf('\n', end)
    const lineEnd = lineEndRaw < 0 ? body.length : lineEndRaw
    const from = Math.max(lineStart, i - CONTEXT)
    const to = Math.min(lineEnd, end + CONTEXT)
    out.push({
      index: i,
      length: target.length,
      before: (from > lineStart ? '…' : '') + body.slice(from, i),
      match: body.slice(i, end),
      after: body.slice(end, to) + (to < lineEnd ? '…' : '')
    })
  }
  return out
}

export interface MentionGroup {
  note: Note
  mentions: Mention[]
}

/** Ghi chú khác có nhắc tới ghi chú này mà chưa link tới nó */
export function unlinkedMentions(notes: Note[], target: Note, linksOf: (n: Note) => Set<string> = (n) => linkedNoteIds(n.body)): MentionGroup[] {
  if ([...target.title.trim()].length < MIN_TITLE) return []
  const out: MentionGroup[] = []
  for (const note of notes) {
    if (note.trashed || note._id === target._id) continue
    const mentions = findMentions(note.body, target.title)
    if (mentions.length && !linksOf(note).has(target._id)) out.push({ note, mentions })
  }
  return out.sort((a, b) => b.note.updatedAt - a.note.updatedAt)
}

/** Biến một chỗ nhắc tới thành link, giữ nguyên chữ như người viết đã gõ */
export function linkMention(body: string, mention: Mention, targetId: string): string {
  const text = body.slice(mention.index, mention.index + mention.length)
  if (text.toLowerCase() !== mention.match.toLowerCase()) return body
  const label = text.replace(/([[\]\\])/g, '\\$1')
  return body.slice(0, mention.index) + `[${label}](${noteLinkUrl(targetId)})` + body.slice(mention.index + mention.length)
}
