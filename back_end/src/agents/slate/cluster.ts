import type { ClusterInfo, Stroke } from '../../shared/protocol'
import { bboxOfPoints, gap, union } from './geometry'

/**
 * Group strokes that are close together (letters of one expression, parts of one drawing) into
 * clusters. The model refers to clusters by id; it never has to produce pixel coordinates.
 */
export function clusterStrokes(strokes: Stroke[]): ClusterInfo[] {
  const boxes = strokes.map((s) => bboxOfPoints(s.points))
  // Adapt the join distance to the handwriting size: big writing leaves bigger gaps between letters.
  const sizes = boxes.map((b) => Math.max(b.w, b.h)).sort((a, b) => a - b)
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0
  const nearGap = Math.min(Math.max(median * 0.9, 44), 110)
  // Strokes sharing a text line may be spaced further apart (word gaps) and still belong together.
  const sameLineGap = Math.min(Math.max(median * 1.8, 64), 200)
  const parent = strokes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      const sameLine = overlapY > 0.4 * Math.min(a.h, b.h)
      if (gap(a, b) <= (sameLine ? sameLineGap : nearGap)) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, number[]>()
  strokes.forEach((_, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), i])
  })
  const clusters = [...groups.values()].map((idx) => ({
    bbox: union(idx.map((i) => boxes[i])),
    strokeIds: idx.map((i) => strokes[i].id),
  }))
  // Reading order: top to bottom, then left to right.
  clusters.sort((a, b) => (Math.abs(a.bbox.y - b.bbox.y) > 60 ? a.bbox.y - b.bbox.y : a.bbox.x - b.bbox.x))
  return clusters.map((c, i) => ({ id: `g${i + 1}`, ...c }))
}
