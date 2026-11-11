import { app, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export type MenuCommand = 'preferences' | 'new-note' | 'export-note' | 'export-all' | 'backup-now' | 'restore'

const send = (command: MenuCommand) => (): void => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu', command)
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
        { label: 'Export Note as Markdown…', click: send('export-note') },
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
