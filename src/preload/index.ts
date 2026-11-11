import { contextBridge, ipcRenderer } from 'electron'

// Renderer chỉ gửi dữ liệu; mọi đường dẫn file đều do main process quyết định
// (thư mục sao lưu đã cấu hình, hoặc đường dẫn người dùng chọn qua hộp thoại).
contextBridge.exposeInMainWorld('nibmark', {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setBackupEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setBackupEnabled', enabled),
    chooseBackupDir: () => ipcRenderer.invoke('settings:chooseBackupDir'),
    resetBackupDir: () => ipcRenderer.invoke('settings:resetBackupDir')
  },
  backup: {
    write: (upserts: unknown[], deletes: string[]) => ipcRenderer.invoke('backup:write', upserts, deletes),
    open: () => ipcRenderer.invoke('backup:open'),
    pickAndRead: () => ipcRenderer.invoke('backup:pickAndRead')
  },
  exporter: {
    note: (title: string, content: string) => ipcRenderer.invoke('export:note', title, content),
    tree: (label: string, files: unknown[]) => ipcRenderer.invoke('export:tree', label, files)
  },
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    openFolder: () => ipcRenderer.invoke('themes:openFolder'),
    getUserStyles: () => ipcRenderer.invoke('styles:get'),
    openUserStyles: () => ipcRenderer.invoke('styles:open')
  },
  onMenu: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string): void => callback(command)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  }
})
