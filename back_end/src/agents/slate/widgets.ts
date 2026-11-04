import type { GraphParam, WidgetSpec } from '../../shared/protocol.js'
import { compileExpr } from '../../shared/expr.js'

export interface Built {
  spec?: WidgetSpec
  h: number
  error?: string
}

/** Heights (px) the widgets need; draw_arrow uses these to find a side with enough free space. */
export const WIDGET_NEED = { argand: 400, graph: 330, steps: 280, cards: 240 } as const
export type RoomFor = 'text' | keyof typeof WIDGET_NEED

const fail = (error: string): Built => ({ h: 0, error })
const num = (v: unknown, fallback?: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function niceCeil(v: number): number {
  const steps = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100]
  return steps.find((s) => s >= v) ?? Math.ceil(v / 10) * 10
}

export function buildArgand(args: any): Built {
  const a = num(args?.a)
  const b = num(args?.b)
  if (a === undefined || b === undefined) return fail('a and b must be numbers (starting values for the real and imaginary parts).')
  if (Math.abs(a) > 1e4 || Math.abs(b) > 1e4) return fail('a and b must be within +/-10000.')
  const asked = num(args?.range)
  const range = asked && asked > 0 ? niceCeil(asked) : niceCeil(Math.max(Math.abs(a), Math.abs(b), 1) * 1.6)
  const show = new Set<string>(Array.isArray(args?.show) ? args.show.map(String) : ['modulus', 'angle'])
  return {
    h: WIDGET_NEED.argand,
    spec: { type: 'argand', a, b, range, show: { modulus: show.has('modulus'), conjugate: show.has('conjugate'), angle: show.has('angle') } },
  }
}

export function buildGraph(args: any): Built {
  const expr = String(args?.expression ?? '').trim()
  const rawParams: any[] = Array.isArray(args?.params) ? args.params : []
  if (rawParams.length > 3) return fail('At most 3 slider parameters.')
  const params: GraphParam[] = []
  for (const p of rawParams) {
    const name = String(p?.name ?? '')
    if (!/^[A-Za-z]$/.test(name)) return fail(`Parameter name "${name}" must be a single letter.`)
    if (name === 'x') return fail('Parameter name "x" is reserved for the horizontal axis.')
    if (name.toLowerCase() === 'e') return fail('Parameter name "e" is reserved (Euler\'s number). Pick another letter.')
    if (params.some((q) => q.name === name)) return fail(`Duplicate parameter "${name}".`)
    const min = num(p.min, -5)!
    const max = num(p.max, 5)!
    if (!(max > min)) return fail(`Parameter ${name}: max must be greater than min.`)
    const value = Math.min(Math.max(num(p.value, (min + max) / 2)!, min), max)
    params.push({ name, value, min, max, step: num(p.step) && num(p.step)! > 0 ? num(p.step)! : Math.max((max - min) / 100, 0.01) })
  }
  const compiled = compileExpr(expr, ['x', ...params.map((p) => p.name)])
  if (!compiled.ok) {
    return fail(`Bad expression "${expr}": ${compiled.error}. Use x and your parameter names, operators + - * / ^, and sin cos tan exp ln log sqrt abs pi e.`)
  }
  const xMin = num(args?.x_min, -10)!
  const xMax = num(args?.x_max, 10)!
  if (!(xMax > xMin)) return fail('x_max must be greater than x_min.')

  // Auto y-range from the starting slider values (fixed afterwards, so moving a slider visibly moves the curve).
  const combos: Record<string, number>[] = [Object.fromEntries(params.map((p) => [p.name, p.value]))]
  let lo = Infinity
  let hi = -Infinity
  let finite = 0
  for (const c of combos) {
    for (let i = 0; i <= 80; i++) {
      const y = compiled.fn({ ...c, x: xMin + ((xMax - xMin) * i) / 80 })
      if (Number.isFinite(y) && Math.abs(y) < 1e4) {
        lo = Math.min(lo, y)
        hi = Math.max(hi, y)
        finite++
      }
    }
  }
  if (finite < 10) return fail(`"${expr}" has no finite values on [${xMin}, ${xMax}]. Check the expression or x range.`)
  let yMin = num(args?.y_min)
  let yMax = num(args?.y_max)
  if (yMin === undefined || yMax === undefined) {
    // Pad generously and keep a minimum span so a flat start (e.g. slope 0) still leaves room to move.
    const mid = (lo + hi) / 2
    const half = Math.max((hi - lo) / 2 * 1.4, 5)
    yMin = mid - half
    yMax = mid + half
  }
  if (!(yMax > yMin)) return fail('y_max must be greater than y_min.')
  return { h: 290 + 34 * params.length, spec: { type: 'graph', expr, params, xMin, xMax, yMin, yMax } }
}

export function buildSteps(args: any): Built {
  const raw: any[] = Array.isArray(args?.steps) ? args.steps : []
  if (raw.length < 2 || raw.length > 8) return fail('steps needs 2 to 8 items.')
  const steps = raw.map((s) => ({ title: String(s?.title ?? '').trim().slice(0, 60), body: String(s?.body ?? '').trim().slice(0, 300) }))
  if (steps.some((s) => !s.title || !s.body)) return fail('Every step needs a title and a body.')
  return { h: WIDGET_NEED.steps, spec: { type: 'steps', steps } }
}

export function buildCards(args: any): Built {
  const raw: any[] = Array.isArray(args?.cards) ? args.cards : []
  if (raw.length < 2 || raw.length > 6) return fail('cards needs 2 to 6 items.')
  const cards = raw.map((c) => ({ q: String(c?.q ?? '').trim().slice(0, 160), a: String(c?.a ?? '').trim().slice(0, 240) }))
  if (cards.some((c) => !c.q || !c.a)) return fail('Every card needs q (front) and a (back).')
  return { h: WIDGET_NEED.cards, spec: { type: 'cards', cards } }
}
