import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { create } from 'zustand'
import { dayKey, flushHistory, historyActivity } from '@/lib/history'
import type { HistoryActivity } from '@/lib/history'
import { countTasks } from '@/lib/markdown'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

const usePanel = create<{ open: boolean }>(() => ({ open: false }))

export function openActivity(): void {
  flushHistory()
  usePanel.setState({ open: true })
}
export const isActivityOpen = (): boolean => usePanel.getState().open
const close = (): void => usePanel.setState({ open: false })

type Metric = 'all' | 'created' | 'edited' | 'tasks'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'all', label: 'All activity' },
  { id: 'created', label: 'Notes created' },
  { id: 'edited', label: 'Notes edited' },
  { id: 'tasks', label: 'Tasks done' }
]

const WEEKS = 53
const DAY = 86_400_000

function words(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length
}

/** Thống kê hoạt động: lưới 52 tuần kiểu GitHub, chuỗi ngày liên tục và vài con số tổng. */
export function ActivityPanel(): React.JSX.Element | null {
  const open = usePanel((s) => s.open)
  if (!open) return null
  return <ActivityBody />
}

function ActivityBody(): React.JSX.Element {
  const notes = useStore((s) => s.notes)
  const [history, setHistory] = useState<HistoryActivity | null>(null)
  const [metric, setMetric] = useState<Metric>('all')

  useEffect(() => {
    void historyActivity().then(setHistory)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const live = useMemo(() => Object.values(notes).filter((n) => !n.trashed), [notes])

  const totals = useMemo(() => {
    let w = 0
    let done = 0
    let total = 0
    for (const n of live) {
      w += words(n.body)
      const t = countTasks(n.body)
      done += t.done
      total += t.total
    }
    return { notes: live.length, words: w, open: total - done, done }
  }, [live])

  // Số liệu theo ngày cho từng loại
  const perDay = useMemo(() => {
    const created = new Map<string, number>()
    for (const n of Object.values(notes)) created.set(dayKey(n.createdAt), (created.get(dayKey(n.createdAt)) ?? 0) + 1)
    const edited = new Map<string, number>()
    for (const [day, ids] of history?.edited ?? []) edited.set(day, ids.size)
    const tasks = history?.completed ?? new Map<string, number>()
    const all = new Map<string, number>()
    for (const m of [created, edited, tasks]) for (const [d, v] of m) all.set(d, (all.get(d) ?? 0) + v)
    return { created, edited, tasks, all }
  }, [notes, history])

  const values = metric === 'all' ? perDay.all : metric === 'created' ? perDay.created : metric === 'edited' ? perDay.edited : perDay.tasks

  // Lưới: cột = tuần (Chủ nhật → Thứ bảy), cột cuối là tuần này
  const grid = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = today.getTime() - (today.getDay() + (WEEKS - 1) * 7) * DAY
    const weeks: { key: string; at: number; future: boolean }[][] = []
    for (let w = 0; w < WEEKS; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        // +12h để không lệch ngày khi đổi giờ mùa hè
        const at = start + (w * 7 + d) * DAY + DAY / 2
        col.push({ key: dayKey(at), at, future: at > today.getTime() + DAY })
      }
      weeks.push(col)
    }
    return weeks
  }, [])

  const max = useMemo(() => Math.max(1, ...grid.flat().map((c) => values.get(c.key) ?? 0)), [grid, values])
  const level = (v: number): number => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)))

  // Chuỗi ngày có hoạt động (tính trên "All activity")
  const streak = useMemo(() => {
    const has = (at: number): boolean => (perDay.all.get(dayKey(at)) ?? 0) > 0
    const now = Date.now()
    let current = 0
    // Hôm nay chưa viết gì thì chuỗi vẫn tính tới hôm qua
    let at = has(now) ? now : now - DAY
    while (has(at)) {
      current++
      at -= DAY
    }
    const days = [...perDay.all.keys()].filter((k) => (perDay.all.get(k) ?? 0) > 0).sort()
    let longest = 0
    let run = 0
    let prev: number | null = null
    for (const k of days) {
      const t = new Date(`${k}T12:00:00`).getTime()
      run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
      longest = Math.max(longest, run)
      prev = t
    }
    return { current, longest }
  }, [perDay])

  const yearTotal = grid.flat().reduce((sum, c) => sum + (values.get(c.key) ?? 0), 0)
  const months = grid.map((col, i) => {
    const d = new Date(col[0].at)
    const prev = i > 0 ? new Date(grid[i - 1][0].at) : null
    return !prev || prev.getMonth() !== d.getMonth() ? d.toLocaleDateString(undefined, { month: 'short' }) : ''
  })
  const noun = metric === 'tasks' ? 'tasks done' : metric === 'created' ? 'notes created' : metric === 'edited' ? 'notes edited' : 'activities'

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal activity" role="dialog" aria-label="Activity" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Activity</h2>
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>

        <div className="act-stats">
          <Stat label="Notes" value={totals.notes} />
          <Stat label="Words" value={totals.words} />
          <Stat label="Open tasks" value={totals.open} />
          <Stat label="Done tasks" value={totals.done} />
          <Stat label="Current streak" value={streak.current} unit={streak.current === 1 ? 'day' : 'days'} />
          <Stat label="Longest streak" value={streak.longest} unit={streak.longest === 1 ? 'day' : 'days'} />
        </div>

        <div className="act-head">
          <span>
            <strong>{yearTotal.toLocaleString()}</strong> {noun} in the last year
          </span>
          <div className="segmented small">
            {METRICS.map((m) => (
              <button key={m.id} className={cx(metric === m.id && 'on')} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="act-grid-wrap">
          <div className="act-months">
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="act-grid">
            {grid.map((col, i) => (
              <div key={i} className="act-col">
                {col.map((c) => {
                  const v = values.get(c.key) ?? 0
                  const date = new Date(c.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  return (
                    <span
                      key={c.key}
                      className={cx('act-cell', `l${level(v)}`, c.future && 'future')}
                      title={c.future ? '' : `${v} ${noun} · ${date}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="act-legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`act-cell l${l}`} />
            ))}
            <span>More</span>
          </div>
        </div>

        <p className="pref-note">
          Edits and completed tasks come from version history on this computer
          {history?.since ? ` (since ${new Date(history.since).toLocaleDateString()})` : ''}. Created notes come from each note&rsquo;s
          creation date.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit?: string }): React.JSX.Element {
  return (
    <div className="act-stat">
      <span className="act-value">
        {value.toLocaleString()}
        {unit && <small> {unit}</small>}
      </span>
      <span className="act-label">{label}</span>
    </div>
  )
}
