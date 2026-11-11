import { matchesQuery, parseQuery } from './search'
import type { State } from './store'
import type { Book, Note } from './types'

/** Notebook có thứ tự tự sắp đứng trước theo thứ tự đó; còn lại xếp theo tên */
export function compareBooks(a: Book, b: Book): number {
  const ao = typeof a.order === 'number'
  const bo = typeof b.order === 'number'
  if (ao && bo && a.order !== b.order) return a.order! - b.order!
  if (ao !== bo) return ao ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function childrenByParent(books: Record<string, Book>): Map<string | null, Book[]> {
  const map = new Map<string | null, Book[]>()
  for (const book of Object.values(books)) {
    // Notebook có cha đã bị xóa được coi như nằm ở gốc
    const parent = book.parentId && books[book.parentId] ? book.parentId : null
    const list = map.get(parent)
    if (list) list.push(book)
    else map.set(parent, [book])
  }
  for (const list of map.values()) list.sort(compareBooks)
  return map
}

export function descendantIds(children: Map<string | null, Book[]>, id: string): string[] {
  const out: string[] = []
  const walk = (parent: string): void => {
    for (const child of children.get(parent) ?? []) {
      out.push(child._id)
      walk(child._id)
    }
  }
  walk(id)
  return out
}

type Slice = Pick<State, 'notes' | 'books' | 'tags' | 'selection' | 'query' | 'sort' | 'collapsedBooks'>

/** Danh sách ghi chú đang hiển thị ở cột giữa, đã lọc và sắp xếp. */
export function visibleNotes(s: Slice): Note[] {
  const { selection } = s
  let list = Object.values(s.notes)

  if (selection.kind === 'trash') {
    list = list.filter((n) => n.trashed)
  } else {
    list = list.filter((n) => !n.trashed)
    if (selection.kind === 'book') {
      const ids = new Set([selection.id])
      // Notebook đang thu gọn thì hiện cả ghi chú của notebook con
      if (s.collapsedBooks[selection.id]) {
        for (const id of descendantIds(childrenByParent(s.books), selection.id)) ids.add(id)
      }
      list = list.filter((n) => ids.has(n.bookId))
    } else if (selection.kind === 'status') {
      list = list.filter((n) => n.status === selection.status)
    } else if (selection.kind === 'tag') {
      list = list.filter((n) => n.tags.includes(selection.id))
    }
  }

  const terms = parseQuery(s.query)
  if (terms.length) list = list.filter((n) => matchesQuery(n, terms, s))

  const bySort = (a: Note, b: Note): number => {
    if (s.sort === 'title') return (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
    return b[s.sort] - a[s.sort]
  }
  return list.sort((a, b) => {
    if (selection.kind !== 'trash' && a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return bySort(a, b)
  })
}
