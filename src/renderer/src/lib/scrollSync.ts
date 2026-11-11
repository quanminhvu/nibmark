/** Keep both panes at the same reading progress despite different content heights. */
export function syncScroll(left: HTMLElement, right: HTMLElement): () => void {
  const expected = new WeakMap<HTMLElement, number>()
  let leader = left
  const move = (source: HTMLElement, target: HTMLElement): void => {
    const pending = expected.get(source)
    expected.delete(source)
    if (pending !== undefined && Math.abs(source.scrollTop - pending) < 1) return
    leader = source
    const range = source.scrollHeight - source.clientHeight
    if (range <= 0) return
    const progress = Math.max(0, Math.min(1, source.scrollTop / range))
    const next = progress * Math.max(0, target.scrollHeight - target.clientHeight)
    if (Math.abs(target.scrollTop - next) < 1) return
    target.scrollTop = next
    expected.set(target, target.scrollTop)
  }
  const fromLeft = (): void => move(left, right)
  const fromRight = (): void => move(right, left)
  left.addEventListener('scroll', fromLeft, { passive: true })
  right.addEventListener('scroll', fromRight, { passive: true })
  // Re-align after images, diagrams or window resizing change content height.
  const observer = new ResizeObserver(() => {
    expected.delete(leader)
    move(leader, leader === left ? right : left)
  })
  for (const pane of [left, right]) {
    observer.observe(pane)
    if (pane.firstElementChild) observer.observe(pane.firstElementChild)
  }
  fromLeft()
  return () => {
    left.removeEventListener('scroll', fromLeft)
    right.removeEventListener('scroll', fromRight)
    observer.disconnect()
  }
}
