import SparkMD5 from 'spark-md5'
import { useStore } from './store'

// Highlight từ Kindle ("My Clippings.txt").
// Mỗi cuốn sách là một ghi chú trong notebook "Kindle Highlights". Mỗi highlight mang một
// dấu ẩn <!-- kindle:… --> nên lần import sau chỉ thêm những highlight chưa có, kể cả khi
// bạn đã sửa hoặc sắp xếp lại ghi chú.

export interface Clipping {
  book: string
  author: string
  kind: 'highlight' | 'note'
  location: string
  added: string
  text: string
}

const SEPARATOR = /^={10}\s*$/m

/** "Tên sách (Tác giả)" → tách tên và tác giả (dấu ngoặc cuối cùng là tác giả). */
function splitTitle(line: string): { book: string; author: string } {
  const clean = line.replace(/^﻿/, '').trim()
  const m = /^(.*)\s+\(([^()]*)\)$/.exec(clean)
  return m ? { book: m[1].trim(), author: m[2].trim() } : { book: clean, author: '' }
}

export function parseClippings(text: string): Clipping[] {
  const out: Clipping[] = []
  for (const chunk of text.replace(/\r\n?/g, '\n').split(SEPARATOR)) {
    const lines = chunk.split('\n').filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1))
    const meaningful = chunk.split('\n').map((l) => l.trim())
    while (meaningful.length && !meaningful[0]) meaningful.shift()
    if (meaningful.length < 2 || !lines.length) continue
    const { book, author } = splitTitle(meaningful[0])
    const meta = meaningful[1]
    // Bỏ qua bookmark (không có chữ)
    if (/bookmark|dấu trang/i.test(meta)) continue
    const kind: Clipping['kind'] = /\bnote\b|ghi chú/i.test(meta) && !/highlight|đánh dấu/i.test(meta) ? 'note' : 'highlight'
    const page = /(?:page|trang)\s+([\w-]+)/i.exec(meta)?.[1]
    const loc = /(?:location|loc\.?|vị trí)\s+([\d-]+)/i.exec(meta)?.[1]
    const location = [page && `p. ${page}`, loc && `loc. ${loc}`].filter(Boolean).join(' · ')
    const added = /(?:added on|đã thêm vào)\s+(.+)$/i.exec(meta)?.[1]?.trim() ?? ''
    const body = meaningful.slice(2).join('\n').trim()
    if (!body || !book) continue
    out.push({ book, author, kind, location, added, text: body })
  }
  return out
}

const markerOf = (c: Clipping): string => SparkMD5.hash(`${c.book}\n${c.kind}\n${c.text}`).slice(0, 16)
const BOOK_MARK = (key: string): string => `<!-- kindle-book:${key} -->`

function renderClipping(c: Clipping): string {
  const quoted = c.text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  const meta = [c.location, c.added].filter(Boolean).join(' · ')
  const block = c.kind === 'note' ? `**Note:** ${c.text}` : quoted
  return `${block}\n${meta ? `<sub>${meta}</sub> ` : ''}<!-- kindle:${markerOf(c)} -->\n`
}

export interface KindleReport {
  books: number
  added: number
  skipped: number
}

/** Gộp highlight vào ghi chú: tạo ghi chú cho sách mới, chỉ thêm highlight chưa có. */
export function mergeClippings(clips: Clipping[]): KindleReport {
  const s = useStore.getState()
  let bookId = Object.values(s.books).find((b) => b.name === 'Kindle Highlights' && !b.parentId)?._id
  if (!bookId) bookId = s.createBook('Kindle Highlights', null)

  const byBook = new Map<string, Clipping[]>()
  for (const c of clips) {
    const key = `${c.book}\n${c.author}`
    if (!byBook.has(key)) byBook.set(key, [])
    byBook.get(key)!.push(c)
  }

  let added = 0
  let skipped = 0
  let books = 0
  for (const [key, list] of byBook) {
    const bookKey = SparkMD5.hash(key).slice(0, 16)
    const notes = useStore.getState().notes
    const existing = Object.values(notes).find((n) => !n.trashed && n.body.includes(BOOK_MARK(bookKey)))
    const seen = new Set<string>()
    const fresh = list.filter((c) => {
      const m = markerOf(c)
      if (seen.has(m) || existing?.body.includes(`<!-- kindle:${m} -->`)) {
        skipped++
        return false
      }
      seen.add(m)
      return true
    })
    if (!fresh.length) continue
    books++
    added += fresh.length
    const blocks = fresh.map(renderClipping).join('\n')
    if (existing) {
      useStore.getState().updateNote(existing._id, { body: `${existing.body.replace(/\s*$/, '')}\n\n${blocks}` })
    } else {
      const { book, author } = fresh[0]
      const id = useStore.getState().createNoteSilently(book)
      const header = `${author ? `*by ${author}*\n\n` : ''}${BOOK_MARK(bookKey)}\n\n`
      useStore.getState().updateNote(id, { bookId, body: header + blocks, tags: [useStore.getState().ensureTag('kindle')] })
    }
  }
  useStore.getState().flush()
  if (added) useStore.getState().select({ kind: 'book', id: bookId })
  return { books, added, skipped }
}

export async function runKindleImport(): Promise<KindleReport | null> {
  const bridge = window.nibmark
  const s = useStore.getState()
  if (!bridge) return null
  const res = await bridge.importer.kindlePick()
  if (!res) return null
  if ('error' in res) {
    s.showNotice(res.error, 'error')
    return null
  }
  const clips = parseClippings(res.text)
  if (!clips.length) {
    s.showNotice('No highlights found. Choose the “My Clippings.txt” file from your Kindle.', 'error')
    return null
  }
  const report = mergeClippings(clips)
  s.showNotice(
    report.added
      ? `Added ${report.added} highlight${report.added === 1 ? '' : 's'} from ${report.books} book${report.books === 1 ? '' : 's'}${report.skipped ? ` (${report.skipped} already imported)` : ''}.`
      : 'No new highlights since the last import.'
  )
  return report
}
