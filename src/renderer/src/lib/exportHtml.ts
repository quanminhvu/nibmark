import katex from 'katex'
import { renderMarkdown } from './markdown'
import { renderMermaidIn } from './mermaid'
import { fileIdFromUrl, readFile } from './attachments'
import { useStore } from './store'

// Export một ghi chú thành một file HTML tự chứa: ảnh đính kèm được nhúng (data URL),
// sơ đồ Mermaid thành SVG, khối code đã tô màu. Chỉ công thức toán cần tải font KaTeX từ CDN.

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Dựng HTML hoàn chỉnh của ghi chú (dùng chung cho export và kiểm thử). */
export async function noteToHtml(title: string, body: string): Promise<string> {
  // Vẽ trong một vùng ẩn để Mermaid đo được kích thước chữ
  const host = document.createElement('div')
  host.className = 'markdown-body'
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;visibility:hidden'
  host.innerHTML = renderMarkdown(body)
  document.body.appendChild(host)
  try {
    renderMermaidIn(host, () => true)
    for (let i = 0; i < 80 && host.querySelector('.mermaid-block:not(.rendered):not(.failed)'); i++) await sleep(100)
    host.querySelectorAll('.mermaid-block').forEach((b) => {
      const out = b.querySelector('.mermaid-out')
      b.replaceWith(Object.assign(document.createElement('div'), { className: 'mermaid', innerHTML: out?.innerHTML ?? '' }))
    })
    // Code nhúng từ GitHub: giữ lại link (không tải mạng khi export)
    host.querySelectorAll('.gh-embed').forEach((e) => e.classList.remove('gh-embed'))
    host.querySelectorAll('.code-copy').forEach((b) => b.remove())
    // Ảnh và file đính kèm
    for (const el of host.querySelectorAll<HTMLElement>('img[src], a[href]')) {
      const attr = el.tagName === 'IMG' ? 'src' : 'href'
      const url = el.getAttribute(attr) ?? ''
      const fileId = fileIdFromUrl(url)
      if (fileId) {
        const file = await readFile(fileId)
        if (file) el.setAttribute(attr, await blobToDataUrl(file.blob))
        if (attr === 'href' && file) el.setAttribute('download', file.doc.name)
      } else if (url.startsWith('nibmark://note/')) {
        // Link tới ghi chú khác: không mở được ngoài app, giữ lại chữ
        el.removeAttribute('href')
        el.classList.add('note-link')
      }
    }
    const hasMath = !!host.querySelector('.katex')
    const css = hasMath ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css">\n` : ''
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Nibmark">
<title>${escapeHtml(title || 'Untitled')}</title>
${css}<style>${EXPORT_CSS}</style>
</head>
<body>
<main class="markdown-body">
<h1 class="note-title">${escapeHtml(title || 'Untitled')}</h1>
${host.innerHTML}
</main>
</body>
</html>
`
  } finally {
    host.remove()
  }
}

export async function exportNoteHtml(noteId: string | null = useStore.getState().selectedNoteId): Promise<void> {
  const s = useStore.getState()
  const note = noteId ? s.notes[noteId] : undefined
  if (!note || !window.nibmark) return
  const html = await noteToHtml(note.title, note.body)
  const path = await window.nibmark.exporter.html(note.title || 'Untitled', html)
  if (path) s.showNotice(`Exported “${note.title || 'Untitled'}” as HTML.`)
}

const EXPORT_CSS = `
:root { color-scheme: light dark; --fg:#1d1d1f; --fg2:#4b4b51; --fg3:#8e8e93; --bg:#fff; --code:#f4f5f7; --line:rgba(0,0,0,.1); --accent:#2f6fe4;
  --k:#ad3da4; --s:#c41a16; --n:#1c00cf; --f:#326d74; --t:#703daa; --a:#836c28; }
@media (prefers-color-scheme: dark) { :root { --fg:#f2f2f7; --fg2:#c4c4ca; --fg3:#8a8a91; --bg:#1a1a1c; --code:#26262a; --line:rgba(255,255,255,.12); --accent:#6aa7ff;
  --k:#fc5fa3; --s:#fc6a5d; --n:#d0bf69; --f:#67b7a4; --t:#d0a8ff; --a:#d9c97c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.markdown-body { max-width: 780px; margin: 0 auto; padding: 48px 24px 96px; }
.note-title { font-size: 2em; margin: 0 0 .8em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.6em 0 .6em; }
h2 { font-size: 1.45em; } h3 { font-size: 1.2em; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
a { color: var(--accent); }
a.note-link { color: inherit; text-decoration: underline dotted; }
img { max-width: 100%; border-radius: 6px; }
img.img-small { width: 240px; } img.img-half { width: 50%; } img.img-full { width: 100%; }
hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
blockquote { margin-left: 0; padding: .1em 1em; border-left: 3px solid var(--accent); color: var(--fg2); }
code { font: .88em ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: var(--code); padding: .12em .35em; border-radius: 4px; }
pre { position: relative; background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; overflow-x: auto; line-height: 1.55; }
pre code { background: none; padding: 0; font-size: 13px; }
pre .code-body { display: flex; }
pre .code-gutter { margin-right: 12px; padding-right: 10px; border-right: 1px solid var(--line); color: var(--fg3); text-align: right; white-space: pre; user-select: none; font: 13px/1.55 ui-monospace, Menlo, monospace; }
pre .code-lang { position: absolute; top: 6px; right: 10px; color: var(--fg3); font-size: 10.5px; text-transform: uppercase; }
pre.has-head { padding-top: 0; }
pre .code-head { display: flex; gap: 8px; align-items: center; margin: 0 -16px 12px; padding: 7px 16px; border-bottom: 1px solid var(--line); font-size: 12px; }
pre .code-head .code-title { flex: 1; font-weight: 600; } pre .code-head .code-lang { position: static; }
pre .code-icon { width: 10px; height: 10px; border-radius: 3px; background: var(--fg3); }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 6px 12px; }
th { background: var(--code); }
.contains-task-list { list-style: none; padding-left: .3em; }
.task-list-item-checkbox { margin-right: .5em; }
.markdown-alert { margin: 0 0 1em; padding: .5em 1em; border-left: 3px solid #4a8dff; border-radius: 0 6px 6px 0; background: rgba(74,141,255,.08); }
.markdown-alert-title { display: flex; gap: 6px; align-items: center; font-weight: 650; }
.markdown-alert-title svg { fill: currentColor; }
.markdown-alert-tip { border-color: #2fb457; background: rgba(47,180,87,.08); }
.markdown-alert-important { border-color: #9b59d0; background: rgba(155,89,208,.08); }
.markdown-alert-warning { border-color: #f08c1a; background: rgba(240,140,26,.08); }
.markdown-alert-caution { border-color: #e0484e; background: rgba(224,72,78,.08); }
.mermaid { margin: 0 0 1em; text-align: center; } .mermaid svg { max-width: 100%; height: auto; }
mark { background: rgba(255,204,0,.4); color: inherit; }
.color-swatch { display: inline-block; width: .8em; height: .8em; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-literal { color: var(--k); }
.hljs-string, .hljs-regexp, .hljs-addition { color: var(--s); }
.hljs-number, .hljs-symbol { color: var(--n); }
.hljs-title, .hljs-title.function_, .hljs-section { color: var(--f); }
.hljs-type, .hljs-class, .hljs-title.class_ { color: var(--t); }
.hljs-attr, .hljs-attribute, .hljs-property, .hljs-variable { color: var(--a); }
.hljs-comment, .hljs-quote, .hljs-meta { color: var(--fg3); font-style: italic; }
.hljs-deletion { color: #e0484e; }
@media print { .markdown-body { padding: 0; } pre { white-space: pre-wrap; } }
`
