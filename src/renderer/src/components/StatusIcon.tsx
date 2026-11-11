import { CircleCheck, CirclePause, CirclePlay, CircleX } from 'lucide-react'
import type { NoteStatus } from '@/lib/types'

/**
 * Icon trạng thái: hình tròn tô màu, ký hiệu trắng bên trong
 * (đổi `filled={false}` để có dạng viền).
 */
export function StatusIcon({ status, size = 14, filled = true }: { status: NoteStatus; size?: number; filled?: boolean }): React.JSX.Element | null {
  const Icon = status === 'active' ? CirclePlay : status === 'onHold' ? CirclePause : status === 'completed' ? CircleCheck : status === 'dropped' ? CircleX : null
  if (!Icon) return null
  return filled ? (
    <span className={`status-icon status-${status} filled`} style={{ width: size, height: size }}>
      <Icon size={size} strokeWidth={2.2} />
    </span>
  ) : (
    <Icon size={size} className={`status-${status}`} />
  )
}
