import type { Book, Note, NoteStatus, Tag } from './types'

// Cú pháp tìm kiếm:
//   từ khóa            tìm trong tiêu đề và nội dung
//   "cụm từ chính xác"
//   title:x  body:x    giới hạn theo trường
//   book:x  tag:x  status:x
//   -x                 loại trừ (dùng được với mọi dạng ở trên)

type Field = 'any' | 'title' | 'body' | 'book' | 'tag' | 'status'

interface Term {
  field: Field
  value: string
  negate: boolean
}

export interface SearchContext {
  books: Record<string, Book>
  tags: Record<string, Tag>
}

const TOKEN = /(-)?(?:(book|tag|status|title|body):)?(?:"([^"]*)"|(\S+))/gi

export function parseQuery(query: string): Term[] {
  const terms: Term[] = []
  for (const m of query.matchAll(TOKEN)) {
    const value = (m[3] ?? m[4] ?? '').toLowerCase()
    if (!value) continue
    terms.push({ field: (m[2]?.toLowerCase() as Field) ?? 'any', value, negate: !!m[1] })
  }
  return terms
}

const normalizeStatus = (s: string): string => s.toLowerCase().replace(/[\s_-]/g, '')

function statusMatches(status: NoteStatus, value: string): boolean {
  return normalizeStatus(status) === normalizeStatus(value)
}

function termMatches(note: Note, term: Term, ctx: SearchContext): boolean {
  switch (term.field) {
    case 'title':
      return note.title.toLowerCase().includes(term.value)
    case 'body':
      return note.body.toLowerCase().includes(term.value)
    case 'book':
      return (ctx.books[note.bookId]?.name ?? '').toLowerCase().includes(term.value)
    case 'tag':
      return note.tags.some((id) => (ctx.tags[id]?.name ?? '').toLowerCase() === term.value)
    case 'status':
      return statusMatches(note.status, term.value)
    default:
      return note.title.toLowerCase().includes(term.value) || note.body.toLowerCase().includes(term.value)
  }
}

export function matchesQuery(note: Note, terms: Term[], ctx: SearchContext): boolean {
  return terms.every((term) => termMatches(note, term, ctx) !== term.negate)
}

/** Các từ khóa dương dùng để tô sáng kết quả trong danh sách. */
export function highlightWords(terms: Term[]): string[] {
  return terms.filter((t) => !t.negate && (t.field === 'any' || t.field === 'title' || t.field === 'body')).map((t) => t.value)
}
