import { create } from 'zustand'
import { stripFrontMatter } from './kanban'

/** Tốc độ đọc trung bình (chữ/phút) để ước thời gian đọc */
const WORDS_PER_MINUTE = 220

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null

/** Bỏ phần không phải chữ để đọc: front matter, URL trong link/ảnh, comment HTML */
function readable(text: string): string {
  return stripFrontMatter(text)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(!?\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' url ')
}

/** Đếm chữ theo Unicode: tiếng Việt, tiếng Anh, cả chữ Hán/Nhật (mỗi từ một chữ) */
export function countWords(text: string): number {
  const clean = readable(text)
  if (!segmenter) return clean.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  let n = 0
  for (const part of segmenter.segment(clean)) if (part.isWordLike) n++
  return n
}

export function countChars(text: string): number {
  return [...stripFrontMatter(text).replace(/\s/g, '')].length
}

export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / WORDS_PER_MINUTE))

/** Chữ đang bôi đen trong editor (để đếm riêng phần đang chọn) */
export const useSelectionText = create<{ text: string }>(() => ({ text: '' }))

const MAX_SELECTION = 500_000

export function setSelectionText(text: string): void {
  const next = text.length > MAX_SELECTION ? text.slice(0, MAX_SELECTION) : text
  if (useSelectionText.getState().text !== next) useSelectionText.setState({ text: next })
}
