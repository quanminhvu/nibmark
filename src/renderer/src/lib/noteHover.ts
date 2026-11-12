import { hoverTooltip } from '@codemirror/view'
import { resolveFileUrls } from './attachments'
import { stripFrontMatter } from './kanban'
import { renderMarkdown } from './markdown'
import { followNoteLink, noteIdFromUrl, noteLinkUrl } from './noteLinks'
import { useStore } from './store'
import { relativeTime } from './util'

// Rê chuột vào link tới ghi chú khác ([Tiêu đề](nibmark://note/…)) thì hiện thẻ xem trước:
// tiêu đề, notebook, thời gian sửa và phần đầu nội dung. Bấm vào thẻ để mở ghi chú.

/** Chỉ hiện phần đầu để thẻ nhẹ; thẻ tự cắt phần thừa bằng CSS */
const EXCERPT_CHARS = 1800
const SHOW_DELAY = 350
const HIDE_DELAY = 200

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Thẻ xem trước của một ghi chú (dùng chung cho editor và preview) */
export function noteCard(noteId: string): HTMLElement {
  const s = useStore.getState()
  const note = s.notes[noteId]
  const card = document.createElement('div')
  card.className = 'note-card'
  if (!note) {
    card.classList.add('missing')
    card.textContent = 'This note no longer exists.'
    return card
  }
  const book = s.books[note.bookId]?.name
  const meta = [note.trashed ? 'In Trash' : book, relativeTime(note.updatedAt)].filter(Boolean).join(' · ')
  let body = stripFrontMatter(note.body).trim()
  const cut = body.length > EXCERPT_CHARS
  if (cut) body = body.slice(0, EXCERPT_CHARS).replace(/\n[^\n]*$/, '')
  card.innerHTML = `<div class="note-card-head"><div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div><div class="note-card-meta">${escapeHtml(meta)}</div></div>${
    body ? `<div class="note-card-body markdown-body">${resolveFileUrls(renderMarkdown(body))}</div>` : '<div class="note-card-empty">Empty note</div>'
  }`
  card.title = 'Click to open'
  card.addEventListener('mousedown', (e) => {
    // Không cho editor nhận cú bấm (sẽ đặt con trỏ và đóng thẻ trước khi mở được)
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    hideCard(true)
    followNoteLink(noteLinkUrl(noteId))
  })
  return card
}

/** Thẻ xem trước trong editor: rê chuột vào cả cụm [Tiêu đề](nibmark://note/…) */
export const noteLinkHover = hoverTooltip(
  (view, pos) => {
    const line = view.state.doc.lineAt(pos)
    for (const m of line.text.matchAll(/\]\((nibmark:\/\/note\/[A-Za-z0-9_-]+)\)/g)) {
      const start = line.from + line.text.lastIndexOf('[', m.index)
      const end = line.from + m.index + m[0].length
      const id = noteIdFromUrl(m[1])
      if (id && pos >= start && pos <= end) {
        return { pos: start, end, above: false, create: () => ({ dom: noteCard(id) }) }
      }
    }
    return null
  },
  { hoverTime: SHOW_DELAY }
)

// ── Preview: một thẻ nổi dùng chung ──

let floating: HTMLElement | null = null
let showTimer = 0
let hideTimer = 0
let currentLink: Element | null = null

function hideCard(now = false): void {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  const run = (): void => {
    floating?.remove()
    floating = null
    currentLink = null
  }
  if (now) run()
  else hideTimer = window.setTimeout(run, HIDE_DELAY)
}

function placeCard(card: HTMLElement, rect: DOMRect): void {
  const margin = 8
  const width = Math.min(380, window.innerWidth - margin * 2)
  card.style.width = `${width}px`
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
  card.style.left = `${left}px`
  document.body.appendChild(card)
  const height = card.offsetHeight
  // Đủ chỗ thì hiện bên dưới link, không thì lật lên trên
  const below = rect.bottom + 6
  card.style.top = `${below + height > window.innerHeight - margin ? Math.max(margin, rect.top - 6 - height) : below}px`
}

/** Gắn vào vùng preview (onMouseOver / onMouseOut) */
export function previewLinkOver(event: React.MouseEvent<HTMLElement>): void {
  const link = (event.target as Element).closest('a[href^="nibmark://note/"]')
  if (!link) return
  clearTimeout(hideTimer)
  if (link === currentLink) return
  clearTimeout(showTimer)
  showTimer = window.setTimeout(() => {
    const id = noteIdFromUrl(link.getAttribute('href') ?? '')
    if (!id || !link.isConnected) return
    floating?.remove()
    const card = noteCard(id)
    card.classList.add('floating')
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer))
    card.addEventListener('mouseleave', () => hideCard())
    placeCard(card, link.getBoundingClientRect())
    floating = card
    currentLink = link
  }, SHOW_DELAY)
}

export function previewLinkOut(event: React.MouseEvent<HTMLElement>): void {
  const link = (event.target as Element).closest('a[href^="nibmark://note/"]')
  if (!link) return
  // Chuột vẫn trong link (đi qua phần tử con) thì giữ nguyên
  if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
  clearTimeout(showTimer)
  if (floating) hideCard()
  else currentLink = null
}

// Cuộn, gõ phím hoặc đổi ghi chú thì đóng thẻ ngay
window.addEventListener('scroll', () => floating && hideCard(true), true)
window.addEventListener('keydown', () => floating && hideCard(true), true)
useStore.subscribe((s, prev) => {
  if (s.selectedNoteId !== prev.selectedNoteId) hideCard(true)
})
