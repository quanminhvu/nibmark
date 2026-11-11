import { create } from 'zustand'

/**
 * Tùy chọn hiển thị của editor. Lưu riêng trong localStorage (chỉ là tiện ích
 * trên máy này, không nằm trong backup).
 *
 * wrap: 'all'   = ngắt mọi dòng dài
 *       'prose' = ngắt văn bản, giữ nguyên dòng của khối code và bảng (cuộn ngang)
 *       'none'  = không ngắt dòng nào
 */
export type WrapMode = 'all' | 'prose' | 'none'

export interface EditorPrefs {
  lineNumbers: boolean
  /** Giới hạn độ rộng dòng cho dễ đọc */
  readableWidth: boolean
  spellcheck: boolean
  /** Gạch ngang task đã xong, trong editor và preview */
  strikeDone: boolean
  wrap: WrapMode
}

const KEY = 'nibmark:editor'

const defaults: EditorPrefs = {
  lineNumbers: true,
  readableWidth: false,
  spellcheck: true,
  strikeDone: true,
  wrap: 'all'
}

function read(): EditorPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<EditorPrefs>
    const merged = { ...defaults, ...saved }
    if (!['all', 'prose', 'none'].includes(merged.wrap)) merged.wrap = 'all'
    return merged
  } catch {
    return defaults
  }
}

interface State extends EditorPrefs {
  set: (patch: Partial<EditorPrefs>) => void
}

export const useEditorPrefs = create<State>((set) => ({
  ...read(),
  set: (patch) => set(patch)
}))

useEditorPrefs.subscribe((s) => {
  const prefs: EditorPrefs = {
    lineNumbers: s.lineNumbers,
    readableWidth: s.readableWidth,
    spellcheck: s.spellcheck,
    strikeDone: s.strikeDone,
    wrap: s.wrap
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
})
