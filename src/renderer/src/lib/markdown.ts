import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import hljs from 'highlight.js/lib/common'
import { extraLanguages } from './hljsExtra'
import DOMPurify from 'dompurify'
import katex from '@vscode/markdown-it-katex'
import alerts from 'markdown-it-github-alerts'
import 'katex/dist/katex.min.css'
import { parseImageAlt } from './imageTools'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Thêm các ngôn ngữ hay gặp ngoài bộ "common" của highlight.js
for (const [name, lang] of Object.entries(extraLanguages)) if (!hljs.getLanguage(name)) hljs.registerLanguage(name, lang)
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' })
hljs.registerAliases(['dockerfile', 'docker'], { languageName: 'dockerfile' })
hljs.registerAliases(['tf', 'hcl'], { languageName: 'ini' })

/**
 * Khối code: ```js title="app.js" (hoặc ```js:app.js) có thanh tên file.
 * Luôn có cột số dòng; ẩn/hiện bằng tùy chọn (class trên <html>).
 */
export function renderCodeBlock(code: string, rawLang: string, attrs = '', startLine = 1): string {
  let lang = rawLang
  let title = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(attrs)
    ?.slice(1)
    .find((x) => x !== undefined)
  const colon = /^([^:\s]+):(.+)$/.exec(lang)
  if (colon) {
    lang = colon[1]
    title = title ?? colon[2]
  }
  const language = lang && hljs.getLanguage(lang) ? lang : null
  const html = language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escapeHtml(code)
  const lines = Math.max(1, code.replace(/\n$/, '').split('\n').length)
  const gutter = Array.from({ length: lines }, (_, i) => i + startLine).join('\n')
  const key = escapeHtml((language ? hljs.getLanguage(language)?.name ?? lang : lang).toLowerCase().replace(/[^a-z0-9#+-]/g, ''))
  const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
  const head = title
    ? `<span class="code-head"><span class="code-icon" data-lang="${escapeHtml(lang.toLowerCase())}" data-family="${key}"></span><span class="code-title">${escapeHtml(title)}</span>${langLabel}</span>`
    : langLabel
  return `<pre class="hljs${title ? ' has-head' : ''}">${head}<button class="code-copy" type="button" title="Copy code">Copy</button><span class="code-body"><span class="code-gutter" aria-hidden="true">${gutter}</span><code>${html}</code></span></pre>`
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(code, lang, attrs): string {
    return renderCodeBlock(code, lang, attrs)
  }
})
  .use(taskLists, { enabled: true })
  .use(footnote)
  .use(sub)
  .use(sup)
  // $...$ và $$...$$; "$5 and $10" không bị coi là công thức vì có quy tắc về khoảng trắng/chữ số
  .use(katex, { throwOnError: false, output: 'html', enableFencedBlocks: true })
  // > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
  .use(alerts)

// `#c8402e`, `rgb(…)`, `hsl(…)`: thêm ô màu nhỏ. Chỉ nhận đúng cú pháp màu (không có ; url( …)
// vì giá trị được đưa vào thuộc tính style.
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgb|rgba|hsl|hsla)\(\s*[\d.%]+(?:\s*[,\s/]\s*[\d.%]+){2,3}\s*\))$/i
const defaultCodeInline = md.renderer.rules.code_inline!
md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
  const html = defaultCodeInline(tokens, idx, options, env, self)
  const value = tokens[idx].content.trim()
  if (!COLOR.test(value)) return html
  return `<span class="color-code"><span class="color-swatch" style="background:${value}"></span>${html}</span>`
}

// Kích thước ảnh trong chữ thay thế: ![ảnh|small](…), |half, |full, |320
// Chỉ dùng class hoặc thuộc tính width là số, không bao giờ ghi style tự do.
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const { alt, size } = parseImageAlt(self.renderInlineAsText(token.children ?? [], options, env))
  token.attrSet('alt', alt)
  token.children = []
  if (typeof size === 'number') token.attrSet('width', String(Math.min(size, 4000)))
  else if (size) token.attrJoin('class', `img-${size}`)
  return self.renderToken(tokens, idx, options)
}

// Khối ```mermaid: giữ nguyên mã nguồn, Preview sẽ vẽ sơ đồ sau khi trang hiển thị
const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim().split(/\s+/)[0] === 'mermaid') {
    return `<div data-source-line="${token.map?.[0] ?? 0}" class="mermaid-block"><pre class="mermaid-src">${escapeHtml(token.content)}</pre><div class="mermaid-out"></div></div>\n`
  }
  return defaultFence(tokens, idx, options, env, self).replace(/<(pre|div)(?=[ >])/, `<$1 data-source-line="${token.map?.[0] ?? 0}"`)
}

