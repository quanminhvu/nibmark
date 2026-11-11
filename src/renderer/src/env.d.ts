/// <reference types="vite/client" />

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default plugin
}

declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

interface NibmarkSettings {
  backupEnabled: boolean
  backupDir: string
  isDefaultDir: boolean
  lastBackupAt: number | null
}

interface NibmarkBridge {
  platform: string
  settings: {
    get(): Promise<NibmarkSettings>
    setBackupEnabled(enabled: boolean): Promise<NibmarkSettings>
    chooseBackupDir(): Promise<NibmarkSettings>
    resetBackupDir(): Promise<NibmarkSettings>
  }
  backup: {
    write(upserts: unknown[], deletes: string[]): Promise<{ ok: boolean; written: number; error?: string }>
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    open(): Promise<string | null>
    /** null = người dùng hủy */
    pickAndRead(): Promise<{ docs: unknown[]; error?: string } | null>
  }
  exporter: {
    note(title: string, content: string): Promise<string | null>
    tree(label: string, files: { folders: string[]; name: string; content: string }[]): Promise<{ path: string; count: number } | null>
  }
  themes: {
    list(): Promise<{ id: string; name: string; base: 'paper' | 'ink' | 'indigo' | 'stone'; css: string }[]>
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    openFolder(): Promise<string | null>
    getUserStyles(): Promise<string>
    openUserStyles(): Promise<string | null>
  }
  onMenu(callback: (command: string) => void): () => void
}

interface Window {
  /** Không có khi chạy giao diện ngoài Electron (ví dụ bản xem thử trên trình duyệt) */
  nibmark?: NibmarkBridge
}
