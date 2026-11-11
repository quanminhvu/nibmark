import { useStore } from './store'
import type { NoteStatus } from './types'
import { STATUSES } from './types'
export function getStatuses(): { id: NoteStatus; label: string; color?: string }[] {
  return [...STATUSES, ...Object.values(useStore.getState().statuses).map((s) => ({ id: s._id, label: s.name, color: s.color }))]
}
