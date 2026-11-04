/** A "nice" grid step (1, 2 or 5 times a power of ten) giving roughly `target` lines across `span`. */
export function niceStep(span: number, target = 6): number {
  const raw = span / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / pow
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow
}

export function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}

/** Short number format for readouts and tick labels. */
export function fmt(n: number, digits = 2): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits
  return (Object.is(r, -0) ? 0 : r).toString()
}
