import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FileText, Hash, Heading, LayoutTemplate, Notebook, Palette, Search, TerminalSquare } from 'lucide-react'
import { backupNow, exportNote, exportNotes, restoreFromBackup } from '@/lib/actions'
import { fuzzyMatch } from '@/lib/fuzzy'
import { useStore } from '@/lib/store'
import { allTemplates, applyTemplate } from '@/lib/templates'
import { BUILTIN_THEMES, useTheme } from '@/lib/theme'
import { STATUSES } from '@/lib/types'
import type { NoteStatus } from '@/lib/types'
import { cx, isMac, relativeTime } from '@/lib/util'
import { StatusIcon } from './StatusIcon'
import { openHistory } from './HistoryPanel'
import { copyId, copyNoteLink } from '@/lib/clipboard'
import {
  duplicateLine,
  getActiveEditor,
  joinLines,
  lowerCase,
  reverseLines,
  runEditorCommand,
  selectAllOccurrences,
  sortLines,
  sortLinesDesc,
  titleCase,
  uniqueLines,
  upperCase
} from '@/lib/editorCommands'

type Section = 'Commands' | 'Notes' | 'Notebooks' | 'Tags' | 'Status' | 'Themes' | 'Headings' | 'Templates'

interface Item {
  id: string
  section: Section
  label: string
  detail?: string
  shortcut?: string
  icon: React.ReactNode
  /** Từ khóa phụ để tìm, không hiển thị */
  keywords?: string
  run: () => void
  /** Xem thử khi đang chọn (dùng cho theme) */
  preview?: () => void
}

const mod = (): string => (isMac() ? '⌘' : 'Ctrl+')
const shift = (): string => (isMac() ? '⇧' : 'Shift+')

/** Nhảy tới một heading trong ghi chú đang mở (editor và preview tự lắng nghe). */
export function gotoHeading(line: number, index: number): void {
  window.dispatchEvent(new CustomEvent('nibmark-goto', { detail: { line, index } }))
}

function headingsOf(body: string): { text: string; level: number; line: number }[] {
  const out: { text: string; level: number; line: number }[] = []
  let fence = false
  body.split('\n').forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence
    if (fence) return
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (m) out.push({ text: m[2], level: m[1].length, line })
  })
  return out
}

function commandItems(): Item[] {
  const s = useStore.getState()
  const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
  const cmd = (id: string, label: string, run: () => void, shortcut?: string, keywords?: string): Item => ({
    id: `cmd:${id}`,
    section: 'Commands',
    label,
    shortcut,
    keywords,
    icon: <TerminalSquare size={15} />,
    run
  })
  const items: Item[] = [
    cmd('new-note', 'New Note', () => s.createNote(), `${mod()}N`, 'create add'),
    cmd('template', 'New Note from Template…', () => s.setPalette('templates'), `${mod()}T`, 'template'),
    cmd('search', 'Search Notes', () => document.querySelector<HTMLInputElement>('.search-box input')?.focus(), `${mod()}${shift()}F`, 'find filter'),
    cmd('preview', 'Toggle Preview', () => s.setViewMode(useStore.getState().viewMode === 'preview' ? 'edit' : 'preview'), `${mod()}E`),
    cmd('split', 'Toggle Side-by-Side View', () => s.setViewMode(useStore.getState().viewMode === 'split' ? 'edit' : 'split'), `${mod()}P`, 'split'),
    cmd('focus', 'Toggle Distraction-Free Mode', () => s.toggleDistractionFree(), `${mod()}${shift()}D`, 'focus zen fullscreen'),
    cmd('prefs', 'Open Preferences', () => s.setPrefsOpen(true), `${mod()},`, 'settings options'),
    cmd('export-all', 'Export All Notes as Markdown…', () => void exportNotes(null), undefined, 'save download'),
    cmd('backup', 'Back Up Now', () => void backupNow(), undefined, 'save'),
    cmd('restore', 'Restore from Backup…', () => void restoreFromBackup())
  ]
  if (note && !note.trashed) {
    items.push(
      cmd('pin', note.pinned ? 'Unpin Note' : 'Pin Note to Top', () => s.updateNote(note._id, { pinned: !note.pinned })),
      cmd('duplicate', 'Duplicate Note', () => s.duplicateNote(note._id), undefined, 'copy'),
      cmd('save-template', 'Save Note as Template', () => {
        if (s.saveTemplate(note._id)) s.showNotice(`Saved "${note.title || 'Untitled'}" as a template.`)
      }),
      cmd('export-note', 'Export Note as Markdown…', () => void exportNote(note._id)),
      cmd('copy-link', 'Copy Note Link', () => copyNoteLink(note._id), undefined, 'markdown reference'),
      cmd('copy-id', 'Copy Note ID', () => copyId(note._id)),
      cmd('history', 'Show Version History…', () => openHistory(note._id), undefined, 'revisions versions restore undo diff'),
      cmd('trash', 'Move Note to Trash', () => s.trashNote(note._id), undefined, 'delete remove'),
      cmd('status-none', 'Set Status: None', () => s.updateNote(note._id, { status: 'none' }), undefined, 'clear'),
      ...STATUSES.map((st) => cmd(`status-${st.id}`, `Set Status: ${st.label}`, () => s.updateNote(note._id, { status: st.id })))
    )
  }
  // Lệnh soạn thảo: chỉ khi đang có editor (không ở chế độ preview hay ghi chú trong thùng rác)
  if (getActiveEditor()) {
    const ed = (id: string, label: string, run: Parameters<typeof runEditorCommand>[0], shortcut?: string, keywords?: string): Item =>
      cmd(`editor-${id}`, label, () => runEditorCommand(run), shortcut, `editor ${keywords ?? ''}`)
    items.push(
      ed('sort', 'Sort Lines', sortLines, undefined, 'order alphabetical'),
      ed('sort-desc', 'Sort Lines Descending', sortLinesDesc, undefined, 'order reverse'),
      ed('reverse', 'Reverse Lines', reverseLines),
      ed('unique', 'Remove Duplicate Lines', uniqueLines, undefined, 'unique dedupe'),
      ed('join', 'Join Lines', joinLines, undefined, 'merge'),
      ed('duplicate', 'Duplicate Line', duplicateLine, `${shift()}⌥↓`, 'copy'),
      ed('upper', 'Transform to Uppercase', upperCase, undefined, 'case capital'),
      ed('lower', 'Transform to Lowercase', lowerCase, undefined, 'case small'),
      ed('title', 'Transform to Title Case', titleCase, undefined, 'case capitalize'),
      ed('occurrences', 'Select All Occurrences', selectAllOccurrences, `${mod()}${shift()}L`, 'multiple cursors')
    )
  }
  return items
}

