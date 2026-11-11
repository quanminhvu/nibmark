// Vẽ sơ đồ Mermaid trong preview.
// - Chỉ nạp thư viện Mermaid khi gặp sơ đồ đầu tiên (thư viện khá nặng).
// - Cache SVG theo (theme + mã nguồn): preview vẽ lại HTML theo từng phím gõ,
//   nên sơ đồ không đổi được lấy lại ngay từ cache thay vì vẽ lại.
// - Đổi theme thì xóa cache vì màu sơ đồ lấy từ theme.

type MermaidApi = typeof import('mermaid').default

let loading: Promise<MermaidApi> | null = null
let initializedFor: string | null = null
const cache = new Map<string, { svg?: string; error?: string }>()
let counter = 0

const themeKey = (): string => document.documentElement.dataset.themeId ?? document.documentElement.dataset.theme ?? 'paper'

window.addEventListener('nibmark-theme', () => cache.clear())

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

async function getMermaid(): Promise<MermaidApi> {
  loading ??= import('mermaid').then((m) => m.default)
  const mermaid = await loading
  const key = themeKey()
  if (initializedFor !== key) {
    const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: cssVar('--font-ui', 'sans-serif'),
      themeVariables: {
        darkMode: dark,
        background: cssVar('--surface-2', '#fffdfa'),
        primaryColor: cssVar('--surface', '#faf7f1'),
        primaryTextColor: cssVar('--ink', '#1c1a18'),
        primaryBorderColor: cssVar('--ink-3', '#9a9187'),
        secondaryColor: cssVar('--paper', '#f4efe6'),
        tertiaryColor: cssVar('--code-bg', '#f1ece3'),
        lineColor: cssVar('--ink-2', '#5c554d'),
        textColor: cssVar('--ink', '#1c1a18'),
        noteBkgColor: cssVar('--paper', '#f4efe6'),
        noteTextColor: cssVar('--ink', '#1c1a18'),
        noteBorderColor: cssVar('--accent', '#c8402e')
      }
    })
    initializedFor = key
  }
  return mermaid
}

function show(block: HTMLElement, entry: { svg?: string; error?: string }): void {
  const out = block.querySelector<HTMLElement>('.mermaid-out')
  if (!out) return
  if (entry.svg) {
    out.innerHTML = entry.svg
    block.classList.add('rendered')
    block.classList.remove('failed')
  } else {
    out.textContent = `Mermaid: ${entry.error ?? 'could not render this diagram'}`
    block.classList.add('failed')
    block.classList.remove('rendered')
  }
}

/** Vẽ (hoặc lấy từ cache) mọi khối Mermaid đang có trong `root`. */
export function renderMermaidIn(root: HTMLElement, isCurrent: () => boolean): void {
  const blocks = [...root.querySelectorAll<HTMLElement>('.mermaid-block:not(.rendered)')]
  if (!blocks.length) return
  for (const block of blocks) {
    const source = block.querySelector('.mermaid-src')?.textContent ?? ''
    const key = `${themeKey()}\n${source}`
    const cached = cache.get(key)
    if (cached) {
      show(block, cached)
      continue
    }
    void (async () => {
      let entry: { svg?: string; error?: string }
      try {
        const mermaid = await getMermaid()
        const { svg } = await mermaid.render(`nibmark-mermaid-${++counter}`, source)
        entry = { svg }
      } catch (err) {
        entry = { error: (err as Error).message?.split('\n')[0] }
        // Mermaid có thể để lại phần tử tạm khi lỗi
        document.querySelectorAll('[id^="dnibmark-mermaid-"]').forEach((el) => el.remove())
      }
      cache.set(key, entry)
      if (cache.size > 200) cache.delete(cache.keys().next().value!)
      // Kết quả trễ: chỉ gắn vào nếu khối đó vẫn còn và vẫn đúng mã nguồn
      if (isCurrent() && block.isConnected && block.querySelector('.mermaid-src')?.textContent === source) show(block, entry)
    })()
  }
}
