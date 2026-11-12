import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { MAX_FILE_BYTES, missingFiles, readBackup, writeBackup, writeFileBackup } from './backup'
import { freshDir, isAttachmentList, safeName, writeAttachments, writeTree } from './exporter'
import type { ExportFile } from './exporter'
import { backupDir, defaultBackupDir, getSettings, updateSettings } from './settings'
import { ensureStylesFile, ensureThemesDir, listUserThemes, readUserStyles } from './themes'
import { scanImport } from './importer'
import { fetchGithubSnippet, fetchTitle } from './web'
import { htmlToPdf } from './pdf'
import { readAppleNotes, scanFromDump } from './appleNotes'
import type { AppleNotesDump } from './appleNotes'
import { readFileSync, statSync } from 'node:fs'

export interface SettingsView {
  backupEnabled: boolean
  backupDir: string
  isDefaultDir: boolean
  lastBackupAt: number | null
  trayEnabled: boolean
  traySupported: boolean
}

function view(): SettingsView {
  const s = getSettings()
  return { backupEnabled: s.backupEnabled, backupDir: backupDir(), isDefaultDir: s.backupDir === null, lastBackupAt: s.lastBackupAt, trayEnabled: s.trayEnabled, traySupported: process.platform !== 'darwin' }
}

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isExportFiles(value: unknown): value is ExportFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (f) =>
        f &&
        typeof f === 'object' &&
        Array.isArray((f as ExportFile).folders) &&
        (f as ExportFile).folders.every((x) => typeof x === 'string') &&
        typeof (f as ExportFile).name === 'string' &&
        typeof (f as ExportFile).content === 'string'
    )
  )
}

export { view as settingsView }

