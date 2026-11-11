import { useStore } from './store'
import type { NoteStatus } from './types'
import { KANBAN_TEMPLATE } from './kanban'

export interface TemplateLike {
  id: string
  name: string
  title: string
  body: string
  /** Tên tag (template có sẵn) hoặc id tag (template của người dùng) */
  tagNames?: string[]
  tagIds?: string[]
  status: NoteStatus
  builtin: boolean
}

// Template có sẵn. Chỉ dùng biến {{...}} an toàn, không bao giờ chạy code.
export const BUILTIN_TEMPLATES: TemplateLike[] = [
  {
    id: 'builtin:daily',
    name: 'Daily Log',
    title: '{{date}} {{weekday}}',
    body: '## Focus\n\n- [ ] \n\n## Notes\n\n\n## Done today\n\n- \n',
    tagNames: ['daily'],
    status: 'none',
    builtin: true
  },
  {
    id: 'builtin:meeting',
    name: 'Meeting Notes',
    title: 'Meeting – {{date}}',
    body: '**When:** {{date}} {{time}}\n**Attendees:** \n\n## Agenda\n\n1. \n\n## Notes\n\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] \n',
    tagNames: ['meeting'],
    status: 'none',
    builtin: true
  },
  {
    id: 'builtin:bug',
    name: 'Bug Report',
    title: 'Bug: ',
    body: '## Summary\n\n\n## Steps to reproduce\n\n1. \n\n## Expected\n\n\n## Actual\n\n\n## Environment\n\n- Version: \n- OS: \n\n## Notes\n\n',
    tagNames: ['bug'],
    status: 'active',
    builtin: true
  },
  {
    id: 'builtin:plan',
    name: 'Project Plan',
    title: 'Plan: ',
    body: '## Goal\n\n\n## Why now\n\n\n## Scope\n\n- In: \n- Out: \n\n## Milestones\n\n- [ ] \n\n## Risks\n\n- \n\n## Open questions\n\n- \n',
    tagNames: ['plan'],
    status: 'active',
    builtin: true
  },
  {
    id: 'builtin:kanban',
    name: 'Kanban Board',
    title: 'Board: ',
    body: KANBAN_TEMPLATE,
    tagNames: ['board'],
    status: 'active',
    builtin: true
  },
  {
    id: 'builtin:learning',
    name: 'Learning Notes',
    title: '',
    body: '**Source:** \n**Date:** {{date}}\n\n## Key ideas\n\n- \n\n## Questions\n\n- \n\n## How I will use this\n\n',
    tagNames: ['learning'],
    status: 'none',
    builtin: true
  }
]

const pad = (n: number): string => String(n).padStart(2, '0')

/** Thay {{date}}, {{time}}… bằng giờ địa phương (không dùng giờ UTC). */
export function fillPlaceholders(text: string, now = new Date()): string {
  const values: Record<string, string> = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    year: String(now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    weekday: now.toLocaleDateString(undefined, { weekday: 'long' })
  }
  values.datetime = `${values.date} ${values.time}`
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => values[key.toLowerCase()] ?? all)
}

export function allTemplates(): TemplateLike[] {
  const user: TemplateLike[] = Object.values(useStore.getState().templates)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      id: t._id,
      name: t.name,
      title: t.title,
      body: t.body,
      tagIds: t.tags,
      status: t.status,
      builtin: false
    }))
  return [...user, ...BUILTIN_TEMPLATES]
}

/**
 * Dùng template: nếu ghi chú đang mở còn trống thì điền vào đó,
 * nếu không thì tạo ghi chú mới. Không bao giờ ghi đè nội dung đã có.
 */
export function applyTemplate(template: TemplateLike): void {
  const s = useStore.getState()
  const current = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
  const reuse = current && !current.trashed && !current.title.trim() && !current.body.trim()
  const noteId = reuse ? current._id : s.createNote()

  const tags = [
    ...(template.tagIds ?? []).filter((id) => useStore.getState().tags[id]),
    ...(template.tagNames ?? []).map((name) => useStore.getState().ensureTag(name))
  ]
  const existing = useStore.getState().notes[noteId]?.tags ?? []
  useStore.getState().updateNote(noteId, {
    title: fillPlaceholders(template.title),
    body: fillPlaceholders(template.body),
    tags: [...new Set([...existing, ...tags])],
    ...(template.status !== 'none' ? { status: template.status } : {})
  })
  useStore.getState().flush()

  // Đưa con trỏ vào chỗ cần điền: tiêu đề nếu còn trống, nếu không thì nội dung
  setTimeout(() => {
    const title = document.querySelector<HTMLInputElement>('.note-title')
    if (title && !title.value.trim()) title.focus()
    else if (title && /[:–-]\s*$/.test(title.value)) {
      title.focus()
      title.setSelectionRange(title.value.length, title.value.length)
    } else document.querySelector<HTMLElement>('.cm-content')?.focus()
  }, 0)
}
