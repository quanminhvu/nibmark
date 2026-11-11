import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { isAbsolute, join, resolve } from 'node:path'
import { registerIpc } from './ipc'
import { getMainWindow, setMainWindow } from './windows'
import { buildMenu } from './menu'
import { registerShortcuts } from './shortcuts'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

// Cho phép chạy với một hồ sơ dữ liệu riêng (dùng khi thử nghiệm),
// để không bao giờ đụng vào ghi chú thật trong ~/Library/Application Support/Nibmark.
// Hồ sơ dữ liệu riêng (dùng khi test). Đường dẫn tương đối được đổi thành tuyệt đối:
// bỏ qua nó thì app sẽ lặng lẽ chạy trên dữ liệu thật của người dùng.
const customUserData = process.env['NIBMARK_USER_DATA']
if (customUserData) app.setPath('userData', isAbsolute(customUserData) ? customUserData : resolve(customUserData))

/** Cửa sổ của từng ghi chú mở riêng (⌘⇧N), theo id ghi chú */
const noteWindows = new Map<string, BrowserWindow>()

export function openNoteWindow(noteId: string): void {
  const existing = noteWindows.get(noteId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const win = createWindow(noteId)
  noteWindows.set(noteId, win)
  win.on('closed', () => noteWindows.delete(noteId))
}

function createWindow(noteId?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: noteId ? 820 : 1280,
    height: noteId ? 760 : 800,
    minWidth: noteId ? 420 : 880,
    minHeight: noteId ? 360 : 520,
    show: false,
    title: 'Nibmark',
    // macOS: sidebar trong mờ (vibrancy) cần nền cửa sổ trong suốt
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const, backgroundColor: '#00000000' }
      : { backgroundColor: '#F4EFE6' }),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Link ngoài mở bằng trình duyệt mặc định, không mở trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  if (isDev) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'] as string)
    if (noteId) url.searchParams.set('note', noteId)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), noteId ? { query: { note: noteId } } : undefined)
  }
  if (!noteId) {
    setMainWindow(win)
    // macOS: vuốt ba ngón (nếu bật trong cài đặt trackpad) để back/forward
    win.on('swipe', (_e, direction) => {
      if (direction === 'left' || direction === 'right') win.webContents.send('menu', direction === 'right' ? 'back' : 'forward')
    })
  }
  return win
}

/** Cửa sổ chính; trên macOS app có thể đang chạy mà không còn cửa sổ nào */
function getOrCreateWindow(): BrowserWindow {
  return getMainWindow() ?? createWindow()
}

app.whenReady().then(() => {
  // Bản đóng gói đã có icon .icns; chỉ cần đặt icon Dock khi chạy dev
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }
  registerIpc(openNoteWindow)
  buildMenu()
  createWindow()
  registerShortcuts(getOrCreateWindow)
  app.on('activate', () => {
    if (!getMainWindow()) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
