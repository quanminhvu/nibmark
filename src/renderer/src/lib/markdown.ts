import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import katex from '@vscode/markdown-it-katex'
import alerts from 'markdown-it-github-alerts'
import 'katex/dist/katex.min.css'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(code, lang): string {
    const language = lang && hljs.getLanguage(lang) ? lang : null
    const html = language ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escapeHtml(code)
    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
    return `<pre class="hljs">${label}<button class="code-copy" type="button" title="Copy code">Copy</button><code>${html}</code></pre>`
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

// Khối ```mermaid: giữ nguyên mã nguồn, Preview sẽ vẽ sơ đồ sau khi trang hiển thị
const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim().split(/\s+/)[0] === 'mermaid') {
    return `<div class="mermaid-block"><pre class="mermaid-src">${escapeHtml(token.content)}</pre><div class="mermaid-out"></div></div>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}

// Danh sách giao thức mặc định của DOMPurify, thêm nibmark: cho link giữa các ghi chú
const ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|nibmark):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ['target'], ALLOWED_URI_REGEXP: ALLOWED_URI })
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
