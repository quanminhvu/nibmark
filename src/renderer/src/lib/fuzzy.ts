export interface FuzzyMatch {
  score: number
  /** Vị trí các ký tự khớp, để tô sáng */
  indices: number[]
}

/**
 * So khớp mờ kiểu "gõ tắt": mọi ký tự của truy vấn phải xuất hiện theo thứ tự.
 * Điểm cao hơn khi khớp liền nhau, khớp ở đầu từ, và khớp gần đầu chuỗi.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return { score: 0, indices: [] }
  const t = text.toLowerCase()
  const indices: number[] = []
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    let bonus = 1
    if (found === prev + 1) bonus += 4
    if (found === 0 || /[\s\-_/:.([#]/.test(t[found - 1])) bonus += 3
    score += bonus
    indices.push(found)
    prev = found
    ti = found + 1
  }
  // Ưu tiên chuỗi khớp sớm và chuỗi ngắn
  score -= indices[0] * 0.05 + t.length * 0.01
  // Chứa nguyên cụm thì được cộng thêm
  if (t.includes(query.toLowerCase().trim())) score += 6
  return { score, indices }
}