function themeItems(): Item[] {
  const { userThemes, setChoice, preview } = useTheme.getState()
  return [
    { id: 'system', name: 'System' },
    ...BUILTIN_THEMES,
    ...userThemes
  ].map((t) => ({
    id: `theme:${t.id}`,
    section: 'Themes' as const,
    label: `Theme: ${t.name}`,
    detail: t.id === 'system' ? 'Match macOS appearance' : undefined,
    keywords: 'appearance color dark light',
    icon: <Palette size={15} />,
    run: () => setChoice(t.id),
    preview: () => preview(t.id)
  }))
}

function buildItems(mode: 'commands' | 'templates', raw: string): { items: Item[]; query: string } {
  const s = useStore.getState()

  if (mode === 'templates') {
    const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
    const items: Item[] = allTemplates().map((t) => ({
      id: t.id,
      section: 'Templates',
      label: t.name,
      detail: t.builtin ? 'Built-in' : 'Your template',
      icon: <LayoutTemplate size={15} />,
      run: () => applyTemplate(t)
    }))
    if (note && !note.trashed && (note.title || note.body)) {
      items.push({
        id: 'cmd:save-template',
        section: 'Commands',
        label: 'Save Current Note as Template',
        icon: <TerminalSquare size={15} />,
        run: () => {
          if (s.saveTemplate(note._id)) s.showNotice(`Saved "${note.title || 'Untitled'}" as a template.`)
        }
      })
    }
    return { items, query: raw }
  }

  const prefix = raw[0]
  const query = ['>', '@', '#', ':'].includes(prefix) ? raw.slice(1) : raw
  const notes = Object.values(s.notes)
    .filter((n) => !n.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<Item>((n) => ({
      id: n._id,
      section: 'Notes',
      label: n.title || 'Untitled',
      detail: `${s.books[n.bookId]?.name ?? ''} · ${relativeTime(n.updatedAt)}`,
      icon: n.status !== 'none' ? <StatusIcon status={n.status} size={15} /> : <FileText size={15} />,
      run: () => s.openNote(n._id)
    }))
  const books = Object.values(s.books)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((b) => ({
      id: b._id,
      section: 'Notebooks',
      label: b.name,
      detail: b.parentId && s.books[b.parentId] ? `in ${s.books[b.parentId].name}` : undefined,
      icon: <Notebook size={15} />,
      run: () => s.select({ kind: 'book', id: b._id })
    }))
  const tags = Object.values(s.tags)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((t) => ({
      id: t._id,
      section: 'Tags',
      label: t.name,
      icon: <Hash size={15} style={{ color: t.color }} />,
      run: () => s.select({ kind: 'tag', id: t._id })
    }))
  const statuses = STATUSES.map<Item>((st) => ({
    id: `status:${st.id}`,
    section: 'Status',
    label: st.label,
    icon: <StatusIcon status={st.id as NoteStatus} size={15} />,
    run: () => s.select({ kind: 'status', status: st.id })
  }))
  const current = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
  const headings = current
    ? headingsOf(current.body).map<Item>((h, index) => ({
        id: `heading:${h.line}`,
        section: 'Headings',
        label: `${'  '.repeat(h.level - 1)}${h.text}`,
        detail: `H${h.level}`,
        icon: <Heading size={15} />,
        run: () => gotoHeading(h.line, index)
      }))
    : []

  if (prefix === '>') return { items: [...commandItems(), ...themeItems()], query }
  if (prefix === '@') return { items: books, query }
  if (prefix === '#') return { items: tags, query }
  if (prefix === ':') return { items: headings, query }
  if (!query.trim()) {
    // Chưa gõ gì: ghi chú gần đây trước, rồi tới các lệnh hay dùng
    return { items: [...notes.slice(0, 8), ...commandItems().slice(0, 6)], query }
  }
  return { items: [...notes, ...commandItems(), ...books, ...tags, ...statuses, ...headings, ...themeItems()], query }
}

function Highlighted({ text, indices }: { text: string; indices: number[] }): React.JSX.Element {
  if (!indices.length) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="pal-hit">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}

export function CommandPalette(): React.JSX.Element | null {
  const mode = useStore((s) => s.palette)
  if (!mode) return null
  // key = mode để đổi chế độ thì làm mới toàn bộ ô nhập
  return <PaletteBody key={mode} mode={mode} />
}

function PaletteBody({ mode }: { mode: 'commands' | 'templates' }): React.JSX.Element {
  const [raw, setRaw] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<Element | null>(document.activeElement)
  const picked = useRef(false)

  const results = useMemo(() => {
    const { items, query } = buildItems(mode, raw)
    if (!query.trim()) return items.slice(0, 80).map((item) => ({ item, indices: [] as number[] }))
    return items
      .map((item) => {
        const m = fuzzyMatch(query, item.label) ?? (item.keywords && fuzzyMatch(query, item.keywords) ? { score: -5, indices: [] } : null)
        return m ? { item, indices: m.indices, score: m.score } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
  }, [mode, raw])

  const close = (): void => {
    useStore.getState().setPalette(null)
  }

  // Khi đóng: bỏ xem thử theme (nếu chưa chọn) và trả lại con trỏ cho chỗ cũ
  useEffect(() => {
    return () => {
      if (!picked.current) useTheme.getState().preview(null)
      // setTimeout thay vì requestAnimationFrame: rAF không chạy khi cửa sổ đang ở nền
      setTimeout(() => {
        const prev = returnFocus.current as HTMLElement | null
        if (useStore.getState().palette) return
        if (prev && document.contains(prev) && prev !== document.body) prev.focus()
        else document.querySelector<HTMLElement>('.cm-content')?.focus()
      }, 0)
    }
  }, [])

  useEffect(() => setActive(0), [raw])

  const current = results[active]?.item
  useEffect(() => {
    if (current?.preview) current.preview()
    else useTheme.getState().preview(null)
  }, [current])

  useLayoutEffect(() => {
    listRef.current?.querySelector('.pal-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item: Item | undefined): void => {
    if (!item) return
    picked.current = true
    close()
    // Chạy sau khi palette đóng để lệnh có thể mở palette khác (ví dụ chọn template)
    setTimeout(() => item.run(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(current)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  let lastSection: Section | null = null

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          {mode === 'templates' ? <LayoutTemplate size={16} /> : <Search size={16} />}
          <input
            autoFocus
            value={raw}
            spellCheck={false}
            placeholder={mode === 'templates' ? 'Choose a template…' : 'Search notes, commands, notebooks, tags…'}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="pal-list" ref={listRef}>
          {results.length === 0 && <div className="pal-empty">No matches</div>}
          {results.map(({ item, indices }, i) => {
            const header = item.section !== lastSection ? item.section : null
            lastSection = item.section
            return (
              <div key={item.id}>
                {header && <div className="pal-section">{header}</div>}
                <div
                  className={cx('pal-item', i === active && 'active')}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(item)}
                >
                  <span className="pal-icon">{item.icon}</span>
                  <span className="pal-label">
                    <Highlighted text={item.label} indices={indices} />
                  </span>
                  {item.detail && <span className="pal-detail">{item.detail}</span>}
                  {item.shortcut && <kbd className="pal-kbd">{item.shortcut}</kbd>}
                </div>
              </div>
            )
          })}
        </div>
        {mode === 'commands' && (
          <div className="pal-footer">
            <span>
              <kbd>&gt;</kbd> commands
            </span>
            <span>
              <kbd>@</kbd> notebooks
            </span>
            <span>
              <kbd>#</kbd> tags
            </span>
            <span>
              <kbd>:</kbd> headings
            </span>
            <span className="flex-1" />
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
