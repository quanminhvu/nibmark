export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

/** Một đoạn trích văn bản thuần của ghi chú, bỏ ký hiệu Markdown. */
export function snippet(body: string, max = 140): string {
  let out = ''
  let inFence = false
  for (const raw of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence
      continue
    }
    const line = raw
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\[!(?:note|tip|important|warning|caution)\]\s*/i, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (!line || /^[-|:\s]+$/.test(line)) continue
    out += (out ? ' ' : '') + line
    if (out.length >= max) break
  }
  return out.length > max ? out.slice(0, max).trimEnd() + '…' : out
}

export const isMac = (): boolean => window.nibmark?.platform === 'darwin'
