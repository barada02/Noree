import { useState } from 'react'
import type { WidgetSpec } from '../../../../shared/protocol.js'
import { renderRich } from '../../../lib/rich'

type Spec = Extract<WidgetSpec, { type: 'steps' }>

/** Worked solution revealed one step at a time. */
export function StepsWidget({ spec }: { spec: Spec }) {
  const [shown, setShown] = useState(1)
  const n = spec.steps.length
  return (
    <div className="wg wg-steps">
      <div className="wg-steplist">
        {spec.steps.slice(0, shown).map((s, i) => (
          <div key={i} className={`wg-step ${i === shown - 1 ? 'latest' : ''}`}>
            <span className="wg-stepnum">{i + 1}</span>
            <div>
              <div className="wg-steptitle">{s.title}</div>
              <div dangerouslySetInnerHTML={{ __html: renderRich(s.body) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="wg-actions">
        <span className="wg-count">{shown} / {n}</span>
        <button onClick={() => setShown((v) => Math.min(n, v + 1))} disabled={shown >= n}>Next step ▸</button>
        <button onClick={() => setShown(n)} disabled={shown >= n}>Show all</button>
        <button onClick={() => setShown(1)} disabled={shown === 1}>Reset</button>
      </div>
    </div>
  )
}
