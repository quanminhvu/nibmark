import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { getSettings, updateSettings } from './settings'

// Phím tắt toàn cục "Quick Note": bấm ở bất cứ đâu để mở Nibmark với một ghi chú mới,
// kể cả khi app đang chạy nền và không còn cửa sổ nào.

export const DEFAULT_QUICK_NOTE = 'CommandOrControl+Alt+N'

export interface ShortcutStatus {
  accelerator: string
  registered: boolean
  error: string | null
  /** Bản thử nghiệm (NIBMARK_USER_DATA) không đăng ký phím tắt toàn cục */
  disabledForTesting: boolean
}

let current: string | null = null
let lastError: string | null = null
const readyContents = new Set<number>()
const pending = new Map<number, string[]>()

// Một hồ sơ thử nghiệm không được tranh phím tắt với app thật đang chạy
const testing = !!process.env['NIBMARK_USER_DATA'] && process.env['NIBMARK_ALLOW_GLOBAL_SHORTCUT'] !== '1'

/** Gửi lệnh cho renderer, chờ tới khi renderer báo sẵn sàng nếu cửa sổ vừa được mở */
function sendWhenReady(win: BrowserWindow, command: string): void {
  const id = win.webContents.id
  if (readyContents.has(id)) win.webContents.send('menu', command)
  else pending.set(id, [...(pending.get(id) ?? []), command])
}

export function registerShortcuts(getOrCreateWindow: () => BrowserWindow): void {
  ipcMain.on('renderer:ready', (event) => {
    const id = event.sender.id
    readyContents.add(id)
    event.sender.once('destroyed', () => readyContents.delete(id))
    for (const command of pending.get(id) ?? []) event.sender.send('menu', command)
    pending.delete(id)
  })

  const quickNote = (): void => {
    const win = getOrCreateWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    app.focus({ steal: true })
    win.focus()
    sendWhenReady(win, 'quick-note')
  }

  // Hồ sơ thử nghiệm: cho phép kịch bản kiểm thử gọi thẳng hành động ghi nhanh
  if (testing) (globalThis as { __nibmarkQuickNote?: () => void }).__nibmarkQuickNote = quickNote

  const apply = (accelerator: string): boolean => {
    if (current) globalShortcut.unregister(current)
    current = null
    lastError = null
    if (!accelerator || testing) return true
    try {
      if (globalShortcut.register(accelerator, quickNote)) {
        current = accelerator
        return true
      }
      lastError = 'Another app is already using this shortcut.'
    } catch {
      lastError = 'This key combination is not valid.'
    }
    return false
  }

  const status = (): ShortcutStatus => ({
    accelerator: getSettings().quickNoteShortcut,
    registered: current !== null,
    error: lastError,
    disabledForTesting: testing
  })

  apply(getSettings().quickNoteShortcut)

  ipcMain.handle('shortcuts:get', () => status())
  ipcMain.handle('shortcuts:set', (_e, accelerator: unknown) => {
    if (typeof accelerator !== 'string' || accelerator.length > 60) return status()
    const previous = getSettings().quickNoteShortcut
    if (apply(accelerator)) updateSettings({ quickNoteShortcut: accelerator })
    else {
      // Không đăng ký được thì giữ lại phím tắt cũ, nhưng vẫn báo lỗi cho người dùng
      const error = lastError
      apply(previous)
      lastError = error
      return { ...status(), accelerator }
    }
    return status()
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
}
