import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { getSettings } from './settings'

// Windows/Linux: khi bật, đóng cửa sổ chính chỉ ẩn nó đi; Nibmark tiếp tục chạy ở khay
// hệ thống (để phím tắt ghi nhanh vẫn dùng được). macOS đã có sẵn hành vi này qua Dock.

let tray: Tray | null = null
let quitting = false

export const traySupported = process.platform !== 'darwin'
export const shouldHideOnClose = (): boolean => traySupported && getSettings().trayEnabled && !quitting

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png')
}

export function setupTray(actions: { show: () => void; quickNote: () => void }): void {
  app.on('before-quit', () => {
    quitting = true
  })
  applyTray(actions)
}

export function applyTray(actions: { show: () => void; quickNote: () => void }): void {
  const enabled = traySupported && getSettings().trayEnabled
  if (!enabled) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) return
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('Nibmark')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Nibmark', click: actions.show },
      { label: 'Quick Note', click: actions.quickNote },
      { type: 'separator' },
      { label: 'Quit Nibmark', click: () => app.quit() }
    ])
  )
  tray.on('click', actions.show)
}

/** Ẩn thay vì đóng khi đang chạy ở khay */
export function hideOnClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!shouldHideOnClose()) return
    event.preventDefault()
    win.hide()
  })
}
