import { useEffect, useState } from 'react'
import { icons } from 'lucide-react'
import { TAG_COLORS } from '@/lib/types'

export interface AppearanceTarget {
  name: string
  color: string
  icon?: string
  onSave: (color: string, icon: string) => void
}
const SUGGESTED = ['Circle', 'Play', 'Pause', 'Check', 'X', 'Clock', 'CircleHelp', 'Flag', 'Star', 'Heart', 'Eye', 'Bug', 'Code', 'Rocket', 'Archive', 'ListTodo', 'Loader', 'Ban', 'Flame', 'Lightbulb']
export function AppearancePicker({ target, onClose }: { target: AppearanceTarget; onClose: () => void }): React.JSX.Element {
  const [color, setColor] = useState(target.color)
  const [icon, setIcon] = useState(target.icon ?? 'Circle')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  const names = query.trim() ? Object.keys(icons).filter((name) => name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 150) : SUGGESTED.filter((name) => icons[name as keyof typeof icons])
  const Glyph = icons[icon as keyof typeof icons] ?? icons.Circle
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <form className="appearance-picker" role="dialog" aria-modal="true" aria-label={`Appearance for ${target.name}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); target.onSave(color, icon); onClose() }}>
      <h3>{target.name}</h3>
      <div className="appearance-sample" style={{ color }}><Glyph size={22} /><span>{target.name}</span></div>
      <label>Color <input aria-label="Color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <div className="appearance-colors">{TAG_COLORS.map((c) => <button type="button" key={c} aria-label={`Use ${c}`} aria-pressed={color.toLowerCase() === c.toLowerCase()} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
      {target.icon !== undefined && <>
        <label>Icon <input autoFocus aria-label="Search icons" placeholder="Search icons…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="icon-grid">{names.map((name) => {
          const Icon = icons[name as keyof typeof icons]
          return <button type="button" key={name} title={name} aria-label={name} aria-pressed={icon === name} className={icon === name ? 'on' : ''} onClick={() => setIcon(name)}><Icon size={20} /></button>
        })}</div>
      </>}
      <div className="appearance-actions"><button type="button" className="text-btn" onClick={onClose}>Cancel</button><button type="submit" className="text-btn">Save</button></div>
    </form>
  </div>
}
