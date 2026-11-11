import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Theme do người dùng tự viết: <userData>/themes/*.css
// CSS tùy chỉnh toàn app:      <userData>/styles.css
// Main chỉ đọc đúng hai chỗ này; renderer không thể yêu cầu đọc đường dẫn khác.

export interface UserTheme {
  id: string
  name: string
  base: 'mist' | 'night' | 'paper' | 'ink' | 'indigo' | 'stone'
  css: string
}

const BASES = ['mist', 'night', 'paper', 'ink', 'indigo', 'stone'] as const

const EXAMPLE = `/* name: Moss */
/* base: paper */
/*
 * Một theme mẫu. Theme kế thừa toàn bộ màu của "base" và chỉ ghi đè
 * những biến viết ở dưới. Sửa file này, hoặc tạo thêm file .css khác
 * trong thư mục này, rồi quay lại Nibmark là thấy thay đổi.
 *
 * Các biến hay dùng: --paper, --surface, --surface-2, --ink, --ink-2, --ink-3,
 * --line, --hover, --selected, --accent, --accent-soft, --code-bg, --mark,
 * --syn-keyword, --syn-string, --syn-number, --syn-function, --syn-type.
 */
--paper: #e9ede2;
--surface: #f1f4eb;
--surface-2: #f8faf4;
--code-bg: #e6eadc;
--accent: #4f7a3a;
--accent-soft: rgba(79, 122, 58, 0.13);
`

const STYLES_TEMPLATE = `/*
 * CSS tùy chỉnh của bạn. Áp dụng cho mọi theme.
 * Lưu file rồi quay lại Nibmark là thấy thay đổi.
 *
 * Ví dụ:
 *   .editor-host .cm-scroller { font-size: 15px; }
 *   .markdown-body { font-family: Georgia, serif; }
 */
`

export const themesDir = (): string => join(app.getPath('userData'), 'themes')
export const stylesFile = (): string => join(app.getPath('userData'), 'styles.css')

export function ensureThemesDir(): string {
  const dir = themesDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'moss.css'), EXAMPLE, 'utf8')
  }
  return dir
}

export function ensureStylesFile(): string {
  const file = stylesFile()
  if (!existsSync(file)) {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file, STYLES_TEMPLATE, 'utf8')
  }
  return file
}

export function listUserThemes(): UserTheme[] {
  const dir = ensureThemesDir()
  const themes: UserTheme[] = []
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.css')) continue
    const slug = file
      .slice(0, -4)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (!slug) continue
    try {
      const css = readFileSync(join(dir, file), 'utf8').slice(0, 200_000)
      const name = /\/\*\s*name:\s*([^*\n]+?)\s*\*\//i.exec(css)?.[1] ?? file.slice(0, -4)
      const base = /\/\*\s*base:\s*([a-z]+)\s*\*\//i.exec(css)?.[1]?.toLowerCase()
      themes.push({
        id: `user:${slug}`,
        name: name.slice(0, 60),
        base: (BASES as readonly string[]).includes(base ?? '') ? (base as UserTheme['base']) : 'paper',
        css
      })
    } catch {
      // file không đọc được thì bỏ qua
    }
  }
  return themes
}

export function readUserStyles(): string {
  try {
    return readFileSync(ensureStylesFile(), 'utf8').slice(0, 500_000)
  } catch {
    return ''
  }
}
