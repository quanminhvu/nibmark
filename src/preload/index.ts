import { contextBridge, ipcRenderer } from 'electron'

// Renderer chỉ gửi dữ liệu; mọi đường dẫn file đều do main process quyết định
// (thư mục sao lưu đã cấu hình, hoặc đường dẫn người dùng chọn qua hộp thoại).
contextBridge.exposeInMainWorld('nibmark', {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setBackupEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setBackupEnabled', enabled),
    chooseBackupDir: () => ipcRenderer.invoke('settings:chooseBackupDir'),
    resetBackupDir: () => ipcRenderer.invoke('settings:resetBackupDir'),
    setTray: (enabled: boolean) => ipcRenderer.invoke('settings:setTray', enabled)
  },
  backup: {
    write: (upserts: unknown[], deletes: string[]) => ipcRenderer.invoke('backup:write', upserts, deletes),
    open: () => ipcRenderer.invoke('backup:open'),
    pickAndRead: () => ipcRenderer.invoke('backup:pickAndRead'),
    missingFiles: (ids: string[]) => ipcRenderer.invoke('backup:missingFiles', ids),
    writeFile: (meta: unknown, bytes: Uint8Array) => ipcRenderer.invoke('backup:writeFile', meta, bytes)
  },
  exporter: {
    note: (title: string, content: string, attachments: unknown[] = []) => ipcRenderer.invoke('export:note', title, content, attachments),
    html: (title: string, html: string) => ipcRenderer.invoke('export:html', title, html),
    pdf: (title: string, html: string) => ipcRenderer.invoke('export:pdf', title, html),
    tree: (label: string, files: unknown[], attachments: unknown[] = []) => ipcRenderer.invoke('export:tree', label, files, attachments)
  },
  files: {
    open: (id: string, name: string, bytes: Uint8Array) => ipcRenderer.invoke('file:open', id, name, bytes)
  },
  web: {
    title: (url: string) => ipcRenderer.invoke('web:title', url),
    githubSnippet: (url: string) => ipcRenderer.invoke('web:githubSnippet', url)
  },
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  openNoteWindow: (id: string) => ipcRenderer.send('window:openNote', id),
  importer: {
    pick: () => ipcRenderer.invoke('import:pick'),
    appleNotes: () => ipcRenderer.invoke('import:appleNotes'),
    kindlePick: () => ipcRenderer.invoke('import:kindlePick')
  },
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    setAppearance: (mode: 'light' | 'dark' | 'system') => ipcRenderer.send('themes:appearance', mode),
    openFolder: () => ipcRenderer.invoke('themes:openFolder'),
    getUserStyles: () => ipcRenderer.invoke('styles:get'),
    openUserStyles: () => ipcRenderer.invoke('styles:open')
  },
  shortcuts: {
    get: (kind: 'quickNote' | 'toggleWindow' = 'quickNote') => ipcRenderer.invoke('shortcuts:get', kind),
    set: (accelerator: string, kind: 'quickNote' | 'toggleWindow' = 'quickNote') => ipcRenderer.invoke('shortcuts:set', accelerator, kind)
  },
  /** Renderer báo đã sẵn sàng nhận lệnh (dùng cho phím tắt ghi nhanh khi cửa sổ vừa mở) */
  ready: () => ipcRenderer.send('renderer:ready'),
  onMenu: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string): void => callback(command)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  }
})
