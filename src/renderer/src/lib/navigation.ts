import { create } from 'zustand'
import { useStore } from './store'

// Lịch sử xem ghi chú để đi back/forward, giống trình duyệt.
// Mỗi khi ghi chú đang chọn đổi (trừ khi chính back/forward gây ra) thì ghi lại.

const LIMIT = 100

interface NavState {
  back: string[]
  forward: string[]
}

export const useNav = create<NavState>(() => ({ back: [], forward: [] }))

let navigating = false
let previous: string | null = useStore.getState().selectedNoteId

useStore.subscribe((s) => {
  const current = s.selectedNoteId
  if (current === previous) return
  if (!navigating && previous) {
    const { back } = useNav.getState()
    if (back[back.length - 1] !== previous) useNav.setState({ back: [...back, previous].slice(-LIMIT), forward: [] })
  }
  previous = current
})

const exists = (id: string): boolean => !!useStore.getState().notes[id]

function go(direction: 'back' | 'forward'): boolean {
  const nav = useNav.getState()
  const from = [...nav[direction]]
  const to = [...nav[direction === 'back' ? 'forward' : 'back']]
  const current = useStore.getState().selectedNoteId
  // Bỏ qua những ghi chú đã bị xóa vĩnh viễn
  let target: string | undefined
  while (from.length && !target) {
    const id = from.pop()!
    if (exists(id) && id !== current) target = id
  }
  if (!target) {
    useNav.setState({ [direction]: from } as Partial<NavState>)
    return false
  }
  if (current) to.push(current)
  useNav.setState(direction === 'back' ? { back: from, forward: to } : { forward: from, back: to })
  navigating = true
  try {
    useStore.getState().openNote(target)
  } finally {
    navigating = false
  }
  return true
}

export const goBack = (): boolean => go('back')
export const goForward = (): boolean => go('forward')
