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
  /** Tên icon Lucide (PascalCase), không có = icon notebook mặc định */
  icon?: string
  /** Thứ tự tự sắp trong cùng một cấp; không có = xếp theo tên */
  order?: number
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
  /** Notebook đặt sẵn cho ghi chú tạo từ template (không bắt buộc) */
  bookId?: string
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

// Màu tag mới (kiểu màu hệ thống macOS); tag đã có giữ nguyên màu cũ
export const TAG_COLORS = ['#2F6FE4', '#2FB457', '#E5484D', '#9B59D0', '#F08C1A', '#1BA7C9', '#E5487E', '#8E8E93']
