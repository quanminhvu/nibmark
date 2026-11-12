import { ensureTodayNoteSilently } from './dailyNote'
import { stripFrontMatter } from './kanban'
import { linkedNoteIds } from './markdown'
import { NOTE_LINK_PREFIX, noteIdFromUrl, noteLinkUrl } from './noteLinks'
import { matchesQuery, parseQuery } from './search'
import { getStatuses } from './statuses'
import { useStore } from './store'
import type { Book, Note, NoteStatus } from './types'
import { noteWindowId } from './windowMode'

// Công cụ MCP cho AI agent. Mọi thay đổi đi qua store như khi người dùng tự sửa:
// lịch sử phiên bản, backlink, tab, sao lưu đều cập nhật. "Xóa" chỉ chuyển vào thùng rác.

const MAX_TITLE = 500
const MAX_BODY = 1_000_000
const MAX_RESULTS = 100

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** Thay đổi dữ liệu: chỉ có khi người dùng cho phép sửa */
  write?: boolean
  annotations?: Record<string, unknown>
}

const str = (description: string): Record<string, unknown> => ({ type: 'string', description })
const strList = (description: string): Record<string, unknown> => ({ type: 'array', items: { type: 'string' }, description })
const NOTE_REF = str('Note id (as returned by search_notes, e.g. "note:1a2b…"), a nibmark://note/… link, or the exact note title')

const TOOLS: ToolDef[] = [
  {
    name: 'search_notes',
    description:
      'Search notes in Nibmark. Query syntax: words match title and body; "exact phrase"; title:x, body:x; book:x (notebook), tag:x, status:x; prefix any term with - to exclude. An empty query lists the most recently edited notes. Trashed notes are never returned.',
    inputSchema: { type: 'object', properties: { query: str('Search query (may be empty)'), limit: { type: 'number', description: 'Maximum results (default 20, max 100)' } } },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'read_note',
    description: 'Read one note: its Markdown body plus title, notebook, tags, status and dates.',
    inputSchema: { type: 'object', properties: { note: NOTE_REF }, required: ['note'] },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_notebooks',
    description: 'List notebooks (with their full path and note counts).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_tags',
    description: 'List tags with note counts.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'list_statuses',
    description: 'List the statuses a note can have (e.g. Active, On Hold, Completed, Dropped, plus custom ones).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'get_backlinks',
    description: 'List the notes that link to a note.',
    inputSchema: { type: 'object', properties: { note: NOTE_REF }, required: ['note'] },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'create_note',
    description:
      'Create a note. The body is Markdown. To link to another note use [Title](nibmark://note/<id without "note:">). Returns the new note id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Note title'),
        body: str('Markdown body'),
        notebook: str('Notebook name or path like "Work/Projects" (must exist; default: Inbox or the notebook in use)'),
        tags: strList('Tag names; missing tags are created'),
        status: str('Status name, e.g. Active, On Hold, Completed, Dropped')
      },
      required: ['title']
    },
    write: true
  },
  {
    name: 'append_to_note',
    description: "Append Markdown to the end of a note. Without a note, appends to today's daily note (created from the daily template if needed).",
    inputSchema: { type: 'object', properties: { note: NOTE_REF, text: str('Markdown to append') }, required: ['text'] },
    write: true
  },
  {
    name: 'edit_note',
    description:
      'Replace an exact piece of text in a note body with new text. old_text must appear exactly once unless replace_all is true. Prefer this over rewriting the whole body.',
    inputSchema: {
      type: 'object',
      properties: { note: NOTE_REF, old_text: str('Exact text to find'), new_text: str('Replacement text'), replace_all: { type: 'boolean', description: 'Replace every occurrence' } },
      required: ['note', 'old_text', 'new_text']
    },
    write: true
  },
  {
    name: 'update_note',
    description:
      'Change a note: title, whole body, notebook, tags (replace, add or remove), status or pinned. Only the given fields change.',
    inputSchema: {
      type: 'object',
      properties: {
        note: NOTE_REF,
        title: str('New title'),
        body: str('New Markdown body (replaces the whole body)'),
        notebook: str('Move to this notebook (name or path; must exist)'),
        tags: strList('Replace all tags with these'),
        add_tags: strList('Tags to add'),
        remove_tags: strList('Tags to remove'),
        status: str('New status name, or "none"'),
        pinned: { type: 'boolean', description: 'Pin to the top of the list' }
      },
      required: ['note']
    },
    write: true
  },
  {
    name: 'trash_note',
    description: 'Delete a note by moving it to the Trash (it can be restored with restore_note). Notes are never deleted permanently.',
    inputSchema: { type: 'object', properties: { note: NOTE_REF }, required: ['note'] },
    write: true,
    annotations: { destructiveHint: true }
  },
  {
    name: 'restore_note',
    description: 'Restore a note from the Trash.',
    inputSchema: { type: 'object', properties: { note: NOTE_REF }, required: ['note'] },
    write: true
  }
]

