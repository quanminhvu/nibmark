import { EditorView } from '@codemirror/view'
import type { ScrollAnchor } from './scrollSync'

/** Measure on demand: wrapping, folds and asynchronously rendered media can change geometry. */
export function sourceScrollAnchors(editor: HTMLElement, preview: HTMLElement): ScrollAnchor[] {
  const view = EditorView.findFromDOM(editor)
  if (!view) return []
  const leftMax = Math.max(0, editor.scrollHeight - editor.clientHeight)
  const rightMax = Math.max(0, preview.scrollHeight - preview.clientHeight)
  if (!leftMax || !rightMax) return []
  const anchors: ScrollAnchor[] = [{ left: 0, right: 0 }]
  const editorTop = editor.getBoundingClientRect().top
  const previewTop = preview.getBoundingClientRect().top
  let lastLine = -1
  for (const element of preview.querySelectorAll<HTMLElement>('[data-source-line]')) {
    const line = Number(element.dataset.sourceLine)
    if (!Number.isInteger(line) || line <= lastLine || line >= view.state.doc.lines) continue
    const block = view.lineBlockAt(view.state.doc.line(line + 1).from)
    const left = view.documentTop + block.top - editorTop + editor.scrollTop
    const right = element.getBoundingClientRect().top - previewTop + preview.scrollTop
    const last = anchors.at(-1)!
    if (left > last.left && right > last.right && left < leftMax && right < rightMax) {
      anchors.push({ left, right })
      lastLine = line
    }
  }
  anchors.push({ left: leftMax, right: rightMax })
  return anchors
}
