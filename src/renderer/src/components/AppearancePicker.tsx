import { useEffect, useRef, useState } from 'react'
import { Check, Search, X, icons } from 'lucide-react'
import { TAG_COLORS } from '@/lib/types'

export interface AppearanceTarget {
  name: string
  color: string
  icon?: string
  onSave: (color: string, icon: string, name: string) => boolean
}
const SUGGESTED = ['Circle', 'Play', 'Pause', 'Check', 'X', 'Clock', 'Flag', 'Star', 'Heart', 'Eye', 'Bug', 'Code', 'Rocket', 'Archive', 'ListTodo', 'Loader', 'Ban', 'Flame', 'Lightbulb']
export function AppearancePicker({ target, onClose }: { target: AppearanceTarget; onClose: () => void }): React.JSX.Element {
  const [name, setName] = useState(target.name)
  const [color, setColor] = useState(target.color)
  const [icon, setIcon] = useState(target.icon ?? 'Circle')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const isStatus = target.icon !== undefined
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
      if (e.key === 'Tab') {
        const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])
        const first = controls[0], last = controls.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus() }
  }, [onClose])
  const names = query.trim() ? Object.keys(icons).filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 150) : SUGGESTED.filter((n) => icons[n as keyof typeof icons])
  const Glyph = icons[icon as keyof typeof icons] ?? icons.Circle
  return <div className="modal-backdrop appearance-backdrop" onMouseDown={onClose}>
    <form ref={formRef} className="appearance-picker" role="dialog" aria-modal="true" aria-label={`Edit ${isStatus ? 'status' : 'tag'}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => {
      e.preventDefault()
      if (!target.onSave(color, icon, name.trim())) { setError('Choose a unique, non-empty name.'); return }
      onClose()
    }}>
      <header className="appearance-header"><div><h3>Edit {isStatus ? 'status' : 'tag'}</h3><p>Make it easy to recognize.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button></header>
      <div className="appearance-content">
        <div className="appearance-sample"><span className={isStatus ? 'appearance-badge' : 'appearance-tag-dot'} style={{ backgroundColor: isStatus ? color : undefined, borderColor: color }}>{isStatus && <Glyph size={20} />}</span><span>{name.trim() || 'Untitled'}</span></div>
        <label className="appearance-field">Name<input autoFocus aria-label="Name" value={name} maxLength={100} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setName(e.target.value); setError('') }} /></label>
        {error && <p className="appearance-error" role="alert">{error}</p>}
        <div className="appearance-color-heading"><span>Color</span><label className="appearance-custom-color"><input aria-label="Color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /><span>{color.toUpperCase()}</span></label></div>
        <div className="appearance-colors">{TAG_COLORS.map((c) => <button type="button" key={c} aria-label={`Use ${c}`} aria-pressed={color.toLowerCase() === c.toLowerCase()} style={{ background: c }} onClick={() => setColor(c)}>{color.toLowerCase() === c.toLowerCase() && <Check size={15} />}</button>)}</div>
        {isStatus && <section className="appearance-icons"><div className="appearance-icon-heading"><span>Icon</span><span>{icon}</span></div><label className="appearance-search"><Search size={15} /><input aria-label="Search icons" placeholder="Search icons…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="appearance-icon-grid">{names.length === 0 && <p>No icons found.</p>}{names.map((n) => {
            const Icon = icons[n as keyof typeof icons]
            return <button type="button" key={n} title={n} aria-label={n} aria-pressed={icon === n} onClick={() => setIcon(n)}><Icon size={20} /></button>
          })}</div>
        </section>}
      </div>
      <footer className="appearance-actions"><button type="button" className="appearance-cancel" onClick={onClose}>Cancel</button><button type="submit" className="appearance-save" disabled={!name.trim()}>Save changes</button></footer>
    </form>
  </div>
}
