import { create } from 'zustand'
import { loadAll, putDoc, removeDoc, watchChanges } from './db'
import { TAG_COLORS } from './types'
import { childrenByParent, visibleNotes } from './selectors'
import type { AnyDoc, Book, Note, NoteStatus, Selection, SortKey, Tag, Template, ViewMode } from './types'
import { WELCOME_BODY, WELCOME_TITLE } from './welcome'
import { noteWindowId } from './windowMode'

const PREFS_KEY = 'nibmark:prefs'
const SAVE_DELAY_MS = 300

interface Prefs {
  sort: SortKey
  viewMode: ViewMode
  collapsedBooks: Record<string, true>
  selection: Selection
  selectedNoteId: string | null
  lastBookId: string | null
  /** Ẩn cột sidebar để có thêm chỗ */
  sidebarHidden: boolean
}

const defaultPrefs: Prefs = {
  sort: 'updatedAt',
  viewMode: 'edit',
  collapsedBooks: {},
  selection: { kind: 'all' },
  selectedNoteId: null,
  lastBookId: null,
  sidebarHidden: false
}

function readPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return defaultPrefs
  }
}

const newId = (prefix: string): string => `${prefix}:${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

function persist(doc: AnyDoc): void {
  putDoc(doc).catch((err) => console.error('Failed to save', doc._id, err))
}

function erase(id: string): void {
  removeDoc(id).catch((err) => console.error('Failed to delete', id, err))
}

export interface State extends Prefs {
  ready: boolean
  notes: Record<string, Note>
  books: Record<string, Book>
  tags: Record<string, Tag>
  templates: Record<string, Template>
  query: string
  distractionFree: boolean
  prefsOpen: boolean
  /** Các ghi chú đang được chọn cùng lúc (rỗng hoặc 1 phần tử = chọn một) */
  multi: string[]
  setMulti: (ids: string[]) => void
  /** Command palette đang mở ở chế độ nào */
  palette: 'commands' | 'templates' | 'actions' | 'tasks' | null
  notice: { text: string; tone: 'info' | 'error'; id: number } | null

  init: () => Promise<void>
  flush: () => void

  select: (selection: Selection) => void
  selectNote: (id: string | null) => void
  setQuery: (query: string) => void
  setSort: (sort: SortKey) => void
  setViewMode: (mode: ViewMode) => void
  toggleDistractionFree: () => void
  toggleSidebar: () => void
  setPrefsOpen: (open: boolean) => void
  setPalette: (mode: 'commands' | 'templates' | 'actions' | 'tasks' | null) => void
  /** Mở một ghi chú ở bất cứ đâu, đổi sidebar nếu ghi chú đang bị ẩn khỏi danh sách */
  openNote: (id: string) => boolean
  showNotice: (text: string, tone?: 'info' | 'error') => void
  toggleBookCollapsed: (id: string) => void

  createNote: () => string
  /** Tạo ghi chú mà không chuyển sang nó (dùng cho liên kết [[ ]]) */
  createNoteSilently: (title: string) => string
  updateNote: (id: string, patch: Partial<Omit<Note, '_id' | 'type'>>) => void
  duplicateNote: (id: string) => void
  trashNote: (id: string) => void
  restoreNote: (id: string) => void
  deleteNoteForever: (id: string) => void
  emptyTrash: () => void

  createBook: (name: string, parentId: string | null) => string
  renameBook: (id: string, name: string) => void
  moveBook: (id: string, parentId: string | null) => void
  /** Đặt notebook ngay trước/sau một notebook khác (cùng cấp với nó) */
  placeBook: (id: string, targetId: string, where: 'before' | 'after') => void
  setBookIcon: (id: string, icon: string | null) => void
  deleteBook: (id: string) => void

  ensureTag: (name: string) => string
  renameTag: (id: string, name: string) => void
  deleteTag: (id: string) => void

  saveTemplate: (fromNoteId: string) => string | null
  renameTemplate: (id: string, name: string) => void
  /** Đặt (hoặc bỏ, khi null) notebook mặc định của template */
  setTemplateBook: (id: string, bookId: string | null) => void
  deleteTemplate: (id: string) => void
}

// Nội dung ghi chú được lưu trễ một nhịp để không ghi DB theo từng phím gõ.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useStore = create<State>((set, get) => {
  const saveNoteNow = (id: string): void => {
    const timer = saveTimers.get(id)
    if (timer) clearTimeout(timer)
    saveTimers.delete(id)
    const note = get().notes[id]
    if (note) persist(note)
  }

  const saveNoteSoon = (id: string): void => {
    const timer = saveTimers.get(id)
    if (timer) clearTimeout(timer)
    saveTimers.set(
      id,
      setTimeout(() => saveNoteNow(id), SAVE_DELAY_MS)
    )
  }

  const putNote = (note: Note, immediate = true): void => {
    set((s) => ({ notes: { ...s.notes, [note._id]: note } }))
    if (immediate) saveNoteNow(note._id)
    else saveNoteSoon(note._id)
  }

  const putBook = (book: Book): void => {
    set((s) => ({ books: { ...s.books, [book._id]: book } }))
    persist(book)
  }

  const putTag = (tag: Tag): void => {
    set((s) => ({ tags: { ...s.tags, [tag._id]: tag } }))
    persist(tag)
  }

  const putTemplate = (template: Template): void => {
    set((s) => ({ templates: { ...s.templates, [template._id]: template } }))
    persist(template)
  }

  const ensureDefaultBook = (): string => {
    const { books, lastBookId } = get()
    if (lastBookId && books[lastBookId]) return lastBookId
    const first = Object.values(books).sort((a, b) => a.createdAt - b.createdAt)[0]
    if (first) return first._id
    return get().createBook('Inbox', null)
  }

  const descendantsOf = (id: string): string[] => {
    const all = Object.values(get().books)
    const out: string[] = []
    const walk = (parent: string): void => {
      for (const b of all) {
        if (b.parentId === parent) {
          out.push(b._id)
          walk(b._id)
        }
      }
    }
    walk(id)
    return out
  }

  const applyRemote = (id: string, doc: AnyDoc | null): void => {
    const key = id.startsWith('note:')
      ? 'notes'
      : id.startsWith('book:')
        ? 'books'
        : id.startsWith('tag:')
          ? 'tags'
          : id.startsWith('template:')
            ? 'templates'
            : null
    if (!key) return
    set((s) => {
      const table = s[key] as Record<string, AnyDoc>
      const local = table[id]
      if (!doc) {
        if (!local) return s
        const { [id]: _removed, ...rest } = table
        return { [key]: rest } as Partial<State>
      }
      // Bản trong bộ nhớ mới hơn (hoặc chính là bản vừa ghi) thì bỏ qua
      if (local && local.updatedAt >= doc.updatedAt) return s
      return { [key]: { ...table, [id]: doc } } as Partial<State>
    })
  }

  return {
    ...readPrefs(),
    ready: false,
    notes: {},
    books: {},
    tags: {},
    templates: {},
    query: '',
    distractionFree: false,
    prefsOpen: false,
    palette: null,
    multi: [],
    setMulti: (multi) => set({ multi }),
    notice: null,

    init: async () => {
      const docs = await loadAll()
      const notes: Record<string, Note> = {}
      const books: Record<string, Book> = {}
      const tags: Record<string, Tag> = {}
      const templates: Record<string, Template> = {}
      for (const doc of docs) {
        if (doc.type === 'note') notes[doc._id] = doc
        else if (doc.type === 'book') books[doc._id] = doc
        else if (doc.type === 'tag') tags[doc._id] = doc
        else if (doc.type === 'template') templates[doc._id] = doc
      }
      set({ notes, books, tags, templates })

      if (docs.length === 0) {
        const bookId = get().createBook('Inbox', null)
        const now = Date.now()
        const note: Note = {
          _id: newId('note'),
          type: 'note',
          title: WELCOME_TITLE,
          body: WELCOME_BODY,
          bookId,
          tags: [],
          status: 'none',
          pinned: false,
          trashed: false,
          createdAt: now,
          updatedAt: now
        }
        putNote(note)
        set({ selectedNoteId: note._id, viewMode: 'split' })
      }

      // Lựa chọn đã lưu có thể trỏ tới thứ không còn tồn tại
      const s = get()
      if (
        (s.selection.kind === 'book' && !s.books[s.selection.id]) ||
        (s.selection.kind === 'tag' && !s.tags[s.selection.id])
      ) {
        set({ selection: { kind: 'all' } })
      }

      watchChanges(applyRemote)
      set({ ready: true })
    },

    flush: () => {
      for (const id of [...saveTimers.keys()]) saveNoteNow(id)
    },

    select: (selection) => set({ selection, query: '', multi: [] }),
    selectNote: (id) => set({ selectedNoteId: id }),
    setQuery: (query) => set({ query, multi: [] }),
    setSort: (sort) => set({ sort }),
    setViewMode: (viewMode) => set({ viewMode }),
    toggleDistractionFree: () => set((s) => ({ distractionFree: !s.distractionFree })),
    toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
    setPrefsOpen: (prefsOpen) => set({ prefsOpen, palette: null }),
    setPalette: (palette) => set({ palette }),

    openNote: (id) => {
      const s = get()
      const note = s.notes[id]
      if (!note) return false
      if (note.trashed) {
        set({ selection: { kind: 'trash' }, query: '', selectedNoteId: id })
        return true
      }
      // Giữ nguyên sidebar nếu ghi chú vẫn hiện trong đó; nếu không thì về All Notes
      const visible = visibleNotes({ ...s, query: '' }).some((n) => n._id === id)
      set({ selection: visible && s.selection.kind !== 'trash' ? s.selection : { kind: 'all' }, query: '', selectedNoteId: id })
      return true
    },
    showNotice: (text, tone = 'info') => set({ notice: { text, tone, id: Date.now() } }),
    toggleBookCollapsed: (id) =>
      set((s) => {
        const next = { ...s.collapsedBooks }
        if (next[id]) delete next[id]
        else next[id] = true
        return { collapsedBooks: next }
      }),

    createNote: () => {
      const { selection } = get()
      const bookId = selection.kind === 'book' ? selection.id : ensureDefaultBook()
      const now = Date.now()
      const note: Note = {
        _id: newId('note'),
        type: 'note',
        title: '',
        body: '',
        bookId,
        tags: selection.kind === 'tag' ? [selection.id] : [],
        status: selection.kind === 'status' ? selection.status : 'none',
        pinned: false,
        trashed: false,
        createdAt: now,
        updatedAt: now
      }
      putNote(note)
      set((s) => ({
        selectedNoteId: note._id,
        query: '',
        lastBookId: bookId,
        selection: s.selection.kind === 'trash' ? { kind: 'all' } : s.selection,
        viewMode: s.viewMode === 'preview' ? 'edit' : s.viewMode
      }))
      return note._id
    },

    createNoteSilently: (title) => {
      const current = get().selectedNoteId ? get().notes[get().selectedNoteId!] : undefined
      const bookId = current && get().books[current.bookId] ? current.bookId : ensureDefaultBook()
      const now = Date.now()
      const note: Note = {
        _id: newId('note'),
        type: 'note',
        title: title.trim(),
        body: '',
        bookId,
        tags: [],
        status: 'none',
        pinned: false,
        trashed: false,
        createdAt: now,
        updatedAt: now
      }
      putNote(note)
      return note._id
    },

    updateNote: (id, patch) => {
      const note = get().notes[id]
      if (!note) return
      const next: Note = { ...note, ...patch, updatedAt: Date.now() }
      // Chỉ nội dung/tiêu đề mới cần lưu trễ; các thay đổi khác ghi ngay
      const typing = Object.keys(patch).every((k) => k === 'body' || k === 'title')
      putNote(next, !typing)
      if (patch.bookId) set({ lastBookId: patch.bookId })
    },

    duplicateNote: (id) => {
      const note = get().notes[id]
      if (!note) return
      const now = Date.now()
      const copy: Note = {
        ...note,
        _id: newId('note'),
        title: note.title ? `${note.title} (copy)` : '',
        pinned: false,
        createdAt: now,
        updatedAt: now
      }
      putNote(copy)
      set({ selectedNoteId: copy._id })
    },

    trashNote: (id) => {
      const note = get().notes[id]
      if (!note || note.trashed) return
      putNote({ ...note, trashed: true, pinned: false, updatedAt: Date.now() })
    },

    restoreNote: (id) => {
      const note = get().notes[id]
      if (!note) return
      const bookId = get().books[note.bookId] ? note.bookId : ensureDefaultBook()
      putNote({ ...note, trashed: false, bookId, updatedAt: Date.now() })
    },

    deleteNoteForever: (id) => {
      const timer = saveTimers.get(id)
      if (timer) clearTimeout(timer)
      saveTimers.delete(id)
      set((s) => {
        const { [id]: _removed, ...rest } = s.notes
        return { notes: rest, selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId }
      })
      erase(id)
    },

    emptyTrash: () => {
      for (const note of Object.values(get().notes)) {
        if (note.trashed) get().deleteNoteForever(note._id)
      }
    },

    createBook: (name, parentId) => {
      const now = Date.now()
      const book: Book = {
        _id: newId('book'),
        type: 'book',
        name: name.trim() || 'Untitled',
        parentId,
        createdAt: now,
        updatedAt: now
      }
      putBook(book)
      if (parentId && get().collapsedBooks[parentId]) get().toggleBookCollapsed(parentId)
      return book._id
    },

    renameBook: (id, name) => {
      const book = get().books[id]
      const trimmed = name.trim()
      if (!book || !trimmed || trimmed === book.name) return
      putBook({ ...book, name: trimmed, updatedAt: Date.now() })
    },

    placeBook: (id, targetId, where) => {
      const { books } = get()
      const book = books[id]
      const target = books[targetId]
      if (!book || !target || id === targetId) return
      const parentId = target.parentId && books[target.parentId] ? target.parentId : null
      // Không cho đặt notebook vào trong chính nó hoặc con cháu của nó
      if (parentId === id || (parentId && descendantsOf(id).includes(parentId))) return
      const siblings = (childrenByParent(books).get(parentId) ?? []).filter((b) => b._id !== id)
      const index = siblings.findIndex((b) => b._id === targetId) + (where === 'after' ? 1 : 0)
      siblings.splice(index, 0, book)
      const now = Date.now()
      // Chỉ ghi lại thứ tự cho nhóm notebook cùng cấp này
      siblings.forEach((b, order) => {
        const next = b._id === id ? { ...b, parentId, order } : { ...b, order }
        if (b.order !== order || (b._id === id && b.parentId !== parentId)) putBook({ ...next, updatedAt: now })
      })
    },

    setBookIcon: (id, icon) => {
      const book = get().books[id]
      if (!book) return
      const { icon: _old, ...rest } = book
      putBook({ ...rest, ...(icon ? { icon } : {}), updatedAt: Date.now() })
    },

    moveBook: (id, parentId) => {
      const book = get().books[id]
      if (!book || book.parentId === parentId || parentId === id) return
      // Không cho thả notebook vào chính con cháu của nó
      if (parentId && descendantsOf(id).includes(parentId)) return
      // Sang cấp mới thì bỏ thứ tự cũ (xếp theo tên cho tới khi được kéo sắp lại)
      const { order: _order, ...rest } = book
      putBook({ ...rest, parentId, updatedAt: Date.now() })
    },

    deleteBook: (id) => {
      const ids = new Set([id, ...descendantsOf(id)])
      const now = Date.now()
      // Ghi chú trong notebook bị xóa được chuyển vào thùng rác chứ không mất
      for (const note of Object.values(get().notes)) {
        if (ids.has(note.bookId) && !note.trashed) putNote({ ...note, trashed: true, pinned: false, updatedAt: now })
      }
      set((s) => {
        const books = { ...s.books }
        for (const bid of ids) delete books[bid]
        const selectionGone = s.selection.kind === 'book' && ids.has(s.selection.id)
        return {
          books,
          selection: selectionGone ? { kind: 'all' } : s.selection,
          lastBookId: s.lastBookId && ids.has(s.lastBookId) ? null : s.lastBookId
        }
      })
      for (const bid of ids) erase(bid)
    },

    ensureTag: (name) => {
      const trimmed = name.trim()
      const existing = Object.values(get().tags).find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
      if (existing) return existing._id
      const now = Date.now()
      const tag: Tag = {
        _id: newId('tag'),
        type: 'tag',
        name: trimmed,
        color: TAG_COLORS[Object.keys(get().tags).length % TAG_COLORS.length],
        createdAt: now,
        updatedAt: now
      }
      putTag(tag)
      return tag._id
    },

    renameTag: (id, name) => {
      const tag = get().tags[id]
      const trimmed = name.trim()
      if (!tag || !trimmed || trimmed === tag.name) return
      putTag({ ...tag, name: trimmed, updatedAt: Date.now() })
    },

    deleteTag: (id) => {
      const now = Date.now()
      for (const note of Object.values(get().notes)) {
        if (note.tags.includes(id)) putNote({ ...note, tags: note.tags.filter((t) => t !== id), updatedAt: now })
      }
      set((s) => {
        const { [id]: _removed, ...rest } = s.tags
        return { tags: rest, selection: s.selection.kind === 'tag' && s.selection.id === id ? { kind: 'all' } : s.selection }
      })
      erase(id)
    },

    saveTemplate: (fromNoteId) => {
      const note = get().notes[fromNoteId]
      if (!note) return null
      const now = Date.now()
      const template: Template = {
        _id: newId('template'),
        type: 'template',
        name: note.title.trim() || 'Untitled Template',
        title: note.title,
        body: note.body,
        tags: [...note.tags],
        status: note.status,
        createdAt: now,
        updatedAt: now
      }
      putTemplate(template)
      return template._id
    },

    setTemplateBook: (id, bookId) => {
      const template = get().templates[id]
      if (!template) return
      const { bookId: _old, ...rest } = template
      putTemplate({ ...rest, ...(bookId ? { bookId } : {}), updatedAt: Date.now() })
    },

    renameTemplate: (id, name) => {
      const template = get().templates[id]
      const trimmed = name.trim()
      if (!template || !trimmed || trimmed === template.name) return
      putTemplate({ ...template, name: trimmed, updatedAt: Date.now() })
    },

    deleteTemplate: (id) => {
      set((s) => {
        const { [id]: _removed, ...rest } = s.templates
        return { templates: rest }
      })
      erase(id)
    }
  }
})

// Lưu các tùy chọn giao diện giữa các lần mở app
useStore.subscribe((s) => {
  // Cửa sổ ghi chú riêng không ghi đè tùy chọn của cửa sổ chính
  if (noteWindowId) return
  const prefs: Prefs = {
    sort: s.sort,
    viewMode: s.viewMode,
    collapsedBooks: s.collapsedBooks,
    selection: s.selection,
    selectedNoteId: s.selectedNoteId,
    lastBookId: s.lastBookId,
    sidebarHidden: s.sidebarHidden
  }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage có thể không dùng được; bỏ qua vì đây chỉ là tiện ích
  }
})

export type { NoteStatus }
