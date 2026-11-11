import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { isAbsolute, join } from 'node:path'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

// Cho phép chạy với một hồ sơ dữ liệu riêng (dùng khi thử nghiệm),
// để không bao giờ đụng vào ghi chú thật trong ~/Library/Application Support/Nibmark.
const customUserData = process.env['NIBMARK_USER_DATA']
if (customUserData && isAbsolute(customUserData)) app.setPath('userData', customUserData)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 520,
    show: false,
    title: 'Nibmark',
    backgroundColor: '#F4EFE6',
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
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Bản đóng gói đã có icon .icns; chỉ cần đặt icon Dock khi chạy dev
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
