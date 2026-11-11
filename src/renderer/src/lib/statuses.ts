import { useStore } from './store'
import type { NoteStatus } from './types'
import { STATUSES } from './types'
export function getStatuses(): { id: NoteStatus; label: string; color?: string; icon?: string; order?: number }[] {
  const definitions = useStore.getState().statuses
  const overrides = new Set(STATUSES.map((s) => `status:${s.id}`))
  return [
    ...STATUSES.filter((s) => !definitions[`status:${s.id}`]?.deleted).map((s) => ({ ...s, order: definitions[`status:${s.id}`]?.order, label: definitions[`status:${s.id}`]?.name ?? s.label, color: definitions[`status:${s.id}`]?.color, icon: definitions[`status:${s.id}`]?.icon })),
    ...Object.values(definitions).filter((s) => !s.deleted && !overrides.has(s._id)).map((s) => ({ id: s._id, label: s.name, color: s.color, icon: s.icon, order: s.order }))
  ].map((s, index) => ({ ...s, position: s.order ?? index })).sort((a, b) => a.position - b.position)
}
