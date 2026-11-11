export interface ScrollAnchor { left: number; right: number }

/** Piecewise interpolation preserves positions around blocks with different heights. */
export function mapScroll(top: number, anchors: ScrollAnchor[], reverse = false): number {
  const source = reverse ? 'right' : 'left'
  const target = reverse ? 'left' : 'right'
  if (!anchors.length) return 0
  if (top <= anchors[0][source]) return anchors[0][target]
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i]
    if (top <= b[source]) {
      const fraction = (top - a[source]) / Math.max(1, b[source] - a[source])
      return a[target] + fraction * (b[target] - a[target])
    }
  }
  return anchors.at(-1)![target]
}

/** Synchronize by source blocks, falling back to overall progress when no map exists. */
export function syncScroll(left: HTMLElement, right: HTMLElement, getAnchors?: () => ScrollAnchor[]): () => void {
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
    const anchors = getAnchors?.() ?? []
    const maxTarget = Math.max(0, target.scrollHeight - target.clientHeight)
    const next = Math.max(0, Math.min(maxTarget, anchors.length > 1
      ? mapScroll(source.scrollTop, anchors, source === right)
      : progress * maxTarget))
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
    const content = pane.querySelector('.cm-content')
    if (content) observer.observe(content)
  }
  const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
    expected.delete(leader)
    move(leader, leader === left ? right : left)
  }) : null
  mutations?.observe(right, { childList: true, subtree: true })
  fromLeft()
  return () => {
    left.removeEventListener('scroll', fromLeft)
    right.removeEventListener('scroll', fromRight)
    observer.disconnect()
    mutations?.disconnect()
  }
}
