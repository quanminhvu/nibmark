import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { getSettings, updateSettings } from './settings'
import type { Settings } from './settings'

// Phím tắt toàn cục:
// - "Quick Note": bấm ở bất cứ đâu để mở Nibmark với một ghi chú mới, kể cả khi app
//   đang chạy nền và không còn cửa sổ nào.
// - "Show/Hide": đưa Nibmark lên trước, hoặc ẩn đi nếu đang ở trước (mặc định tắt).

export const DEFAULT_QUICK_NOTE = 'CommandOrControl+Alt+N'

export type ShortcutKind = 'quickNote' | 'toggleWindow'

export interface ShortcutStatus {
  kind: ShortcutKind
  accelerator: string
  registered: boolean
  error: string | null
  /** Bản thử nghiệm (NIBMARK_USER_DATA) không đăng ký phím tắt toàn cục */
  disabledForTesting: boolean
}

const settingKey: Record<ShortcutKind, keyof Pick<Settings, 'quickNoteShortcut' | 'toggleShortcut'>> = {
  quickNote: 'quickNoteShortcut',
  toggleWindow: 'toggleShortcut'
}

const current: Record<ShortcutKind, string | null> = { quickNote: null, toggleWindow: null }
const lastError: Record<ShortcutKind, string | null> = { quickNote: null, toggleWindow: null }
const readyContents = new Set<number>()
const pending = new Map<number, string[]>()

// Một hồ sơ thử nghiệm không được tranh phím tắt với app thật đang chạy
const testing = !!process.env['NIBMARK_USER_DATA'] && process.env['NIBMARK_ALLOW_GLOBAL_SHORTCUT'] !== '1'

/** Gửi lệnh cho renderer, chờ tới khi renderer báo sẵn sàng nếu cửa sổ vừa được mở */
export function sendWhenReady(win: BrowserWindow, command: string): void {
  const id = win.webContents.id
  if (readyContents.has(id)) win.webContents.send('menu', command)
  else pending.set(id, [...(pending.get(id) ?? []), command])
}

function bringToFront(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  app.focus({ steal: true })
  win.focus()
}

export function registerShortcuts(getOrCreateWindow: () => BrowserWindow): { quickNote: () => void; toggleWindow: () => void } {
  ipcMain.on('renderer:ready', (event) => {
    const id = event.sender.id
    readyContents.add(id)
    event.sender.once('destroyed', () => readyContents.delete(id))
    for (const command of pending.get(id) ?? []) event.sender.send('menu', command)
    pending.delete(id)
  })

  const quickNote = (): void => {
    const win = getOrCreateWindow()
    bringToFront(win)
    sendWhenReady(win, 'quick-note')
  }

  const toggleWindow = (): void => {
    const win = getOrCreateWindow()
    if (win.isVisible() && win.isFocused() && !win.isMinimized()) {
      // macOS: ẩn cả app để con trỏ quay về app trước đó
      if (process.platform === 'darwin') app.hide()
      else win.hide()
    } else bringToFront(win)
  }

  // Hồ sơ thử nghiệm: cho phép kịch bản kiểm thử gọi thẳng các hành động
  if (testing) Object.assign(globalThis, { __nibmarkQuickNote: quickNote, __nibmarkToggleWindow: toggleWindow })

  const handlers: Record<ShortcutKind, () => void> = { quickNote, toggleWindow }

  const apply = (kind: ShortcutKind, accelerator: string): boolean => {
    const before = current[kind]
    if (before) globalShortcut.unregister(before)
    current[kind] = null
    lastError[kind] = null
    if (!accelerator || testing) return true
    const other = kind === 'quickNote' ? current.toggleWindow : current.quickNote
    if (other === accelerator) {
      lastError[kind] = 'This shortcut is already used by another Nibmark shortcut.'
      return false
    }
    try {
      if (globalShortcut.register(accelerator, handlers[kind])) {
        current[kind] = accelerator
        return true
      }
      lastError[kind] = 'Another app is already using this shortcut.'
    } catch {
      lastError[kind] = 'This key combination is not valid.'
    }
    return false
  }

  const status = (kind: ShortcutKind): ShortcutStatus => ({
    kind,
    accelerator: getSettings()[settingKey[kind]],
    registered: current[kind] !== null,
    error: lastError[kind],
    disabledForTesting: testing
  })

  apply('quickNote', getSettings().quickNoteShortcut)
  apply('toggleWindow', getSettings().toggleShortcut)

  const kindOf = (v: unknown): ShortcutKind => (v === 'toggleWindow' ? 'toggleWindow' : 'quickNote')

  ipcMain.handle('shortcuts:get', (_e, kind: unknown) => status(kindOf(kind)))
  ipcMain.handle('shortcuts:set', (_e, accelerator: unknown, kindArg: unknown) => {
    const kind = kindOf(kindArg)
    if (typeof accelerator !== 'string' || accelerator.length > 60) return status(kind)
    const previous = getSettings()[settingKey[kind]]
    if (apply(kind, accelerator)) updateSettings({ [settingKey[kind]]: accelerator })
    else {
      // Không đăng ký được thì giữ lại phím tắt cũ, nhưng vẫn báo lỗi cho người dùng
      const error = lastError[kind]
      apply(kind, previous)
      lastError[kind] = error
      return { ...status(kind), accelerator }
    }
    return status(kind)
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  return { quickNote, toggleWindow }
}
