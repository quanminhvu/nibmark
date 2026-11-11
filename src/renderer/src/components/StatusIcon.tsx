import { useStore } from '@/lib/store'
import { icons, Circle, CircleCheck, CirclePause, CirclePlay, CircleX } from 'lucide-react'
import type { NoteStatus } from '@/lib/types'

/**
 * Icon trạng thái: hình tròn tô màu, ký hiệu trắng bên trong
 * (đổi `filled={false}` để có dạng viền).
 */
export function StatusIcon({ status, size = 14, filled = true }: { status: NoteStatus; size?: number; filled?: boolean }): React.JSX.Element | null {
  const custom = useStore((s) => s.statuses[status.startsWith('status:') ? status : `status:${status}`])
  const glyph = custom?.icon ? icons[custom.icon as keyof typeof icons] : undefined
  const Icon = glyph ?? ( status === 'active' ? CirclePlay : status === 'onHold' ? CirclePause : status === 'completed' ? CircleCheck : status === 'dropped' ? CircleX : custom ? Circle : null)
  if (!Icon) return null
  return filled ? (
    <span className={`status-icon status-${status} filled${glyph ? ' custom-glyph' : ''}`} style={{ width: size, height: size, ...(custom ? { color: custom.color } : {}) }}>
      <Icon size={size} strokeWidth={2.2} />
    </span>
  ) : (
    <Icon size={size} style={custom ? { color: custom.color } : undefined} className={`status-${status}`} />
  )
}
