import type { BrowserWindow } from 'electron'

// Cửa sổ chính (có sidebar và danh sách ghi chú). Các cửa sổ mở riêng một ghi chú
// không phải cửa sổ chính: lệnh menu và phím tắt toàn cục luôn đi tới cửa sổ chính.
let main: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  main = win
  win.on('closed', () => {
    if (main === win) main = null
  })
}

export function getMainWindow(): BrowserWindow | null {
  return main && !main.isDestroyed() ? main : null
}
