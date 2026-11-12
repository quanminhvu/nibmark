import { create } from 'zustand'
import { useEditorPrefs } from './editorPrefs'
import { useStore } from './store'
import { noteWindowId } from './windowMode'

// Tab ghi chú:
// - Bấm một lần vào ghi chú trong danh sách: chỉ xem, không tạo tab.
// - Bấm đúp (hoặc chuột giữa, "Open in New Tab"): đưa ghi chú lên hàng tab.
// - Tab đang chọn là tab của ghi chú đang mở (selectedNoteId), nếu ghi chú đó có tab.

export interface Tab {
  id: string
  /** false = tab tạm, sẽ bị thay khi mở ghi chú khác */
  keep: boolean
}

interface TabsState {
  tabs: Tab[]
  /** Tab vừa đóng (mới nhất ở cuối), để mở lại */
  closed: string[]
}

export const useTabs = create<TabsState>(() => ({ tabs: [], closed: [] }))

const KEY = 'nibmark:tabs'
const CLOSED_LIMIT = 20

export const tabsEnabled = (): boolean => !noteWindowId && useEditorPrefs.getState().tabs

const setTabs = (tabs: Tab[]): void => useTabs.setState({ tabs })

/** Chọn một ghi chú mà không đổi bộ lọc hay ô tìm kiếm của danh sách */
function activate(id: string | null): void {
  useStore.getState().setMulti([])
  useStore.getState().selectNote(id)
}

function insertAfterActive(tabs: Tab[], tab: Tab): Tab[] {
  const active = tabs.findIndex((t) => t.id === useStore.getState().selectedNoteId)
  const at = active >= 0 ? active + 1 : tabs.length
  return [...tabs.slice(0, at), tab, ...tabs.slice(at)]
}

/** Mở ở tab mới (giữ lại); background = không chuyển sang tab đó */
export function openInTab(id: string, background = false): void {
  const s = useStore.getState()
  if (!s.notes[id]) return
  const { tabs } = useTabs.getState()
  const existing = tabs.find((t) => t.id === id)
  if (existing) {
    if (!existing.keep) setTabs(tabs.map((t) => (t.id === id ? { ...t, keep: true } : t)))
  } else setTabs(insertAfterActive(tabs, { id, keep: true }))
  if (!background) activate(id)
}

function remember(ids: string[]): void {
  if (!ids.length) return
  const closed = [...useTabs.getState().closed.filter((x) => !ids.includes(x)), ...ids].slice(-CLOSED_LIMIT)
  useTabs.setState({ closed })
}

export function closeTab(id: string): void {
  const { tabs } = useTabs.getState()
  const index = tabs.findIndex((t) => t.id === id)
  if (index < 0) return
  const next = tabs.filter((t) => t.id !== id)
  setTabs(next)
  remember([id])
  if (useStore.getState().selectedNoteId === id) {
    // Đóng tab đang mở thì sang tab bên phải, hết thì sang tab bên trái
    activate((next[index] ?? next[index - 1])?.id ?? null)
  }
}

export function closeOtherTabs(id: string): void {
  const { tabs } = useTabs.getState()
  remember(tabs.filter((t) => t.id !== id).map((t) => t.id))
  setTabs(tabs.filter((t) => t.id === id))
  if (useStore.getState().selectedNoteId !== id) activate(id)
}

export function closeTabsToRight(id: string): void {
  const { tabs } = useTabs.getState()
  const index = tabs.findIndex((t) => t.id === id)
  if (index < 0) return
  const removed = tabs.slice(index + 1)
  remember(removed.map((t) => t.id))
  setTabs(tabs.slice(0, index + 1))
  if (removed.some((t) => t.id === useStore.getState().selectedNoteId)) activate(id)
}

/** Mở lại tab vừa đóng (bỏ qua ghi chú đã bị xóa hoặc vào thùng rác) */
export function reopenClosedTab(): boolean {
  const closed = [...useTabs.getState().closed]
  const notes = useStore.getState().notes
  while (closed.length) {
    const id = closed.pop()!
    if (notes[id] && !notes[id].trashed) {
      useTabs.setState({ closed })
      openInTab(id)
      return true
    }
  }
  useTabs.setState({ closed })
  return false
}

export function moveTab(id: string, toIndex: number): void {
  const tabs = [...useTabs.getState().tabs]
  const from = tabs.findIndex((t) => t.id === id)
  if (from < 0) return
  const [tab] = tabs.splice(from, 1)
  tabs.splice(Math.max(0, Math.min(tabs.length, from < toIndex ? toIndex - 1 : toIndex)), 0, tab)
  setTabs(tabs)
}

/** Ctrl+Tab / Ctrl+Shift+Tab: tab kế tiếp / tab trước (vòng lại đầu) */
export function cycleTab(step: 1 | -1): boolean {
  const { tabs } = useTabs.getState()
  if (tabs.length < 2) return false
  const index = tabs.findIndex((t) => t.id === useStore.getState().selectedNoteId)
  activate(tabs[(index + step + tabs.length) % tabs.length].id)
  return true
}

/** ⌘1…⌘8: tab thứ n; ⌘9: tab cuối */
export function gotoTab(n: number): boolean {
  const { tabs } = useTabs.getState()
  const tab = n === 9 ? tabs.at(-1) : tabs[n - 1]
  if (!tab) return false
  activate(tab.id)
  return true
}

// ── Theo dõi ghi chú đang mở ──

useStore.subscribe((s, prev) => {
  if (!s.ready || noteWindowId) return
  if (!prev.ready) restore()
  if (!tabsEnabled()) return
  let tabs = useTabs.getState().tabs
  const before = tabs

  if (s.notes !== prev.notes) {
    // Ghi chú bị xóa hoặc vừa chuyển vào thùng rác: đóng tab của nó
    tabs = tabs.filter((t) => {
      const note = s.notes[t.id]
      return !!note && !(note.trashed && prev.notes[t.id] && !prev.notes[t.id].trashed)
    })
  }

  if (tabs !== before) setTabs(tabs)
})

function restore(): void {
  const s = useStore.getState()
  let tabs: Tab[] = []
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (Array.isArray(saved)) {
      tabs = saved
        .filter((t): t is Tab => !!t && typeof t.id === 'string')
        // Bản cũ có "tab tạm": bỏ đi, chỉ giữ tab người dùng chủ động mở
        .filter((t) => s.notes[t.id] && !s.notes[t.id].trashed && t.keep !== false)
        .map((t) => ({ id: t.id, keep: true }))
    }
  } catch {
    // Dữ liệu lưu hỏng thì bắt đầu lại từ đầu
  }
  setTabs(tabs)
}

useTabs.subscribe((s, prev) => {
  if (s.tabs === prev.tabs || noteWindowId) return
  try {
    localStorage.setItem(KEY, JSON.stringify(s.tabs))
  } catch {
    // Không lưu được thì lần sau mở lại không có tab cũ
  }
})
