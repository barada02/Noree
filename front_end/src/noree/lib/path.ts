import type { Pt } from '../../shared/protocol.js'

/** Smooth polyline through the sampled points (midpoint quadratic curves). */
export function strokePath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]} l0.01 0`
  if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  return d + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`
}

/** Distance from point p to the polyline pts. */
export function distToPolyline(pts: Pt[], p: Pt): number {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1] ?? pts[i]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
  }
  return best
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0`
}

/** Quadratic arrow path plus the arrowhead geometry at its tip. */
export function arrowGeometry(from: { x: number; y: number }, to: { x: number; y: number }, bend: number) {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const c = { x: mx + nx * bend, y: my + ny * bend }
  const tx = to.x - c.x
  const ty = to.y - c.y
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const size = 16
  const spread = 0.45
  const rot = (sx: number, sy: number, a: number) => ({ x: sx * Math.cos(a) - sy * Math.sin(a), y: sx * Math.sin(a) + sy * Math.cos(a) })
  const l = rot(-ux, -uy, spread)
  const r = rot(-ux, -uy, -spread)
  return {
    d: `M${from.x} ${from.y} Q${c.x} ${c.y} ${to.x} ${to.y}`,
    head: `M${to.x + l.x * size} ${to.y + l.y * size} L${to.x} ${to.y} L${to.x + r.x * size} ${to.y + r.y * size}`,
  }
}
