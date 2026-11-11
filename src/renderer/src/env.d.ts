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

interface NibmarkImportScan {
  label: string
  docs: {
    folders: string[]
    name: string
    ext: string
    text: string
    created: number | null
    modified: number | null
    assets: Record<string, { name: string; mime: string; data: Uint8Array }>
  }[]
  skipped: { path: string; reason: string }[]
}

interface NibmarkShortcutStatus {
  accelerator: string
  registered: boolean
  error: string | null
  disabledForTesting: boolean
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
    pickAndRead(): Promise<{ docs: unknown[]; files: { meta: unknown; data: Uint8Array }[]; error?: string } | null>
    missingFiles(ids: string[]): Promise<string[]>
    writeFile(meta: unknown, bytes: Uint8Array): Promise<{ ok: boolean; written: number; error?: string }>
  }
  exporter: {
    note(title: string, content: string, attachments?: { name: string; data: Uint8Array }[]): Promise<string | null>
    tree(
      label: string,
      files: { folders: string[]; name: string; content: string }[],
      attachments?: { name: string; data: Uint8Array }[]
    ): Promise<{ path: string; count: number } | null>
  }
  files: {
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    open(id: string, name: string, bytes: Uint8Array): Promise<string | null>
  }
  themes: {
    list(): Promise<{ id: string; name: string; base: 'paper' | 'ink' | 'indigo' | 'stone'; css: string }[]>
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    openFolder(): Promise<string | null>
    getUserStyles(): Promise<string>
    openUserStyles(): Promise<string | null>
  }
  shortcuts: {
    get(): Promise<NibmarkShortcutStatus>
    set(accelerator: string): Promise<NibmarkShortcutStatus>
  }
  ready(): void
  /** Mở thư mục dữ liệu của app; trả về thông báo lỗi hoặc null */
  openDataFolder(): Promise<string | null>
  importer: {
    /** null = người dùng hủy */
    pick(): Promise<NibmarkImportScan | null>
  }
  onMenu(callback: (command: string) => void): () => void
}

interface Window {
  /** Không có khi chạy giao diện ngoài Electron (ví dụ bản xem thử trên trình duyệt) */
  nibmark?: NibmarkBridge
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}
