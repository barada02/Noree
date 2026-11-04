import { useRef } from 'react'
import type { WidgetSpec } from '../../../../shared/protocol.js'
import { fmt, niceStep, ticks } from '../../../lib/nice'
import { renderRich } from '../../../lib/rich'
import { useWidgetValue } from '../widgetState'

type Spec = Extract<WidgetSpec, { type: 'argand' }>

const W = 320
const H = 220
const CX = W / 2
const CY = H / 2

/** Interactive complex plane: drag the point or use the sliders; modulus, angle and conjugate update live. */
export function ArgandWidget({ id, spec }: { id: string; spec: Spec }) {
  const R = spec.range
  // Shared store (not local state) so the live label under the user's equation mirrors it.
  const [pt, setPt] = useWidgetValue(id, { a: spec.a, b: spec.b })
  const { a, b } = pt
  const setA = (v: number) => setPt((p) => ({ ...p, a: v }))
  const setB = (v: number) => setPt((p) => ({ ...p, b: v }))
  const dragging = useRef(false)
  const u = (H / 2 - 14) / R // pixels per unit
  const px = CX + a * u
  const py = CY - b * u
  const mod = Math.hypot(a, b)
  const theta = Math.atan2(b, a)
  const clamp = (v: number) => Math.max(-R, Math.min(R, Math.round(v * 10) / 10))

  const step = niceStep(R * 2, 8)
  const xs = ticks(-CX / u, CX / u, step)
  const ys = ticks(-CY / u, CY / u, step)

  function fromEvent(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    setPt({ a: clamp((x - CX) / u), b: clamp(-(y - CY) / u) })
  }

  // Unit normal to the vector, used to offset the |z| label so it sits beside the line.
  const vlen = Math.hypot(px - CX, py - CY) || 1
  const nx = (py - CY) / vlen
  const ny = -(px - CX) / vlen
  const sign = b < 0 ? '-' : '+'
  const zTex = `z = ${fmt(a)} ${sign} ${fmt(Math.abs(b))}i`
  const arcR = 26
  const arc =
    mod > 0.05 && Math.abs(theta) > 0.03
      ? `M${CX + arcR} ${CY} A${arcR} ${arcR} 0 0 ${theta > 0 ? 0 : 1} ${CX + arcR * Math.cos(theta)} ${CY - arcR * Math.sin(theta)}`
      : ''

  return (
    <div className="wg">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="wg-plot"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e) }}
        onPointerMove={(e) => dragging.current && fromEvent(e)}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        {xs.map((v) => <line key={`gx${v}`} x1={CX + v * u} x2={CX + v * u} y1={0} y2={H} className="wg-grid" />)}
        {ys.map((v) => <line key={`gy${v}`} x1={0} x2={W} y1={CY - v * u} y2={CY - v * u} className="wg-grid" />)}
        <line x1={0} x2={W} y1={CY} y2={CY} className="wg-axis" />
        <line x1={CX} x2={CX} y1={0} y2={H} className="wg-axis" />
        {xs.filter((v) => v !== 0).map((v) => <text key={`tx${v}`} x={CX + v * u} y={CY + 12} textAnchor="middle" className="wg-tick">{fmt(v)}</text>)}
        {ys.filter((v) => v !== 0).map((v) => <text key={`ty${v}`} x={CX + 4} y={CY - v * u + 3} className="wg-tick">{fmt(v)}i</text>)}
        <text x={W - 6} y={CY - 6} textAnchor="end" className="wg-axlabel">Re</text>
        <text x={CX + 6} y={12} className="wg-axlabel">Im</text>

        {spec.show.conjugate && (
          <g>
            <line x1={px} y1={py} x2={px} y2={CY + b * u} className="wg-dash wg-conj" />
            <circle cx={px} cy={CY + b * u} r={5} className="wg-conj-dot" />
            <text x={px + 8} y={CY + b * u + (b >= 0 ? 12 : -6)} className="wg-conj-label">z̄</text>
          </g>
        )}
        <line x1={px} y1={py} x2={px} y2={CY} className="wg-dash" />
        <line x1={px} y1={py} x2={CX} y2={py} className="wg-dash" />
        {spec.show.angle && arc && <path d={arc} className="wg-arc" />}
        <line x1={CX} y1={CY} x2={px} y2={py} className="wg-vec" />
        {spec.show.modulus && mod > 0.4 && (
          <text x={(CX + px) / 2 + nx * 11} y={(CY + py) / 2 + ny * 11 + 4} textAnchor="middle" className="wg-modlabel">|z|</text>
        )}
        <circle cx={px} cy={py} r={9} className="wg-pt-halo" />
        <circle cx={px} cy={py} r={5.5} className="wg-pt" />
      </svg>

      <div className="wg-readout" dangerouslySetInnerHTML={{
        __html:
          `<span>${renderRich(`$${zTex}$`)}</span>` +
          `<span>${renderRich(`$|z| = ${fmt(mod)}$`)}</span>` +
          `<span>${renderRich(`$\\arg z = ${fmt((theta * 180) / Math.PI, 1)}^\\circ$`)}</span>` +
          `<span>${renderRich(`$\\bar z = ${fmt(a)} ${b <= 0 ? '+' : '-'} ${fmt(Math.abs(b))}i$`)}</span>`,
      }} />

      <label className="wg-slider">
        <span className="wg-name">a</span>
        <input type="range" min={-R} max={R} step={0.1} value={a} onChange={(e) => setA(Number(e.target.value))} />
        <output>{fmt(a, 1)}</output>
      </label>
      <label className="wg-slider">
        <span className="wg-name">b</span>
        <input type="range" min={-R} max={R} step={0.1} value={b} onChange={(e) => setB(Number(e.target.value))} />
        <output>{fmt(b, 1)}</output>
      </label>
    </div>
  )
}
