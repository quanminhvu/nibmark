/**
 * Cửa sổ này chỉ hiện một ghi chú (mở bằng ⌘⇧N)? Khi đó không chạy sao lưu,
 * lịch sử phiên bản hay lưu tùy chọn giao diện: những việc đó do cửa sổ chính lo.
 */
export const noteWindowId: string | null = new URLSearchParams(location.search).get('note')

export function openInNewWindow(id: string): void {
  window.nibmark?.openNoteWindow(id)
}