class ToolError extends Error {}

const state = (): ReturnType<typeof useStore.getState> => useStore.getState()

function bookPath(book: Book | undefined, books: Record<string, Book>): string {
  const parts: string[] = []
  let current = book
  for (let i = 0; current && i < 20; i++) {
    parts.unshift(current.name)
    current = current.parentId ? books[current.parentId] : undefined
  }
  return parts.join('/')
}

function text(args: Record<string, unknown>, key: string, max: number, required = false): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) {
    if (required) throw new ToolError(`Missing "${key}".`)
    return undefined
  }
  if (typeof value !== 'string') throw new ToolError(`"${key}" must be a string.`)
  if (value.length > max) throw new ToolError(`"${key}" is too long (max ${max} characters).`)
  return value
}

function list(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new ToolError(`"${key}" must be a list of strings.`)
  return (value as string[]).map((v) => v.trim()).filter(Boolean).slice(0, 50)
}

/** Tìm ghi chú theo id, link nibmark://note/…, hoặc đúng tiêu đề (ghi chú sửa gần nhất nếu trùng) */
function findNote(ref: unknown, includeTrashed = false): Note {
  if (typeof ref !== 'string' || !ref.trim()) throw new ToolError('Missing "note".')
  const notes = state().notes
  const raw = ref.trim()
  const id = raw.startsWith(NOTE_LINK_PREFIX) ? noteIdFromUrl(raw) : raw.startsWith('note:') ? raw : `note:${raw}`
  const byId = id ? notes[id] : undefined
  if (byId && (includeTrashed || !byId.trashed)) return byId
  const byTitle = Object.values(notes)
    .filter((n) => (includeTrashed || !n.trashed) && n.title.trim().toLowerCase() === raw.toLowerCase())
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (byTitle) return byTitle
  if (byId?.trashed) throw new ToolError(`Note "${raw}" is in the Trash. Use restore_note first.`)
  throw new ToolError(`No note matches "${raw}". Use search_notes to find its id.`)
}

function findBook(name: string): string {
  const s = state()
  const target = name.trim().replace(/^\/+|\/+$/g, '').toLowerCase()
  const books = Object.values(s.books)
  const match = books.find((b) => bookPath(b, s.books).toLowerCase() === target) ?? books.filter((b) => b.name.toLowerCase() === target)[0]
  if (!match) throw new ToolError(`No notebook named "${name}". Available: ${books.map((b) => bookPath(b, s.books)).join(', ') || '(none)'}.`)
  return match._id
}

function findStatus(name: string): NoteStatus {
  const target = name.trim().toLowerCase().replace(/[\s_-]/g, '')
  if (!target || target === 'none' || target === 'nostatus') return 'none'
  const found = getStatuses().find((s) => s.label.toLowerCase().replace(/[\s_-]/g, '') === target || s.id.toLowerCase() === target)
  if (!found) throw new ToolError(`Unknown status "${name}". Available: ${getStatuses().map((s) => s.label).join(', ')}.`)
  return found.id
}

