import type { Pt, Rect } from '../../shared/protocol'

export function bboxOfPoints(pts: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x: x0, y: y0, w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) }
}

export function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.w))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function contains(outer: Rect, p: { x: number; y: number }): boolean {
  return p.x >= outer.x && p.x <= outer.x + outer.w && p.y >= outer.y && p.y <= outer.y + outer.h
}

export function center(r: Rect) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** Euclidean gap between two rects (0 when they touch or overlap). */
export function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.hypot(dx, dy)
}

/**
 * Smallest ellipse (axis-aligned, same aspect as the box) that encloses the rectangle's corners,
 * plus padding. A rect's corners sit on an ellipse with radii half-size * sqrt(2).
 */
export function enclosingEllipse(r: Rect, pad: number) {
  const c = center(r)
  return { cx: c.x, cy: c.y, rx: (r.w / 2) * Math.SQRT2 + pad, ry: (r.h / 2) * Math.SQRT2 + pad }
}
