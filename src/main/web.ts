import { net } from 'electron'

// Lấy dữ liệu từ web cho renderer (renderer bị sandbox, không tự gọi mạng).
// Chỉ http/https, có giới hạn thời gian và dung lượng, và chỉ trả về chữ đã bóc ra.

const MAX_BYTES = 1_000_000
const TIMEOUT_MS = 8000

function httpUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

async function fetchText(url: URL, maxBytes = MAX_BYTES): Promise<{ text: string; type: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await net.fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }
    })
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    void reader.cancel().catch(() => {})
    const bytes = new Uint8Array(Math.min(size, maxBytes))
    let offset = 0
    for (const c of chunks) {
      const part = c.subarray(0, Math.min(c.length, bytes.length - offset))
      bytes.set(part, offset)
      offset += part.length
      if (offset >= bytes.length) break
    }
    const type = res.headers.get('content-type') ?? ''
    const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8'
    let decoder: TextDecoder
    try {
      decoder = new TextDecoder(charset)
    } catch {
      decoder = new TextDecoder('utf-8')
    }
    return { text: decoder.decode(bytes), type }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

/** Tiêu đề trang: og:title, nếu không có thì <title>. */
export async function fetchTitle(raw: unknown): Promise<string | null> {
  const url = httpUrl(raw)
  if (!url) return null
  const res = await fetchText(url, 300_000)
  if (!res || !/html/i.test(res.type)) return null
  const html = res.text
  const og =
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html)?.[1]
  const title = og ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (!title) return null
  const clean = decodeEntities(title).replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, 300) : null
}

/**
 * Đoạn code từ link GitHub dạng
 *   https://github.com/<owner>/<repo>/blob/<ref>/<path>#L10-L25
 * Trả về đúng các dòng đó (tối đa 400 dòng).
 */
export async function fetchGithubSnippet(raw: unknown): Promise<{ code: string; path: string; start: number; end: number } | null> {
  const url = httpUrl(raw)
  if (!url || url.hostname !== 'github.com') return null
  const m = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname)
  const lines = /^#L(\d+)(?:-L(\d+))?$/.exec(url.hash)
  if (!m || !lines) return null
  const raw2 = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`)
  const res = await fetchText(raw2)
  if (!res) return null
  const all = res.text.split('\n')
  const start = Math.max(1, Number(lines[1]))
  const end = Math.min(all.length, Math.max(start, Number(lines[2] ?? lines[1])), start + 399)
  if (start > all.length) return null
  const path = decodeURIComponent(m[3].split('/').slice(1).join('/'))
  return { code: all.slice(start - 1, end).join('\n'), path, start, end }
}
