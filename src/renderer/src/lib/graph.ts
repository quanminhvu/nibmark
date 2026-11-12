import { create } from 'zustand'
import { linkedNoteIds } from './markdown'
import type { Note } from './types'

// Đồ thị liên kết: mỗi ghi chú là một nút, mỗi link [Tiêu đề](nibmark://note/…) là một cạnh.
// Tự bố trí bằng mô phỏng lực đơn giản (đẩy nhau, lò xo theo cạnh, hút nhẹ về giữa).

export interface GraphNode {
  id: string
  title: string
  degree: number
  x: number
  y: number
  vx: number
  vy: number
  /** Đang bị kéo: giữ nguyên vị trí */
  fixed?: boolean
}

export interface Graph {
  nodes: GraphNode[]
  edges: [number, number][]
  /** Hàng xóm của từng nút (theo chỉ số) */
  adjacent: Set<number>[]
}

const linkCache = new WeakMap<Note, Set<string>>()
export function noteLinks(note: Note): Set<string> {
  let ids = linkCache.get(note)
  if (!ids) {
    ids = linkedNoteIds(note.body)
    linkCache.set(note, ids)
  }
  return ids
}

export type GraphMode = 'all' | 'local'

/**
 * Dựng đồ thị từ các ghi chú (bỏ thùng rác).
 * - all: mọi ghi chú có link (thêm ghi chú lẻ loi nếu orphans = true)
 * - local: ghi chú `focus` và các ghi chú cách nó tối đa `depth` bước
 */
export function buildGraph(notes: Note[], mode: GraphMode, focus: string | null, orphans = false, depth = 2): Graph {
  const live = new Map(notes.filter((n) => !n.trashed).map((n) => [n._id, n]))
  const neighbours = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    neighbours.get(a)!.add(b)
  }
  const pairs: [string, string][] = []
  const seen = new Set<string>()
  for (const note of live.values()) {
    for (const target of noteLinks(note)) {
      if (target === note._id || !live.has(target)) continue
      const key = note._id < target ? `${note._id}|${target}` : `${target}|${note._id}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([note._id, target])
      link(note._id, target)
      link(target, note._id)
    }
  }

  let ids: string[]
  if (mode === 'local' && focus && live.has(focus)) {
    const keep = new Set([focus])
    let frontier = [focus]
    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      for (const id of frontier) for (const n of neighbours.get(id) ?? []) if (!keep.has(n)) (keep.add(n), next.push(n))
      frontier = next
    }
    ids = [...keep]
  } else {
    ids = [...live.keys()].filter((id) => orphans || neighbours.has(id))
  }

  const index = new Map(ids.map((id, i) => [id, i]))
  // Xếp ban đầu theo hình xoắn ốc (ổn định, không ngẫu nhiên): mô phỏng hội tụ nhanh hơn
  const nodes: GraphNode[] = ids.map((id, i) => {
    const r = 12 * Math.sqrt(i + 0.5)
    const a = i * 2.39996
    return { id, title: live.get(id)!.title.trim() || 'Untitled', degree: neighbours.get(id)?.size ?? 0, x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0 }
  })
  const edges: [number, number][] = []
  const adjacent = nodes.map(() => new Set<number>())
  for (const [a, b] of pairs) {
    const i = index.get(a)
    const j = index.get(b)
    if (i === undefined || j === undefined) continue
    edges.push([i, j])
    adjacent[i].add(j)
    adjacent[j].add(i)
  }
  return { nodes, edges, adjacent }
}

const CELL = 140
const REPULSION = 2600
const SPRING = 0.05
const LENGTH = 80
const GRAVITY = 0.012
const DAMPING = 0.82

/** Một bước mô phỏng; alpha giảm dần về 0 thì đồ thị đứng yên */
export function tick(graph: Graph, alpha: number): void {
  const { nodes, edges } = graph
  // Lực đẩy: chỉ xét các nút ở ô lưới lân cận (nhanh với vài nghìn nút)
  const grid = new Map<string, number[]>()
  nodes.forEach((n, i) => {
    const key = `${Math.floor(n.x / CELL)},${Math.floor(n.y / CELL)}`
    const cell = grid.get(key)
    if (cell) cell.push(i)
    else grid.set(key, [i])
  })
  nodes.forEach((a, i) => {
    const cx = Math.floor(a.x / CELL)
    const cy = Math.floor(a.y / CELL)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j <= i) continue
          const b = nodes[j]
          let x = a.x - b.x
          let y = a.y - b.y
          let d2 = x * x + y * y
          if (d2 < 0.01) {
            x = (i - j) * 0.1
            y = 0.1
            d2 = x * x + y * y
          }
          if (d2 > CELL * CELL * 2) continue
          const f = (REPULSION / d2) * alpha
          const d = Math.sqrt(d2)
          a.vx += (x / d) * f
          a.vy += (y / d) * f
          b.vx -= (x / d) * f
          b.vy -= (y / d) * f
        }
  })
  for (const [i, j] of edges) {
    const a = nodes[i]
    const b = nodes[j]
    const x = b.x - a.x
    const y = b.y - a.y
    const d = Math.sqrt(x * x + y * y) || 1
    const f = (d - LENGTH) * SPRING * alpha
    a.vx += (x / d) * f
    a.vy += (y / d) * f
    b.vx -= (x / d) * f
    b.vy -= (y / d) * f
  }
  for (const n of nodes) {
    n.vx -= n.x * GRAVITY * alpha
    n.vy -= n.y * GRAVITY * alpha
    if (n.fixed) {
      n.vx = 0
      n.vy = 0
      continue
    }
    n.vx *= DAMPING
    n.vy *= DAMPING
    n.x += n.vx
    n.y += n.vy
  }
}

/** Trạng thái mở bảng đồ thị */
export const useGraph = create<{ open: boolean; mode: GraphMode; focus: string | null }>(() => ({ open: false, mode: 'all', focus: null }))

export function openGraph(mode: GraphMode = 'all', focus: string | null = null): void {
  useGraph.setState({ open: true, mode, focus })
}
export const closeGraph = (): void => useGraph.setState({ open: false })
export const isGraphOpen = (): boolean => useGraph.getState().open
