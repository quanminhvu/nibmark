import { create } from 'zustand'
import { stripFrontMatter } from './kanban'
import { getActiveEditor } from './editorCommands'
import { useStore } from './store'

/**
 * Tách ghi chú thành slide theo dòng `---` đứng riêng (có dòng trống phía trên).
 * Bỏ qua `---` trong khối code, và `---` ngay dưới một dòng chữ (đó là heading kiểu setext).
 */
export function splitSlides(body: string): string[] {
  const lines = stripFrontMatter(body).split('\n')
  const slides: string[][] = [[]]
  let fence: string | null = null
  lines.forEach((line, i) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker[0]
      else if (marker[0] === fence) fence = null
    }
    const prevBlank = i === 0 || !lines[i - 1].trim()
    if (!fence && /^\s{0,3}-{3,}\s*$/.test(line) && prevBlank) slides.push([])
    else slides.at(-1)!.push(line)
  })
  return slides.map((s) => s.join('\n').trim()).filter(Boolean)
}

/** Ghi chú đang trình chiếu (null = không trình chiếu) */
export const usePresentation = create<{ noteId: string | null; start: number }>(() => ({ noteId: null, start: 0 }))

export function startPresentation(noteId: string, start = 0): void {
  usePresentation.setState({ noteId, start })
}

/** Trình chiếu ghi chú đang mở, bắt đầu từ slide có con trỏ trong editor */
export function presentNote(noteId: string): void {
  const note = useStore.getState().notes[noteId]
  if (!note) return
  const view = useStore.getState().selectedNoteId === noteId ? getActiveEditor() : null
  const line = view ? view.state.doc.lineAt(view.state.selection.main.head).number - 1 : 0
  startPresentation(noteId, line > 0 ? slideAtLine(note.body, line) : 0)
}

export function stopPresentation(): void {
  usePresentation.setState({ noteId: null, start: 0 })
}

/** Slide chứa dòng `line` (tính từ 0) của ghi chú, để bắt đầu trình chiếu từ chỗ đang viết */
export function slideAtLine(body: string, line: number): number {
  const upTo = body.split('\n').slice(0, line + 1).join('\n')
  return Math.max(0, splitSlides(upTo).length - 1)
}
