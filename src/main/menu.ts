import { app, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { getMainWindow } from './windows'

export type MenuCommand = 'preferences' | 'new-note' | 'import' | 'export-note' | 'export-all' | 'backup-now' | 'restore' | 'back' | 'forward' | 'import-apple-notes' | 'import-kindle' | 'export-html'

const send = (command: MenuCommand) => (): void => {
  // Lệnh menu luôn chạy ở cửa sổ chính (cửa sổ ghi chú riêng không có danh sách ghi chú)
  const win = getMainWindow() ?? BrowserWindow.getFocusedWindow()
  if (!win) return
  win.show()
  win.webContents.send('menu', command)
}

// Lưu ý: không gán phím tắt cho những lệnh renderer đã tự xử lý
// (Cmd+N, Cmd+E, Cmd+P, Cmd+Shift+D, Cmd+Shift+F), tránh chạy hai lần.
export function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const prefs: MenuItemConstructorOptions = { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: send('preferences') }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              prefs,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ] as MenuItemConstructorOptions[]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', click: send('new-note') },
        { type: 'separator' },
        { label: 'Import…', click: send('import') },
        ...(isMac ? ([{ label: 'Import from Apple Notes…', click: send('import-apple-notes') }] as MenuItemConstructorOptions[]) : []),
        { label: 'Import Kindle Highlights…', click: send('import-kindle') },
        { type: 'separator' },
        { label: 'Export Note as Markdown…', click: send('export-note') },
        { label: 'Export Note as HTML…', click: send('export-html') },
        { label: 'Export All Notes as Markdown…', click: send('export-all') },
        { type: 'separator' },
        { label: 'Back Up Now', click: send('backup-now') },
        { label: 'Restore from Backup…', click: send('restore') },
        ...(isMac ? [] : ([{ type: 'separator' }, prefs, { type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
        ...(isMac ? ([{ type: 'separator' }, { role: 'close' }] as MenuItemConstructorOptions[]) : [])
      ]
    },
    // Bắt buộc phải có: thiếu các role này thì Cmd+C/V/Z không chạy trong editor trên macOS
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        ...(app.isPackaged ? [] : ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[])),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
