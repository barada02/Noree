import type { AiObject, ClusterInfo, Rect, RunRequest } from '../../shared/protocol.js'
import { clusterStrokes } from './cluster.js'
import { contains, intersects } from './geometry.js'

export const MARGIN = 24

export function objectRect(o: AiObject): Rect {
  switch (o.kind) {
    case 'ellipse':
      return { x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 }
    case 'arrow': {
      const x = Math.min(o.from.x, o.to.x)
      const y = Math.min(o.from.y, o.to.y)
      return { x, y, w: Math.abs(o.from.x - o.to.x) || 2, h: Math.abs(o.from.y - o.to.y) || 2 }
    }
    case 'textbox':
    case 'widget':
    case 'livelabel':
      return { x: o.x, y: o.y, w: o.w, h: o.h }
  }
}

/** Server-side model of the canvas for one agent run. The tools read and mutate it. */
export class Scene {
  readonly runId: string
  readonly world: { width: number; height: number }
  readonly clusters: ClusterInfo[]
  readonly objects = new Map<string, AiObject>()
  /** Arrow id -> direction it points, so the text box can be placed at its tip. */
  readonly arrowDir = new Map<string, Dir>()
  /** Space promised to an arrow's future attachment, so parallel tool calls don't claim the same spot. */
  readonly reserved = new Map<string, Rect>()
  /** Arrow id -> id of the ellipse/cluster it leaves from (used to place the live label under it). */
  readonly arrowSource = new Map<string, string>()
  private counters: Record<AiObject['kind'], number> = { ellipse: 0, arrow: 0, textbox: 0, widget: 0, livelabel: 0 }

  constructor(req: RunRequest) {
    this.runId = req.runId
    this.world = req.world
    this.clusters = clusterStrokes(req.strokes)
    for (const o of req.objects) {
      this.objects.set(o.id, o)
      const n = Number(/_(\d+)$/.exec(o.id)?.[1] ?? 0)
      this.counters[o.kind] = Math.max(this.counters[o.kind], n)
    }
  }

  newId(kind: AiObject['kind']): string {
    this.counters[kind] += 1
    return `${kind}_${this.counters[kind]}`
  }

  add(o: AiObject) {
    this.objects.set(o.id, o)
  }

  /** Rects that new text boxes must not overlap: user ink and every AI object. */
  occupied(except: string[] = []): Rect[] {
    const rects: Rect[] = this.clusters.map((c) => c.bbox)
    for (const o of this.objects.values()) if (!except.includes(o.id)) rects.push(objectRect(o))
    for (const [arrowId, r] of this.reserved) if (!except.includes(arrowId)) rects.push(r)
    return rects
  }

  inWorld(r: Rect): boolean {
    return r.x >= MARGIN && r.y >= MARGIN && r.x + r.w <= this.world.width - MARGIN && r.y + r.h <= this.world.height - MARGIN
  }

  /** Which existing ellipse (if any) already outlines this cluster. */
  outlinedBy(c: ClusterInfo): string | undefined {
    for (const o of this.objects.values()) {
      if (o.kind !== 'ellipse') continue
      const cx = c.bbox.x + c.bbox.w / 2
      const cy = c.bbox.y + c.bbox.h / 2
      const k = ((cx - o.cx) / o.rx) ** 2 + ((cy - o.cy) / o.ry) ** 2
      if (k <= 1) return o.id
    }
    return undefined
  }

  resolveTargets(ids: string[]): { rect: Rect; error?: string } {
    const rects: Rect[] = []
    for (const id of ids) {
      const c = this.clusters.find((x) => x.id === id)
      const o = this.objects.get(id)
      if (c) rects.push(c.bbox)
      else if (o) rects.push(objectRect(o))
      else {
        const valid = [...this.clusters.map((x) => x.id), ...this.objects.keys()].join(', ')
        return { rect: { x: 0, y: 0, w: 0, h: 0 }, error: `Unknown id "${id}". Valid ids: ${valid}` }
      }
    }
    if (!rects.length) return { rect: { x: 0, y: 0, w: 0, h: 0 }, error: 'target_ids is empty' }
    const x0 = Math.min(...rects.map((r) => r.x))
    const y0 = Math.min(...rects.map((r) => r.y))
    const x1 = Math.max(...rects.map((r) => r.x + r.w))
    const y1 = Math.max(...rects.map((r) => r.y + r.h))
    return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  }
}

export type Dir = 'right' | 'left' | 'up' | 'down'

export const TEXTBOX_W = 340
export const WIDGET_W = 360
const PAD = 14
const TITLE_H = 30
const LINE_H = 22
const CHARS_PER_LINE = 40

/** Estimate the rendered height of a text box (the client wraps the same way, roughly). */
export function estimateTextBoxHeight(title: string, body: string): number {
  let lines = 0
  for (const raw of body.split('\n')) {
    const display = /^\s*\$\$.*\$\$\s*$/.test(raw)
    // Inline math renders more compactly than its source, so discount it.
    const visible = raw.replace(/\$[^$]+\$/g, (m) => 'x'.repeat(Math.ceil(m.length * 0.6)))
    lines += display ? 2 : Math.max(1, Math.ceil(visible.length / CHARS_PER_LINE))
  }
  const titleLines = Math.max(1, Math.ceil(title.length / 26))
  return PAD * 2 + TITLE_H * titleLines + 6 + lines * LINE_H
}

/** Where a text box of size w x h sits when it hangs off an arrow tip pointing in `dir`. */
export function boxAtTip(tip: { x: number; y: number }, dir: Dir, w: number, h: number): Rect {
  const gapPx = 10
  switch (dir) {
    case 'right': return { x: tip.x + gapPx, y: tip.y - h / 2, w, h }
    case 'left': return { x: tip.x - gapPx - w, y: tip.y - h / 2, w, h }
    case 'down': return { x: tip.x - w / 2, y: tip.y + gapPx, w, h }
    case 'up': return { x: tip.x - w / 2, y: tip.y - gapPx - h, w, h }
  }
}

/** Nudge a rect back inside the world along the axis perpendicular to the arrow. */
export function clampToWorld(r: Rect, world: { width: number; height: number }): Rect {
  const x = Math.min(Math.max(r.x, MARGIN), Math.max(MARGIN, world.width - MARGIN - r.w))
  const y = Math.min(Math.max(r.y, MARGIN), Math.max(MARGIN, world.height - MARGIN - r.h))
  return { ...r, x, y }
}

export function fits(scene: Scene, r: Rect, except: string[]): boolean {
  if (!scene.inWorld(r)) return false
  return !scene.occupied(except).some((o) => intersects(o, r))
}

export { contains }
