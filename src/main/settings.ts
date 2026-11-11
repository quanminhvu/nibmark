import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

// Cài đặt do main process giữ (không để trong localStorage của renderer),
// để renderer không thể tự chỉ định đường dẫn ghi file.
export interface Settings {
  backupEnabled: boolean
  /** null = dùng thư mục mặc định */
  backupDir: string | null
  lastBackupAt: number | null
}

const defaults: Settings = { backupEnabled: true, backupDir: null, lastBackupAt: null }

const file = (): string => join(app.getPath('userData'), 'settings.json')

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>
    cache = {
      backupEnabled: typeof raw.backupEnabled === 'boolean' ? raw.backupEnabled : defaults.backupEnabled,
      backupDir: typeof raw.backupDir === 'string' && isAbsolute(raw.backupDir) ? raw.backupDir : null,
      lastBackupAt: typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null
    }
  } catch {
    cache = { ...defaults }
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  mkdirSync(app.getPath('userData'), { recursive: true })
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8')
  renameSync(tmp, file())
  return cache
}

export function defaultBackupDir(): string {
  return join(app.getPath('userData'), 'Backups')
}

export function backupDir(): string {
  return getSettings().backupDir ?? defaultBackupDir()
}
