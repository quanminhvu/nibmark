import { useMemo } from 'react'
import { countChars, countWords, readingMinutes, useSelectionText } from '@/lib/noteStats'

const fmt = new Intl.NumberFormat()

/** Số chữ của ghi chú (hoặc của phần đang bôi đen); rê chuột để xem số ký tự và thời gian đọc */
export function NoteStats({ body }: { body: string }): React.JSX.Element | null {
  const words = useMemo(() => countWords(body), [body])
  const chars = useMemo(() => countChars(body), [body])
  const selection = useSelectionText((s) => s.text)
  const selWords = useMemo(() => (selection ? countWords(selection) : 0), [selection])
  if (!words && !selection) return null
  const title = selection
    ? `${fmt.format(selWords)} of ${fmt.format(words)} words selected · ${fmt.format(countChars(selection))} characters`
    : `${fmt.format(words)} words · ${fmt.format(chars)} characters · ${readingMinutes(words)} min read`
  return (
    <span className="note-stats" title={title}>
      {selection ? `${fmt.format(selWords)} / ${fmt.format(words)} words` : `${fmt.format(words)} ${words === 1 ? 'word' : 'words'} · ${readingMinutes(words)} min`}
    </span>
  )
}
