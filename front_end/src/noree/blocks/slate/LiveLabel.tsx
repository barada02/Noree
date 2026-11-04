import type { AiObject, GraphParam } from '../../../shared/protocol.js'
import { fmt } from '../../lib/nice'
import { renderRich } from '../../lib/rich'
import { useWidgetValue } from './widgetState'

type Widget = Extract<AiObject, { kind: 'widget' }>
type Label = Extract<AiObject, { kind: 'livelabel' }>

/** expr text -> LaTeX with the current slider values substituted for the parameter letters. */
function graphTex(expr: string, params: GraphParam[], vals: Record<string, number>): string {
  let s = expr
  for (const p of params) {
    const v = vals[p.name] ?? p.value
    const lit = v < 0 ? `(${fmt(v)})` : fmt(v)
    s = s.replace(new RegExp(`\\b${p.name}\\b`, 'g'), lit)
  }
  return s
    .replace(/\b(sin|cos|tan|ln|log|exp|arcsin|arccos|arctan)\b/g, '\\$1')
    .replace(/\bpi\b/g, '\\pi')
    .replace(/(^|[^\d.])1\s*\*\s*/g, '$1') // "1*x" -> "x"
    .replace(/\+\s*\(-([\d.]+)\)/g, '- $1') // "+ (-2)" -> "- 2"
    .replace(/\s*[+-]\s*0(?![\d.])/g, '') // "+ 0" -> ""
    .replace(/\*/g, '\\cdot ')
}

function ArgandText({ w, id }: { w: Extract<Widget['widget'], { type: 'argand' }>; id: string }) {
  const [pt] = useWidgetValue(id, { a: w.a, b: w.b })
  return <span dangerouslySetInnerHTML={{ __html: renderRich(`$z = ${fmt(pt.a)} ${pt.b < 0 ? '-' : '+'} ${fmt(Math.abs(pt.b))}i$`) }} />
}

function GraphText({ w, id }: { w: Extract<Widget['widget'], { type: 'graph' }>; id: string }) {
  const [vals] = useWidgetValue<Record<string, number>>(id, Object.fromEntries(w.params.map((p) => [p.name, p.value])))
  return <span dangerouslySetInnerHTML={{ __html: renderRich(`$y = ${graphTex(w.expr, w.params, vals)}$`) }} />
}

/** Typeset mirror of the widget's current values, sitting under the user's handwritten equation. */
export function LiveLabel({ o, widget }: { o: Label; widget: Widget }) {
  const w = widget.widget
  return (
    <foreignObject x={o.x} y={o.y} width={o.w} height={o.h} className="ai-box-wrap">
      <div className="live-label" title={`Live: mirrors ${widget.title}`}>
        <span className="live-chip">live</span>
        {w.type === 'argand' && <ArgandText w={w} id={widget.id} />}
        {w.type === 'graph' && <GraphText w={w} id={widget.id} />}
      </div>
    </foreignObject>
  )
}