// Link GitHub tới một dải dòng, đứng riêng một đoạn, được nhúng thành khối code.
// Preview tải nội dung sau (qua main process) rồi điền vào chỗ giữ chỗ này.
const GITHUB_LINES = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/blob\/\S+#L\d+(?:-L\d+)?$/
md.core.ruler.push('github_embed', (state) => {
  const t = state.tokens
  for (let i = 0; i + 2 < t.length; i++) {
    if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline' || t[i + 2].type !== 'paragraph_close') continue
    const kids = t[i + 1].children ?? []
    if (kids.length !== 3 || kids[0].type !== 'link_open' || kids[2].type !== 'link_close') continue
    const href = String(kids[0].attrGet('href') ?? '')
    if (!GITHUB_LINES.test(href) || kids[1].content.trim() !== href) continue
    const block = new state.Token('html_block', '', 0)
    const safe = escapeHtml(href)
    block.map = t[i].map
    block.content = `<div class="gh-embed" data-src="${safe}"><a href="${safe}">${safe}</a></div>\n`
    t.splice(i, 3, block)
  }
})

// Danh sách giao thức mặc định của DOMPurify, thêm nibmark: cho link giữa các ghi chú
const ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|nibmark):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

/** Điền các khối nhúng GitHub trong `root` (có cache, chỉ tải mỗi link một lần). */
const ghCache = new Map<string, Promise<Awaited<ReturnType<NibmarkBridge['web']['githubSnippet']>>>>()
export function fillGithubEmbeds(root: HTMLElement): void {
  const bridge = window.nibmark
  if (!bridge) return
  for (const el of root.querySelectorAll<HTMLElement>('.gh-embed:not(.loaded)')) {
    const src = el.dataset.src ?? ''
    el.classList.add('loaded')
    if (!ghCache.has(src)) ghCache.set(src, bridge.web.githubSnippet(src))
    void ghCache.get(src)!.then((res) => {
      if (!res) {
        el.classList.add('failed')
        return
      }
      const ext = /\.([a-z0-9]+)$/i.exec(res.path)?.[1]?.toLowerCase() ?? ''
      const title = `${res.path}  ·  L${res.start}${res.end > res.start ? `–${res.end}` : ''}`
      const html = renderCodeBlock(res.code + '\n', ext, `title="${title.replace(/"/g, "'")}"`, res.start)
      const link = `<a class="gh-embed-link" href="${escapeHtml(src)}">View on GitHub</a>`
      el.innerHTML = DOMPurify.sanitize(html + link, { ALLOWED_URI_REGEXP: ALLOWED_URI })
    })
  }
}

// Source line anchors for mapping preview blocks back to CodeMirror.
md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    if (!token.map || token.type === 'inline' || token.nesting < 0) continue
    const line = token.map[0]
    if (token.type === 'html_block') {
      token.content = `<div data-source-line="${line}">${token.content}</div>`
    } else token.attrSet('data-source-line', String(line))
  }
})

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ['target'], ALLOWED_URI_REGEXP: ALLOWED_URI })
}

/** Markdown trong một dòng (không bọc <p>), dùng cho tiêu đề thẻ Kanban. */
export function renderInlineMarkdown(source: string): string {
  return DOMPurify.sanitize(md.renderInline(source), { ADD_ATTR: ['target'], ALLOWED_URI_REGEXP: ALLOWED_URI })
}

const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/
const FENCE = /^\s*(```|~~~)/

/** Đổi trạng thái ô checkbox thứ `index` (đếm từ 0) trong nguồn Markdown. */
export function toggleTask(source: string, index: number): string {
  const lines = source.split('\n')
  let inFence = false
  let seen = -1
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = TASK_LINE.exec(lines[i])
    if (!m) continue
    seen++
    if (seen === index) {
      lines[i] = lines[i].replace(TASK_LINE, (_all, pre: string, mark: string, post: string) => pre + (mark === ' ' ? 'x' : ' ') + post)
      break
    }
  }
  return lines.join('\n')
}

/** Đếm số task đã xong / tổng số task trong ghi chú. */
export function countTasks(source: string): { done: number; total: number } {
  let inFence = false
  let done = 0
  let total = 0
  for (const line of source.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = TASK_LINE.exec(line)
    if (!m) continue
    total++
    if (m[2] !== ' ') done++
  }
  return { done, total }
}

/** Actual links only: fenced/inline code and comments do not create backlinks. */
export function linkedNoteIds(source: string): Set<string> {
  const ids = new Set<string>()
  const add = (href: string): void => {
    const match = /^nibmark:\/\/note\/([A-Za-z0-9_-]{1,64})(?:[/?#].*)?$/.exec(href)
    if (match) ids.add(`note:${match[1]}`)
  }
  const walk = (tokens: ReturnType<typeof md.parse>): void => {
    for (const token of tokens) {
      if (token.type === 'link_open') add(String(token.attrGet('href') ?? ''))
      if (token.type === 'html_block' || token.type === 'html_inline') {
        const doc = new DOMParser().parseFromString(token.content, 'text/html')
        doc.querySelectorAll('a[href]').forEach((a) => add(a.getAttribute('href') ?? ''))
      }
      if (token.children) walk(token.children)
    }
  }
  walk(md.parse(source, {}))
  return ids
}
