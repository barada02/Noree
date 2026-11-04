import { useMemo } from 'react'
import { useWidgetValue } from '../widgetState'
import { compileExpr } from '../../../../shared/expr.js'
import type { WidgetSpec } from '../../../../shared/protocol.js'
import { fmt, niceStep, ticks } from '../../../lib/nice'

type Spec = Extract<WidgetSpec, { type: 'graph' }>

const W = 320
const H = 190
const N = 200

/** Function plot with slider parameters. The curve is recomputed live from a safe shared expression parser. */
export function GraphWidget({ id, spec }: { id: string; spec: Spec }) {
  const initial = useMemo(() => Object.fromEntries(spec.params.map((p) => [p.name, p.value])), [spec])
  const [vals, setVals] = useWidgetValue<Record<string, number>>(id, initial)
  const compiled = useMemo(() => compileExpr(spec.expr, ['x', ...spec.params.map((p) => p.name)]), [spec])
  const { xMin, xMax, yMin, yMax } = spec
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * W
  const sy = (y: number) => H - ((y - yMin) / (yMax - yMin)) * H

  const path = useMemo(() => {
    if (!compiled.ok) return ''
    let d = ''
    let pen = false
    for (let i = 0; i <= N; i++) {
      const x = xMin + ((xMax - xMin) * i) / N
      const y = compiled.fn({ ...vals, x })
      const py = sy(y)
      if (!Number.isFinite(y) || py < -H * 2 || py > H * 3) { pen = false; continue }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${py.toFixed(1)} `
      pen = true
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, vals, xMin, xMax, yMin, yMax])

  const xt = ticks(xMin, xMax, niceStep(xMax - xMin, 6))
  const yt = ticks(yMin, yMax, niceStep(yMax - yMin, 5))
  const x0 = xMin < 0 && xMax > 0 ? sx(0) : null
  const y0 = yMin < 0 && yMax > 0 ? sy(0) : null

  return (
    <div className="wg">
      <svg viewBox={`0 0 ${W} ${H}`} className="wg-plot">
        <defs><clipPath id="gclip"><rect width={W} height={H} /></clipPath></defs>
        {xt.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={0} y2={H} className="wg-grid" />)}
        {yt.map((v) => <line key={`gy${v}`} x1={0} x2={W} y1={sy(v)} y2={sy(v)} className="wg-grid" />)}
        {y0 !== null && <line x1={0} x2={W} y1={y0} y2={y0} className="wg-axis" />}
        {x0 !== null && <line x1={x0} x2={x0} y1={0} y2={H} className="wg-axis" />}
        {xt.filter((v) => v !== 0).map((v) => <text key={`tx${v}`} x={sx(v)} y={(y0 ?? H - 4) + (y0 === null ? 0 : 11)} textAnchor="middle" className="wg-tick">{fmt(v)}</text>)}
        {yt.filter((v) => v !== 0).map((v) => <text key={`ty${v}`} x={(x0 ?? 2) + 3} y={sy(v) - 2} className="wg-tick">{fmt(v)}</text>)}
        <path d={path} className="wg-curve" clipPath="url(#gclip)" />
      </svg>

      <div className="wg-expr"><code>y = {spec.expr}</code></div>
      {!compiled.ok && <div className="wg-err">{compiled.error}</div>}

      {spec.params.map((p) => (
        <label key={p.name} className="wg-slider">
          <span className="wg-name">{p.name}</span>
          <input type="range" min={p.min} max={p.max} step={p.step} value={vals[p.name]} onChange={(e) => setVals((v) => ({ ...v, [p.name]: Number(e.target.value) }))} />
          <output>{fmt(vals[p.name], 2)}</output>
        </label>
      ))}
    </div>
  )
}
