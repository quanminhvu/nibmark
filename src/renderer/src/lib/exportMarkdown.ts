import { childrenByParent } from './selectors'
import { STATUSES } from './types'
import type { Book, Note, Tag } from './types'

export interface ExportFile {
  folders: string[]
  name: string
  content: string
}

/** Chuỗi notebook từ gốc tới notebook chứa ghi chú, ví dụ ["Work", "Project A"]. */
export function bookPath(books: Record<string, Book>, bookId: string): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let current: Book | undefined = books[bookId]
  while (current && !seen.has(current._id)) {
    seen.add(current._id)
    path.unshift(current.name)
    current = current.parentId ? books[current.parentId] : undefined
  }
  return path
}

/**
 * Nội dung file .md: front matter YAML (giữ tiêu đề, notebook, tag, status, ngày)
 * rồi tới nguyên văn nội dung ghi chú. Chuỗi được đặt trong ngoặc kép bằng
 * JSON.stringify, vốn cũng là chuỗi YAML hợp lệ.
 */
export function noteToMarkdown(note: Note, books: Record<string, Book>, tags: Record<string, Tag>): string {
  const q = (s: string): string => JSON.stringify(s)
  const tagNames = note.tags.map((id) => tags[id]?.name).filter((n): n is string => !!n)
  const status = STATUSES.find((s) => s.id === note.status)?.label
  const lines = [
    '---',
    `title: ${q(note.title || 'Untitled')}`,
    `notebook: ${q(bookPath(books, note.bookId).join(' / '))}`,
    `tags: [${tagNames.map(q).join(', ')}]`,
    ...(status ? [`status: ${q(status)}`] : []),
    ...(note.pinned ? ['pinned: true'] : []),
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    '---',
    ''
  ]
  return lines.join('\n') + note.body + (note.body.endsWith('\n') ? '' : '\n')
}

/** Các file cần ghi khi export một notebook (kèm notebook con) hoặc toàn bộ. */
export function buildExport(
  notes: Note[],
  books: Record<string, Book>,
  tags: Record<string, Tag>,
  rootBookId: string | null
): ExportFile[] {
  let ids: Set<string> | null = null
  let rootDepth = 0
  if (rootBookId) {
    const children = childrenByParent(books)
    ids = new Set([rootBookId])
    const walk = (id: string): void => {
      for (const child of children.get(id) ?? []) {
        ids!.add(child._id)
        walk(child._id)
      }
    }
    walk(rootBookId)
    // Thư mục export đã mang tên notebook gốc, nên bỏ cấp đó khỏi đường dẫn
    rootDepth = bookPath(books, rootBookId).length
  }
  return notes
    .filter((n) => !n.trashed && (!ids || ids.has(n.bookId)))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((note) => ({
      folders: books[note.bookId] ? bookPath(books, note.bookId).slice(rootDepth) : ['Unfiled'],
      name: note.title || 'Untitled',
      content: noteToMarkdown(note, books, tags)
    }))
}

// ── File đính kèm khi export ──

const FILE_LINK = /nibmark:\/\/file\/([A-Za-z0-9_-]{1,64})/g

/** Các file đính kèm (phần hex của id) mà một đoạn Markdown tham chiếu tới */
export function attachmentHexes(text: string): string[] {
  return [...new Set([...text.matchAll(FILE_LINK)].map((m) => m[1]))]
}

/** Tên file khi export: duy nhất nhờ tiền tố id, và chỉ gồm ký tự an toàn */
export function exportName(hex: string, name: string): string {
  const clean = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 100)
  return `${hex.slice(0, 8)}-${clean || 'attachment'}`
}

/** Đổi nibmark://file/<hex> thành đường dẫn tương đối tới thư mục attachments/ */
export function rewriteAttachmentLinks(text: string, names: Map<string, string>, prefix: string): string {
  return text.replace(FILE_LINK, (all, hex: string) => {
    const name = names.get(hex)
    return name ? `${prefix}attachments/${name}` : all
  })
}