export function registerIpc(openNoteWindow: (noteId: string) => void): void {
  ipcMain.on('window:openNote', (_e, id: unknown) => {
    if (typeof id === 'string' && /^note:[A-Za-z0-9_-]{1,64}$/.test(id)) openNoteWindow(id)
  })
  const win = (event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined =>
    BrowserWindow.fromWebContents(event.sender) ?? undefined

  ipcMain.handle('settings:get', () => view())

  ipcMain.handle('settings:setBackupEnabled', (_e, enabled: unknown) => {
    updateSettings({ backupEnabled: enabled === true })
    return view()
  })

  ipcMain.handle('settings:chooseBackupDir', async (event) => {
    const res = await dialog.showOpenDialog(win(event)!, {
      title: 'Choose Backup Folder',
      buttonLabel: 'Use This Folder',
      defaultPath: backupDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (!res.canceled && res.filePaths[0]) updateSettings({ backupDir: res.filePaths[0] })
    return view()
  })

  ipcMain.handle('settings:resetBackupDir', () => {
    updateSettings({ backupDir: null })
    return view()
  })

  ipcMain.handle('backup:write', (_e, upserts: unknown, deletes: unknown) =>
    writeBackup(Array.isArray(upserts) ? upserts : [], Array.isArray(deletes) ? deletes : [])
  )

  ipcMain.handle('backup:missingFiles', (_e, ids: unknown) => missingFiles(Array.isArray(ids) ? ids : []))
  ipcMain.handle('backup:writeFile', (_e, meta: unknown, bytes: unknown) => writeFileBackup(meta, bytes))

  // Mở một file đính kèm bằng ứng dụng mặc định: ghi ra thư mục tạm do main chọn rồi mở
  ipcMain.handle('file:open', async (_e, id: unknown, name: unknown, bytes: unknown) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof name !== 'string') return 'Invalid file'
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_FILE_BYTES) return 'Invalid file'
    const dir = join(app.getPath('temp'), 'nibmark-open', id)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, safeName(name, 'attachment'))
    await writeFile(path, bytes)
    return (await shell.openPath(path)) || null
  })

  ipcMain.handle('backup:open', async () => {
    const dir = backupDir()
    if (!existsSync(dir)) return 'The backup folder does not exist yet.'
    return (await shell.openPath(dir)) || null
  })

  ipcMain.handle('backup:pickAndRead', async (event) => {
    const res = await dialog.showOpenDialog(win(event)!, {
      title: 'Restore from Backup',
      buttonLabel: 'Restore',
      message: 'Choose a Nibmark backup folder. Notes that are newer here will not be overwritten.',
      defaultPath: existsSync(backupDir()) ? backupDir() : defaultBackupDir(),
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return readBackup(res.filePaths[0])
  })

  // Import: main chỉ đọc những gì hộp thoại trả về
  ipcMain.handle('import:pick', async (event) => {
    const res = await dialog.showOpenDialog(win(event)!, {
      title: 'Import Notes',
      buttonLabel: 'Import',
      message: 'Choose Markdown or HTML files, a folder (Obsidian, Notion, Bear export), a .zip export or an Evernote .enex file.',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'Notes', extensions: ['md', 'markdown', 'txt', 'html', 'htm', 'enex', 'zip', 'textbundle'] }]
    })
    if (res.canceled || !res.filePaths.length) return null
    return scanImport(res.filePaths)
  })

  ipcMain.handle('web:title', (_e, url: unknown) => fetchTitle(url))
  ipcMain.handle('web:githubSnippet', (_e, url: unknown) => fetchGithubSnippet(url))
  // Apple Notes: hồ sơ thử nghiệm có thể dùng dữ liệu mẫu thay cho Notes thật
  ipcMain.handle('import:appleNotes', async () => {
    const fixture = process.env['NIBMARK_USER_DATA'] ? process.env['NIBMARK_APPLE_NOTES_FIXTURE'] : undefined
    if (fixture) return scanFromDump(JSON.parse(readFileSync(fixture, 'utf8')) as AppleNotesDump)
    return readAppleNotes()
  })
  // Kindle: người dùng chọn file "My Clippings.txt"
  ipcMain.handle('import:kindlePick', async (event) => {
    const res = await dialog.showOpenDialog(win(event)!, {
      title: 'Import Kindle Highlights',
      buttonLabel: 'Import',
      message: 'Choose “My Clippings.txt” from the documents folder of your Kindle.',
      properties: ['openFile'],
      filters: [{ name: 'Kindle clippings', extensions: ['txt'] }]
    })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    if (statSync(path).size > 50 * 1024 * 1024) return { error: 'This file is larger than 50 MB.' }
    return { text: readFileSync(path, 'utf8') }
  })
  ipcMain.handle('export:html', async (event, title: unknown, html: unknown) => {
    if (typeof title !== 'string' || typeof html !== 'string') return null
    const res = await dialog.showSaveDialog(win(event)!, {
      title: 'Export Note as HTML',
      defaultPath: `${safeName(title)}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, html, 'utf8')
    return res.filePath
  })
  ipcMain.handle('export:pdf', async (event, title: unknown, html: unknown) => {
    if (typeof title !== 'string' || typeof html !== 'string') return null
    const res = await dialog.showSaveDialog(win(event)!, {
      title: 'Export Note as PDF',
      defaultPath: `${safeName(title)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, new Uint8Array(await htmlToPdf(html)))
    return res.filePath
  })
  ipcMain.handle('app:openDataFolder', async () => (await shell.openPath(app.getPath('userData'))) || null)
  ipcMain.handle('themes:list', () => listUserThemes())
  // Lớp trong mờ của macOS (vibrancy) theo giao diện hệ thống; đổi sang sáng/tối
  // cho khớp theme đang dùng, nếu không sidebar sẽ sáng mà chữ lại sáng.
  ipcMain.on('themes:appearance', (_e, mode: unknown) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') nativeTheme.themeSource = mode
  })
  ipcMain.handle('themes:openFolder', async () => (await shell.openPath(ensureThemesDir())) || null)
  ipcMain.handle('styles:get', () => readUserStyles())
  ipcMain.handle('styles:open', async () => (await shell.openPath(ensureStylesFile())) || null)

  ipcMain.handle('export:note', async (event, title: unknown, content: unknown, attachments: unknown = []) => {
    if (typeof title !== 'string' || typeof content !== 'string' || !isAttachmentList(attachments)) return null
    const res = await dialog.showSaveDialog(win(event)!, {
      title: 'Export Note as Markdown',
      defaultPath: `${safeName(title)}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, content, 'utf8')
    writeAttachments(dirname(res.filePath), attachments)
    return res.filePath
  })

  ipcMain.handle('export:tree', async (event, label: unknown, files: unknown, attachments: unknown = []) => {
    if (typeof label !== 'string' || !isExportFiles(files) || !isAttachmentList(attachments)) return null
    const res = await dialog.showOpenDialog(win(event)!, {
      title: 'Export as Markdown',
      buttonLabel: 'Export Here',
      message: 'A new folder will be created inside the folder you choose.',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const root = freshDir(res.filePaths[0], safeName(`${label} ${today()}`, 'Nibmark Export'))
    const count = writeTree(root, files)
    writeAttachments(root, attachments)
    shell.showItemInFolder(root)
    return { path: root, count }
  })
}
