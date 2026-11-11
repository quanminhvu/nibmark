import { create } from 'zustand'
import { db } from './db'
import { useStore } from './store'
import type { FileDoc } from './types'

// File đính kèm: lưu trong PouchDB dưới dạng document "file:<id>" có _attachments.data,
// nên sau này đồng bộ CouchDB được luôn. Ghi chú tham chiếu bằng nibmark://file/<id>.

export const FILE_PREFIX = 'nibmark://file/'
export const MAX_FILE_BYTES = 100 * 1024 * 1024

export const fileUrl = (fileId: string): string => FILE_PREFIX + fileId.slice('file:'.length)

export function fileIdFromUrl(url: string): string | null {
  if (!url.startsWith(FILE_PREFIX)) return null
  const hex = url.slice(FILE_PREFIX.length).replace(/[/?#].*$/, '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(hex) ? `file:${hex}` : null
}

const newId = (): string => `file:${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
const pad = (n: number): string => String(n).padStart(2, '0')

/** Ảnh dán từ clipboard thường tên "image.png": đặt tên có ngày giờ cho dễ nhận */
function niceName(file: File): string {
  const name = file.name?.trim()
  if (name && !/^image\.(png|jpe?g|gif|webp|tiff?)$/i.test(name)) return name
  const d = new Date()
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '')
  return `Pasted image ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`
}

export async function saveFile(file: File): Promise<FileDoc | null> {
  const s = useStore.getState()
  if (file.size > MAX_FILE_BYTES) {
    s.showNotice(`“${file.name}” is larger than 100 MB and was not attached.`, 'error')
    return null
  }
  const now = Date.now()
  const doc: FileDoc = {
    _id: newId(),
    type: 'file',
    name: niceName(file),
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: now,
    updatedAt: now
  }
  await db.put({
    ...doc,
    _attachments: { data: { content_type: doc.contentType, data: file } }
  } as never)
  return doc
}

const isImage = (doc: FileDoc): boolean => /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif)$/i.test(doc.contentType)

/** Đoạn Markdown để chèn vào ghi chú cho một file vừa lưu */
export function markdownFor(doc: FileDoc): string {
  const label = doc.name.replace(/([[\]\\])/g, '\\$1')
  return isImage(doc) ? `![${label}](${fileUrl(doc._id)})` : `[📎 ${label}](${fileUrl(doc._id)})`
}

export async function readFile(fileId: string): Promise<{ doc: FileDoc; blob: Blob } | null> {
  try {
    const doc = (await db.get(fileId)) as unknown as FileDoc
    const blob = (await db.getAttachment(fileId, 'data')) as Blob
    return { doc, blob }
  } catch {
    return null
  }
}

// ── Hiển thị trong preview: đổi nibmark://file/… thành blob URL ──

const MAX_URLS = 150
const urls = new Map<string, string>() // fileId → blob URL (thứ tự = mới dùng gần nhất)
const missing = new Set<string>()
const loading = new Set<string>()

/** Tăng mỗi khi có thêm file nạp xong, để preview vẽ lại */
export const useFileTick = create<{ tick: number }>(() => ({ tick: 0 }))

function remember(id: string, url: string): void {
  urls.delete(id)
  urls.set(id, url)
  while (urls.size > MAX_URLS) {
    const [oldId, oldUrl] = urls.entries().next().value!
    urls.delete(oldId)
    URL.revokeObjectURL(oldUrl)
  }
}

function load(id: string): void {
  if (loading.has(id) || missing.has(id)) return
  loading.add(id)
  void readFile(id).then((res) => {
    loading.delete(id)
    if (res) remember(id, URL.createObjectURL(res.blob))
    else missing.add(id)
    useFileTick.setState((s) => ({ tick: s.tick + 1 }))
  })
}

/** Thay link file trong HTML đã làm sạch bằng blob URL (nạp dần những file chưa có). */
export function resolveFileUrls(html: string): string {
  return html.replace(/(<img\b[^>]*?\bsrc=")nibmark:\/\/file\/([A-Za-z0-9_-]{1,64})"/g, (all, head: string, hex: string) => {
    const id = `file:${hex}`
    const url = urls.get(id)
    if (url) {
      remember(id, url)
      return `${head}${url}" data-file="${hex}"`
    }
    load(id)
    return `${head}" data-file="${hex}" data-missing="${missing.has(id) ? 'gone' : 'loading'}"`
  })
}

/** Mở file đính kèm (không phải ảnh) bằng ứng dụng mặc định của máy */
export async function openAttachment(fileId: string): Promise<void> {
  const s = useStore.getState()
  const res = await readFile(fileId)
  if (!res) {
    s.showNotice('That attachment no longer exists.', 'error')
    return
  }
  if (!window.nibmark) return
  const bytes = new Uint8Array(await res.blob.arrayBuffer())
  const error = await window.nibmark.files.open(fileId.slice('file:'.length), res.doc.name, bytes)
  if (error) s.showNotice(error, 'error')
}

/** Lưu các file được dán/kéo vào và trả về đoạn Markdown để chèn */
export async function attachFiles(files: File[]): Promise<string> {
  const parts: string[] = []
  for (const file of files) {
    const doc = await saveFile(file)
    if (doc) parts.push(markdownFor(doc))
  }
  return parts.join('\n')
}