function tagIds(names: string[]): string[] {
  return names.map((n) => state().ensureTag(n.replace(/^#/, '')))
}

function describe(note: Note): Record<string, unknown> {
  const s = state()
  return {
    id: note._id,
    title: note.title || 'Untitled',
    notebook: bookPath(s.books[note.bookId], s.books) || null,
    tags: note.tags.map((id) => s.tags[id]?.name).filter(Boolean),
    status: note.status === 'none' ? null : getStatuses().find((x) => x.id === note.status)?.label ?? null,
    pinned: note.pinned,
    trashed: note.trashed,
    link: noteLinkUrl(note._id),
    created: new Date(note.createdAt).toISOString(),
    updated: new Date(note.updatedAt).toISOString()
  }
}

function snippet(note: Note, words: string[]): string {
  const body = stripFrontMatter(note.body).replace(/\s+/g, ' ').trim()
  const lower = body.toLowerCase()
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const from = Math.max(0, at - 60)
  return (from > 0 ? '…' : '') + body.slice(from, from + 220) + (from + 220 < body.length ? '…' : '')
}

const json = (value: unknown): string => JSON.stringify(value, null, 2)

/** Tên agent cho thông báo trong app (vd "claude-code" → "Claude") */
function clientLabel(client: string): string {
  if (/claude/i.test(client)) return 'Claude'
  if (/cursor/i.test(client)) return 'Cursor'
  return client.trim() || 'An AI agent'
}

function notify(client: string, verb: string, note: Note): void {
  state().showNotice(`${clientLabel(client)} ${verb} “${note.title || 'Untitled'}”.`)
}

function run(tool: string, args: Record<string, unknown>, client: string): string {
  const s = state()
  switch (tool) {
    case 'search_notes': {
      const query = text(args, 'query', 1000) ?? ''
      const limit = Math.max(1, Math.min(MAX_RESULTS, typeof args.limit === 'number' ? Math.floor(args.limit) : 20))
      const terms = parseQuery(query)
      const found = Object.values(s.notes)
        .filter((n) => !n.trashed && (!terms.length || matchesQuery(n, terms, s)))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      const words = terms.filter((t) => !t.negate && (t.field === 'any' || t.field === 'body')).map((t) => t.value)
      return json({ total: found.length, notes: found.slice(0, limit).map((n) => ({ ...describe(n), snippet: snippet(n, words) })) })
    }
    case 'read_note': {
      const note = findNote(args.note, true)
      return `${json(describe(note))}\n\n---\n\n${note.body}`
    }
    case 'list_notebooks': {
      const counts = new Map<string, number>()
      for (const n of Object.values(s.notes)) if (!n.trashed) counts.set(n.bookId, (counts.get(n.bookId) ?? 0) + 1)
      return json(Object.values(s.books).map((b) => ({ id: b._id, name: b.name, path: bookPath(b, s.books), notes: counts.get(b._id) ?? 0 })))
    }
    case 'list_tags': {
      const counts = new Map<string, number>()
      for (const n of Object.values(s.notes)) if (!n.trashed) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
      return json(Object.values(s.tags).map((t) => ({ name: t.name, notes: counts.get(t._id) ?? 0 })))
    }
    case 'list_statuses':
      return json(getStatuses().map((x) => x.label))
    case 'get_backlinks': {
      const note = findNote(args.note, true)
      const links = Object.values(s.notes).filter((n) => !n.trashed && n._id !== note._id && linkedNoteIds(n.body).has(note._id))
      return json(links.map(describe))
    }
    case 'create_note': {
      const title = text(args, 'title', MAX_TITLE, true)!.trim()
      const body = text(args, 'body', MAX_BODY) ?? ''
      const notebook = text(args, 'notebook', 300)
      const status = text(args, 'status', 100)
      const tags = list(args, 'tags')
      // Kiểm tra hết trước khi tạo, để lỗi không để lại ghi chú dở dang
      const bookId = notebook ? findBook(notebook) : undefined
      const statusId = status ? findStatus(status) : undefined
      const id = s.createNoteSilently(title)
      state().updateNote(id, {
        body,
        ...(bookId ? { bookId } : {}),
        ...(statusId ? { status: statusId } : {}),
        ...(tags ? { tags: [...new Set(tagIds(tags))] } : {})
      })
      const note = state().notes[id]!
      notify(client, 'created', note)
      return json({ created: describe(note) })
    }
    case 'append_to_note': {
      const addition = text(args, 'text', MAX_BODY, true)!
      // Lấy id trước rồi mới đọc store: ghi chú hôm nay có thể vừa được tạo
      const noTarget = args.note === undefined || args.note === null || args.note === ''
      const todayId = noTarget ? ensureTodayNoteSilently() : null
      const note = todayId ? state().notes[todayId] : findNote(args.note)
      if (!note) throw new ToolError("Could not open today's note.")
      const base = note.body.replace(/\s+$/, '')
      const body = base ? `${base}\n\n${addition.trim()}\n` : `${addition.trim()}\n`
      if (body.length > MAX_BODY) throw new ToolError('The note would become too long.')
      state().updateNote(note._id, { body })
      notify(client, 'added to', note)
      return json({ updated: describe(state().notes[note._id]!) })
    }
    case 'edit_note': {
      const note = findNote(args.note)
      const oldText = text(args, 'old_text', MAX_BODY, true)!
      const newText = text(args, 'new_text', MAX_BODY, true)!
      if (!oldText) throw new ToolError('"old_text" must not be empty.')
      const count = note.body.split(oldText).length - 1
      if (count === 0) throw new ToolError('old_text was not found in the note. Read the note again and copy the text exactly.')
      if (count > 1 && args.replace_all !== true) throw new ToolError(`old_text appears ${count} times. Add more surrounding text, or set replace_all to true.`)
      const body = args.replace_all === true ? note.body.split(oldText).join(newText) : note.body.replace(oldText, () => newText)
      if (body.length > MAX_BODY) throw new ToolError('The note would become too long.')
      state().updateNote(note._id, { body })
      notify(client, 'edited', note)
      return json({ updated: describe(state().notes[note._id]!), replaced: args.replace_all === true ? count : 1 })
    }
    case 'update_note': {
      const note = findNote(args.note)
      const patch: Partial<Note> = {}
      const title = text(args, 'title', MAX_TITLE)
      const body = text(args, 'body', MAX_BODY)
      const notebook = text(args, 'notebook', 300)
      const status = text(args, 'status', 100)
      if (title !== undefined) patch.title = title.trim()
      if (body !== undefined) patch.body = body
      if (notebook !== undefined) patch.bookId = findBook(notebook)
      if (status !== undefined) patch.status = findStatus(status)
      if (typeof args.pinned === 'boolean') patch.pinned = args.pinned
      const replace = list(args, 'tags')
      const add = list(args, 'add_tags')
      const remove = list(args, 'remove_tags')
      if (replace || add || remove) {
        let ids = replace ? tagIds(replace) : [...note.tags]
        if (add) ids = [...ids, ...tagIds(add)]
        if (remove) {
          const drop = new Set(remove.map((n) => n.replace(/^#/, '').toLowerCase()))
          ids = ids.filter((id) => !drop.has((state().tags[id]?.name ?? '').toLowerCase()))
        }
        patch.tags = [...new Set(ids)]
      }
      if (!Object.keys(patch).length) throw new ToolError('Nothing to change: give at least one field.')
      state().updateNote(note._id, patch)
      notify(client, 'updated', note)
      return json({ updated: describe(state().notes[note._id]!) })
    }
    case 'trash_note': {
      const note = findNote(args.note)
      state().trashNote(note._id)
      notify(client, 'moved to the Trash', note)
      return json({ trashed: describe(state().notes[note._id]!) })
    }
    case 'restore_note': {
      const note = findNote(args.note, true)
      if (!note.trashed) return json({ restored: describe(note), note: 'The note was not in the Trash.' })
      state().restoreNote(note._id)
      notify(client, 'restored', note)
      return json({ restored: describe(state().notes[note._id]!) })
    }
    default:
      throw new ToolError(`Unknown tool "${tool}".`)
  }
}

const RESOURCE_LIMIT = 100

/** Xử lý một yêu cầu MCP từ main */
export async function handleMcp(op: string, tool: string, rawArgs: unknown, allowEdits: boolean, client: string): Promise<unknown> {
  if (op === 'list') {
    return TOOLS.filter((t) => allowEdits || !t.write).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) }))
  }
  if (op === 'resources') {
    return Object.values(state().notes)
      .filter((n) => !n.trashed)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, RESOURCE_LIMIT)
      .map((n) => ({ uri: noteLinkUrl(n._id), name: n.title || 'Untitled', mimeType: 'text/markdown' }))
  }
  if (op === 'read') {
    const uri = typeof (rawArgs as { uri?: unknown })?.uri === 'string' ? (rawArgs as { uri: string }).uri : ''
    const note = findNote(uri, true)
    return { uri: noteLinkUrl(note._id), mimeType: 'text/markdown', text: `# ${note.title || 'Untitled'}\n\n${note.body}` }
  }
  const def = TOOLS.find((t) => t.name === tool)
  if (!def) return { isError: true, text: `Unknown tool "${tool}".` }
  if (def.write && !allowEdits) return { isError: true, text: 'Editing is turned off. The user can allow it in Nibmark → Preferences → AI Agents (MCP).' }
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {}
  try {
    return { isError: false, text: run(tool, args, client) }
  } catch (err) {
    if (err instanceof ToolError) return { isError: true, text: err.message }
    throw err
  }
}

/** Gắn bộ xử lý MCP ở cửa sổ chính, sau khi dữ liệu đã nạp xong */
export function startMcpBridge(): () => void {
  if (noteWindowId || !window.nibmark?.mcp) return () => {}
  let stop: (() => void) | null = null
  const attach = (): void => {
    if (!stop) stop = window.nibmark!.mcp.serve(handleMcp)
  }
  if (state().ready) attach()
  const unsubscribe = useStore.subscribe((s) => {
    if (s.ready) attach()
  })
  return () => {
    unsubscribe()
    stop?.()
  }
}
