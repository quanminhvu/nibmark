import { BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LOAD_TIMEOUT_MS = 20_000

const FOOTER = `<div style="width:100%;font:8px -apple-system,'Segoe UI',sans-serif;color:#8e8e93;text-align:center">
<span class="pageNumber"></span> / <span class="totalPages"></span></div>`

/**
 * In một trang HTML (đã tự chứa: ảnh nhúng dạng data URL, sơ đồ đã là SVG) ra PDF
 * trong một cửa sổ ẩn, không chạy JavaScript và không được điều hướng đi đâu.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  // Ghi ra file tạm: ảnh nhúng có thể làm HTML lớn hơn giới hạn của data URL
  const dir = await mkdtemp(join(tmpdir(), 'nibmark-pdf-'))
  const file = join(dir, 'note.html')
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    await writeFile(file, html, 'utf8')
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await Promise.race([
      win.loadFile(file),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading the page')), LOAD_TIMEOUT_MS))
    ])
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.7, bottom: 0.7, left: 0.75, right: 0.75 },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: FOOTER
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}
