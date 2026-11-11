import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { backupNow, exportNotes, restoreFromBackup } from '@/lib/actions'
import { onBackupStatus } from '@/lib/backup'
import type { BackupStatus } from '@/lib/backup'
import { useStore } from '@/lib/store'
import { BUILTIN_THEMES, useTheme } from '@/lib/theme'
import type { ThemeInfo } from '@/lib/theme'
import { cx } from '@/lib/util'
import { relativeTime } from '@/lib/util'
import { runImport } from '@/lib/importer'
import { useEditorPrefs } from '@/lib/editorPrefs'
import type { WrapMode } from '@/lib/editorPrefs'

export function Preferences(): React.JSX.Element | null {
  const open = useStore((s) => s.prefsOpen)
  const setOpen = useStore((s) => s.setPrefsOpen)
  const [settings, setSettings] = useState<NibmarkSettings | null>(null)
  const [status, setStatus] = useState<BackupStatus>({ lastBackupAt: null, error: null })
  const bridge = window.nibmark

  useEffect(() => {
    if (!open || !bridge) return
    void bridge.settings.get().then(setSettings)
    return onBackupStatus(setStatus)
  }, [open, bridge])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open) return null

  const lastBackup = status.lastBackupAt ?? settings?.lastBackupAt ?? null

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-label="Preferences" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Preferences</h2>
          <button className="icon-btn" title="Close (Esc)" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </header>

        <Appearance />
        <EditorSection />
        <QuickNote />
        <Templates />

        {!bridge ? (
          <p className="pref-note">Backup and export are only available in the desktop app.</p>
        ) : (
          <>
            <section className="pref-section">
              <h3>Backup</h3>
              <label className="pref-toggle">
                <input
                  type="checkbox"
                  checked={settings?.backupEnabled ?? false}
                  onChange={async (e) => setSettings(await bridge.settings.setBackupEnabled(e.target.checked))}
                />
                <span>Continuously back up notes to a folder</span>
              </label>
              <p className="pref-note">
                Every note, notebook and tag is saved as a JSON file while you work. Deleted items are moved to a
                &ldquo;deleted&rdquo; subfolder, never removed.
              </p>

              <div className="pref-row">
                <span className="pref-label">Folder</span>
                <code className="pref-path" title={settings?.backupDir}>
                  {settings?.backupDir ?? '…'}
                </code>
              </div>
              <div className="pref-actions">
                <button className="btn" onClick={async () => setSettings(await bridge.settings.chooseBackupDir())}>
                  Change…
                </button>
                {settings && !settings.isDefaultDir && (
                  <button className="btn" onClick={async () => setSettings(await bridge.settings.resetBackupDir())}>
                    Use Default
                  </button>
                )}
                <button
                  className="btn"
                  onClick={async () => {
                    const error = await bridge.backup.open()
                    if (error) useStore.getState().showNotice(error, 'error')
                  }}
                >
                  Show in Finder
                </button>
                <span className="flex-1" />
                <button className="btn primary" disabled={!settings?.backupEnabled} onClick={() => void backupNow()}>
                  Back Up Now
                </button>
              </div>
              <p className={status.error ? 'pref-status error' : 'pref-status'}>
                {status.error
                  ? `Last backup failed: ${status.error}`
                  : lastBackup
                    ? `Last backup ${relativeTime(lastBackup)}`
                    : 'No backup yet'}
              </p>
            </section>

            <section className="pref-section">
              <h3>Restore</h3>
              <p className="pref-note">
                Bring notes back from a backup folder. Notes that are newer in Nibmark are kept as they are.
              </p>
              <div className="pref-actions">
                <button className="btn" onClick={() => void restoreFromBackup()}>
                  Restore from Backup…
                </button>
              </div>
            </section>

            <section className="pref-section">
              <h3>Data</h3>
              <p className="pref-note">
                The note database, version history, themes and settings live in Nibmark&rsquo;s data folder.
              </p>
              <div className="pref-actions">
                <button
                  className="btn"
                  onClick={async () => {
                    const error = await bridge.openDataFolder()
                    if (error) useStore.getState().showNotice(error, 'error')
                  }}
                >
                  Open Data Folder
                </button>
                <button className="btn" onClick={() => void runImport()}>
                  Import Notes…
                </button>
              </div>
            </section>

            <section className="pref-section">
              <h3>Export</h3>
              <p className="pref-note">
                Save all notes as Markdown files, in folders that mirror your notebooks. Notes in the Trash are left out.
              </p>
              <div className="pref-actions">
                <button className="btn" onClick={() => void exportNotes(null)}>
                  Export All Notes…
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function ThemeSwatch({ theme, selected, onPick }: { theme: ThemeInfo | null; selected: boolean; onPick: () => void }): React.JSX.Element {
  // null = "System": nửa Mist, nửa Night
  const base = theme?.base ?? 'mist'
  return (
    <button className={cx('theme-swatch', selected && 'selected')} onClick={onPick} title={theme ? theme.name : 'Match macOS appearance'}>
      <span className="theme-sample" data-theme={base} data-user-theme={theme?.id.startsWith('user:') ? theme.id.slice(5) : undefined}>
        <span className="ts-side" />
        <span className="ts-list" />
        <span className="ts-body">
          <span className="ts-line strong" />
          <span className="ts-line" />
          <span className="ts-line accent" />
        </span>
        {!theme && (
          <span className="ts-half" data-theme="night">
            <span className="ts-side" />
            <span className="ts-list" />
            <span className="ts-body">
              <span className="ts-line strong" />
              <span className="ts-line" />
              <span className="ts-line accent" />
            </span>
          </span>
        )}
      </span>
      <span className="theme-name">{theme ? theme.name : 'System'}</span>
    </button>
  )
}

function Appearance(): React.JSX.Element {
  const choice = useTheme((s) => s.choice)
  const userThemes = useTheme((s) => s.userThemes)
  const setChoice = useTheme((s) => s.setChoice)
  const bridge = window.nibmark
  const report = (error: string | null): void => {
    if (error) useStore.getState().showNotice(error, 'error')
  }
  return (
    <section className="pref-section">
      <h3>Appearance</h3>
      <div className="theme-grid">
        <ThemeSwatch theme={null} selected={choice === 'system'} onPick={() => setChoice('system')} />
        {[...BUILTIN_THEMES, ...userThemes].map((t) => (
          <ThemeSwatch key={t.id} theme={t} selected={choice === t.id} onPick={() => setChoice(t.id)} />
        ))}
      </div>
      {bridge && (
        <>
          <p className="pref-note">
            Add your own themes as .css files in the themes folder, or tweak any theme with your own styles.css. Changes
            show up when you come back to Nibmark.
          </p>
          <div className="pref-actions">
            <button className="btn" onClick={async () => report(await bridge.themes.openFolder())}>
              Open Themes Folder
            </button>
            <button className="btn" onClick={async () => report(await bridge.themes.openUserStyles())}>
              Edit styles.css
            </button>
            <button className="btn" onClick={() => void useTheme.getState().reloadUserFiles()}>
              Reload
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function EditorSection(): React.JSX.Element {
  const p = useEditorPrefs()
  const toggle = (key: 'lineNumbers' | 'readableWidth' | 'spellcheck' | 'strikeDone', label: string): React.JSX.Element => (
    <label className="pref-toggle">
      <input type="checkbox" checked={p[key]} onChange={(e) => p.set({ [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  )
  return (
    <section className="pref-section">
      <h3>Editor</h3>
      {toggle('lineNumbers', 'Show line numbers')}
      {toggle('readableWidth', 'Limit line width for easier reading')}
      {toggle('spellcheck', 'Check spelling')}
      {toggle('strikeDone', 'Strike through completed tasks')}
      <div className="pref-row">
        <span className="pref-label">Line wrapping</span>
        <select className="pref-select" value={p.wrap} onChange={(e) => p.set({ wrap: e.target.value as WrapMode })}>
          <option value="all">Wrap all lines</option>
          <option value="prose">Wrap text, not code blocks or tables</option>
          <option value="none">Don&rsquo;t wrap</option>
        </select>
      </div>
    </section>
  )
}

function Templates(): React.JSX.Element {
  const templates = useStore((s) => s.templates)
  const { renameTemplate, deleteTemplate } = useStore.getState()
  const list = Object.values(templates).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section className="pref-section">
      <h3>Templates</h3>
      <p className="pref-note">
        Press {isMacKey()}T to start a note from a template. Save any note as a template from the command palette
        ({isMacKey()}K, &ldquo;Save Note as Template&rdquo;). Use {'{{date}}'}, {'{{time}}'} or {'{{weekday}}'} in a
        template&rsquo;s title or body.
      </p>
      {list.length === 0 ? (
        <p className="pref-status">You have no templates of your own yet. Five built-in templates are always available.</p>
      ) : (
        <ul className="pref-templates">
          {list.map((t) => (
            <li key={t._id}>
              <input
                defaultValue={t.name}
                onBlur={(e) => renameTemplate(t._id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <button
                className="text-btn danger"
                onClick={() => {
                  if (window.confirm(`Delete the template "${t.name}"? Notes made from it are not affected.`)) deleteTemplate(t._id)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const isMacKey = (): string => (window.nibmark?.platform === 'darwin' ? '⌘' : 'Ctrl+')

/** Đổi chuỗi phím tắt kiểu Electron thành ký hiệu dễ đọc, ví dụ ⌘⌥N */
function prettyAccelerator(acc: string): string {
  if (!acc) return 'Off'
  const mac = window.nibmark?.platform === 'darwin'
  const map: Record<string, string> = mac
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Space: 'Space' }
    : { CommandOrControl: 'Ctrl', Command: 'Win', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Space' }
  const parts = acc.split('+').map((p) => map[p] ?? p)
  return mac ? parts.join('') : parts.join('+')
}

/** Ghi lại tổ hợp phím người dùng bấm thành chuỗi Electron (cần ít nhất một phím bổ trợ) */
function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  const mac = window.nibmark?.platform === 'darwin'
  const mods: string[] = []
  if (e.metaKey) mods.push(mac ? 'CommandOrControl' : 'Super')
  if (e.ctrlKey) mods.push(mac ? 'Control' : 'CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const code = e.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^F\d{1,2}$/.test(code)) key = code
  else if (code === 'Space') key = 'Space'
  else if (code === 'Period') key = '.'
  else if (code === 'Comma') key = ','
  else if (code === 'Slash') key = '/'
  if (!key || (!mods.length && !/^F\d/.test(key))) return null
  return [...mods, key].join('+')
}

function QuickNote(): React.JSX.Element | null {
  const bridge = window.nibmark
  const [status, setStatus] = useState<NibmarkShortcutStatus | null>(null)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (bridge) void bridge.shortcuts.get().then(setStatus)
  }, [bridge])

  if (!bridge) return null
  const save = async (acc: string): Promise<void> => {
    setRecording(false)
    setStatus(await bridge.shortcuts.set(acc))
  }

  return (
    <section className="pref-section">
      <h3>Quick Note</h3>
      <p className="pref-note">
        A global shortcut that brings Nibmark to the front with a new note, even when the app is in the background.
      </p>
      <div className="pref-actions">
        <button
          className={recording ? 'btn shortcut-field recording' : 'btn shortcut-field'}
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            e.preventDefault()
            e.stopPropagation()
            if (e.key === 'Escape') {
              setRecording(false)
              return
            }
            const acc = acceleratorFromEvent(e)
            if (acc) void save(acc)
          }}
        >
          {recording ? 'Press a shortcut…' : prettyAccelerator(status?.accelerator ?? '')}
        </button>
        {status?.accelerator && (
          <button className="btn" onClick={() => void save('')}>
            Turn Off
          </button>
        )}
        {status?.accelerator !== 'CommandOrControl+Alt+N' && (
          <button className="btn" onClick={() => void save('CommandOrControl+Alt+N')}>
            Use Default
          </button>
        )}
      </div>
      <p className={status?.error ? 'pref-status error' : 'pref-status'}>
        {status?.disabledForTesting
          ? 'Global shortcuts are turned off in this test profile.'
          : status?.error
            ? `${prettyAccelerator(status.accelerator)}: ${status.error}`
            : status?.registered
              ? 'Active'
              : 'Off'}
      </p>
    </section>
  )
}
