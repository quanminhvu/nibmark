import { create } from 'zustand'

export interface Heading {
  text: string
  level: number
  /** Dòng trong nội dung ghi chú (tính từ 0) */
  line: number
}

/** Các heading ATX (#…) của ghi chú, bỏ qua dòng nằm trong khối code */
export function headingsOf(body: string): Heading[] {
  const out: Heading[] = []
  let fence = false
  body.split('\n').forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence
    if (fence) return
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (m) out.push({ text: m[2], level: m[1].length, line })
  })
  return out
}

/** Bỏ ký hiệu Markdown trong dòng heading để hiện chữ gọn: **đậm**, `code`, [link](url) */
export function plainHeading(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
    .trim()
}

/** Nhảy tới một heading trong ghi chú đang mở (editor và preview tự lắng nghe). */
export function gotoHeading(line: number, index: number, focusEditor = true): void {
  window.dispatchEvent(new CustomEvent('nibmark-goto', { detail: { line, index, focusEditor } }))
}

const KEY = 'nibmark:outline'

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Bảng mục lục bên phải ghi chú: bật/tắt, nhớ giữa các lần mở app */
export const useOutline = create<{ open: boolean }>(() => ({ open: readOpen() }))

export function toggleOutline(): void {
  const open = !useOutline.getState().open
  useOutline.setState({ open })
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // Không lưu được thì chỉ nhớ trong phiên này
  }
}
