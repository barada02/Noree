import { memo } from 'react'
import type { AiObject } from '../../../shared/protocol.js'
import { arrowGeometry, ellipsePath } from '../../lib/path'
import { renderRich } from '../../lib/rich'
import { LiveLabel } from './LiveLabel'
import { WidgetView } from './widgets/WidgetView'

/** Renders the objects the AI added. Each mounts once with a draw-in animation. */
function AiLayerImpl({ objects }: { objects: AiObject[] }) {
  return (
    <g className="ai-layer">
      {objects.map((o) => {
        if (o.kind === 'ellipse') {
          return <path key={o.id} className="ai-stroke ai-draw ai-ellipse" pathLength={1} d={ellipsePath(o.cx, o.cy, o.rx, o.ry)} />
        }
        if (o.kind === 'arrow') {
          const g = arrowGeometry(o.from, o.to, o.bend)
          return (
            <g key={o.id}>
              <path className="ai-stroke ai-draw ai-arrow" pathLength={1} d={g.d} />
              <path className="ai-stroke ai-head" d={g.head} />
            </g>
          )
        }
        if (o.kind === 'livelabel') {
          const widget = objects.find((x): x is Extract<AiObject, { kind: 'widget' }> => x.kind === 'widget' && x.id === o.widgetId)
          return widget ? <LiveLabel key={o.id} o={o} widget={widget} /> : null
        }
        if (o.kind === 'widget') {
          return (
            <foreignObject key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} className="ai-box-wrap">
              <WidgetView o={o} />
            </foreignObject>
          )
        }
        return (
          <foreignObject key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} className="ai-box-wrap">
            <div className="ai-box">
              <div className="ai-box-title">
                <span className="ai-badge">AI</span>
                {o.title}
              </div>
              <div className="ai-box-body" dangerouslySetInnerHTML={{ __html: renderRich(o.body) }} />
            </div>
          </foreignObject>
        )
      })}
    </g>
  )
}

export const AiLayer = memo(AiLayerImpl)
