import { goBack, goForward } from './navigation'

// Vuốt ngang hai ngón trên trackpad để back/forward giữa các ghi chú (như trình duyệt).
// Bỏ qua khi chỗ đang vuốt còn cuộn ngang được (bảng, khối code, bảng Kanban…).

const THRESHOLD = 160
const QUIET_MS = 300
const COOLDOWN_MS = 900

function canScrollX(start: EventTarget | null, dx: number): boolean {
  for (let el = start instanceof Element ? start : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue
    const overflow = getComputedStyle(el).overflowX
    if (overflow !== 'auto' && overflow !== 'scroll') continue
    if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
  }
  return false
}

export function startSwipeNavigation(): () => void {
  let total = 0
  let last = 0
  let blockedUntil = 0
  const onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 2) return
    const now = performance.now()
    if (now - last > QUIET_MS) total = 0
    last = now
    if (now < blockedUntil || canScrollX(e.target, e.deltaX)) {
      total = 0
      return
    }
    total += e.deltaX
    if (Math.abs(total) < THRESHOLD) return
    // Ngón tay vuốt sang phải (deltaX âm) = quay lại
    if (total < 0) goBack()
    else goForward()
    total = 0
    blockedUntil = now + COOLDOWN_MS
  }
  window.addEventListener('wheel', onWheel, { passive: true })
  return () => window.removeEventListener('wheel', onWheel)
}
