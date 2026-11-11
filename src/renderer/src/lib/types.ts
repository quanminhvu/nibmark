export type NoteStatus = 'none' | 'active' | 'onHold' | 'completed' | 'dropped'

export interface Note {
  _id: string // "note:<id>"
  type: 'note'
  title: string
  body: string
  bookId: string
  tags: string[] // id của tag
  status: NoteStatus
  pinned: boolean
  trashed: boolean
  createdAt: number
  updatedAt: number
}

export interface Book {
  _id: string // "book:<id>"
  type: 'book'
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export interface Tag {
  _id: string // "tag:<id>"
  type: 'tag'
  name: string
  color: string
  createdAt: number
  updatedAt: number
}

export interface Template {
  _id: string // "template:<id>"
  type: 'template'
  name: string
  /** Tiêu đề và nội dung có thể chứa {{date}}, {{time}}… */
  title: string
  body: string
  tags: string[]
  status: NoteStatus
  createdAt: number
  updatedAt: number
}

/** File đính kèm (ảnh hoặc file bất kỳ); nội dung nằm trong _attachments.data của PouchDB */
export interface FileDoc {
  _id: string // "file:<id>"
  type: 'file'
  name: string
  contentType: string
  size: number
  createdAt: number
  updatedAt: number
}

export type AnyDoc = Note | Book | Tag | Template | FileDoc

export type Selection =
  | { kind: 'all' }
  | { kind: 'book'; id: string }
  | { kind: 'status'; status: NoteStatus }
  | { kind: 'tag'; id: string }
  | { kind: 'trash' }

export type ViewMode = 'edit' | 'split' | 'preview'
export type SortKey = 'updatedAt' | 'createdAt' | 'title'

export const STATUSES: { id: Exclude<NoteStatus, 'none'>; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'onHold', label: 'On Hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'dropped', label: 'Dropped' }
]

export const TAG_COLORS = ['#C8402E', '#C98A2E', '#5E8C4A', '#2F8F83', '#3F6FB5', '#7A5BB8', '#B24F86', '#7A7168']
