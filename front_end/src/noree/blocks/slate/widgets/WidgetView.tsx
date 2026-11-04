import type { AiObject } from '../../../../shared/protocol.js'
import { ArgandWidget } from './ArgandWidget'
import { CardsWidget } from './CardsWidget'
import { GraphWidget } from './GraphWidget'
import { StepsWidget } from './StepsWidget'

type WidgetObj = Extract<AiObject, { kind: 'widget' }>

/** Frame + dispatcher. Pointer events stop here so sliders/drags never start a pen stroke on the board. */
export function WidgetView({ o }: { o: WidgetObj }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const w = o.widget
  return (
    <div className="ai-box widget" onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onPointerCancel={stop}>
      <div className="ai-box-title">
        <span className="ai-badge">AI</span>
        {o.title}
        <span className="wg-kind">{w.type === 'argand' ? 'interactive' : w.type === 'graph' ? 'interactive' : w.type}</span>
      </div>
      {w.type === 'argand' && <ArgandWidget id={o.id} spec={w} />}
      {w.type === 'graph' && <GraphWidget id={o.id} spec={w} />}
      {w.type === 'steps' && <StepsWidget spec={w} />}
      {w.type === 'cards' && <CardsWidget spec={w} />}
    </div>
  )
}
