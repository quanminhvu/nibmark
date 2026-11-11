import { useStore } from './store'
import type { NoteStatus } from './types'
import { STATUSES } from './types'
export function getStatuses(): { id: NoteStatus; label: string; color?: string; icon?: string }[] {
  const definitions = useStore.getState().statuses
  const overrides = new Set(STATUSES.map((s) => `status:${s.id}`))
  return [
    ...STATUSES.map((s) => ({ ...s, label: definitions[`status:${s.id}`]?.name ?? s.label, color: definitions[`status:${s.id}`]?.color, icon: definitions[`status:${s.id}`]?.icon })),
    ...Object.values(definitions).filter((s) => !overrides.has(s._id)).map((s) => ({ id: s._id, label: s.name, color: s.color, icon: s.icon }))
  ]
}
