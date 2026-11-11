import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ExportFile {
  /** Tên các thư mục lồng nhau (theo notebook), chưa làm sạch */
  folders: string[]
  /** Tên file không có đuôi, chưa làm sạch */
  name: string
  content: string
}

/** Làm sạch tên file/thư mục cho macOS, Windows và Linux. */
export function safeName(raw: string, fallback = 'Untitled'): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  return cleaned || fallback
}

/** Tên không trùng trong một thư mục, so sánh không phân biệt hoa thường (APFS). */
export class NameAllocator {
  private used = new Map<string, Set<string>>()

  take(folderKey: string, base: string, ext = ''): string {
    let set = this.used.get(folderKey)
    if (!set) this.used.set(folderKey, (set = new Set()))
    let candidate = base
    for (let i = 2; set.has((candidate + ext).toLowerCase()); i++) candidate = `${base} ${i}`
    set.add((candidate + ext).toLowerCase())
    return candidate + ext
  }
}

/** Tạo thư mục con chưa tồn tại, ví dụ "Nibmark Export 2026-11-11 2". */
export function freshDir(parent: string, base: string): string {
  let dir = join(parent, base)
  for (let i = 2; existsSync(dir); i++) dir = join(parent, `${base} ${i}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function writeTree(root: string, files: ExportFile[]): number {
  const names = new NameAllocator()
  // Thư mục cũng phải không trùng tên với nhau, nhưng cùng một notebook thì dùng lại
  const folderPaths = new Map<string, string>()
  let count = 0
  for (const file of files) {
    let dir = root
    let key = ''
    for (const folder of file.folders) {
      const nextKey = `${key}/${folder}`
      let resolved = folderPaths.get(nextKey)
      if (!resolved) {
        resolved = join(dir, names.take(key, safeName(folder, 'Notebook')))
        folderPaths.set(nextKey, resolved)
      }
      dir = resolved
      key = nextKey
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, names.take(key, safeName(file.name), '.md')), file.content, 'utf8')
    count++
  }
  return count
}
