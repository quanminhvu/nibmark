import { CircleCheck, CircleDot, CirclePause, CircleX } from 'lucide-react'
import type { NoteStatus } from '@/lib/types'

export function StatusIcon({ status, size = 14 }: { status: NoteStatus; size?: number }): React.JSX.Element | null {
  switch (status) {
    case 'active':
      return <CircleDot size={size} className="status-active" />
    case 'onHold':
      return <CirclePause size={size} className="status-onHold" />
    case 'completed':
      return <CircleCheck size={size} className="status-completed" />
    case 'dropped':
      return <CircleX size={size} className="status-dropped" />
    default:
      return null
  }
}
