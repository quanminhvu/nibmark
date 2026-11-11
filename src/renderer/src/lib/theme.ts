import { create } from 'zustand'

export type BaseThemeId = 'paper' | 'ink' | 'indigo' | 'stone'

export interface ThemeInfo {
  id: string
  name: string
  dark: boolean
  /** Theme có sẵn mà theme này dựa trên */
  base: BaseThemeId
  css?: string
}

export const BUILTIN_THEMES: ThemeInfo[] = [
  { id: 'paper', name: 'Paper', dark: false, base: 'paper' },
  { id: 'stone', name: 'Stone', dark: false, base: 'stone' },
  { id: 'ink', name: 'Ink', dark: true, base: 'ink' },
  { id: 'indigo', name: 'Indigo', dark: true, base: 'indigo' }
]

const DARK_BASES: BaseThemeId[] = ['ink', 'indigo']
const KEY = 'nibmark:theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

/** 'system' = Paper khi macOS sáng, Ink khi macOS tối */
export type ThemeChoice = string

function readChoice(): ThemeChoice {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

interface ThemeState {
  choice: ThemeChoice
  userThemes: ThemeInfo[]
  /** Theme đang hiển thị (đã quy đổi 'system') */
  active: ThemeInfo
  setChoice: (choice: ThemeChoice) => void
  /** Xem thử một theme mà chưa lưu lựa chọn (dùng trong command palette) */
  preview: (choice: ThemeChoice | null) => void
  reloadUserFiles: () => Promise<void>
}

function resolve(choice: ThemeChoice, userThemes: ThemeInfo[]): ThemeInfo {
  if (choice === 'system') return BUILTIN_THEMES.find((t) => t.id === (media.matches ? 'ink' : 'paper'))!
  return [...BUILTIN_THEMES, ...userThemes].find((t) => t.id === choice) ?? BUILTIN_THEMES[0]
}

function apply(theme: ThemeInfo): void {
  const root = document.documentElement
  const userTheme = theme.id.startsWith('user:') ? theme.id.slice(5) : undefined
  // Không đổi gì thì thôi, để các phần vẽ lại theo theme (ví dụ Mermaid) không bị kích hoạt thừa
  if (root.dataset.theme === theme.base && root.dataset.userTheme === userTheme && root.dataset.themeId === theme.id) return
  root.dataset.themeId = theme.id
  root.dataset.theme = theme.base
  if (theme.id.startsWith('user:')) root.dataset.userTheme = theme.id.slice(5)
  else delete root.dataset.userTheme
  window.dispatchEvent(new CustomEvent('nibmark-theme', { detail: theme.id }))
}

function setStyle(id: string, css: string): void {
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = css
}

export const useTheme = create<ThemeState>((set, get) => {
  const initialChoice = readChoice()
  return {
    choice: initialChoice,
    userThemes: [],
    active: resolve(initialChoice, []),

    setChoice: (choice) => {
      try {
        localStorage.setItem(KEY, choice)
      } catch {
        // chỉ là tiện ích; không lưu được thì lần sau dùng theme mặc định
      }
      const active = resolve(choice, get().userThemes)
      set({ choice, active })
      apply(active)
    },

    preview: (choice) => {
      apply(resolve(choice ?? get().choice, get().userThemes))
    },

    reloadUserFiles: async () => {
      const bridge = window.nibmark
      if (!bridge) return
      const [themes, userCss] = await Promise.all([bridge.themes.list(), bridge.themes.getUserStyles()])
      const userThemes: ThemeInfo[] = themes.map((t) => ({
        id: t.id,
        name: t.name,
        base: t.base,
        dark: DARK_BASES.includes(t.base),
        css: t.css
      }))
      // CSS lồng (nesting) để giới hạn biến của theme trong đúng theme đó
      setStyle(
        'nibmark-user-themes',
        userThemes
          .map((t) => {
            const slug = t.id.slice(5)
            return `:root[data-user-theme="${slug}"], [data-user-theme="${slug}"] {\n${t.css}\n}`
          })
          .join('\n')
      )
      setStyle('nibmark-user-styles', userCss)
      const active = resolve(get().choice, userThemes)
      set({ userThemes, active })
      apply(active)
    }
  }
})

/** Gọi đồng bộ trước khi React vẽ lần đầu, để không bị nháy sai màu. */
export function initTheme(): void {
  apply(useTheme.getState().active)
  media.addEventListener('change', () => {
    const { choice, userThemes } = useTheme.getState()
    if (choice !== 'system') return
    const active = resolve(choice, userThemes)
    useTheme.setState({ active })
    apply(active)
  })
  void useTheme.getState().reloadUserFiles()
  // Người dùng sửa file theme/styles.css ở editor khác rồi quay lại app
  window.addEventListener('focus', () => void useTheme.getState().reloadUserFiles())
}
