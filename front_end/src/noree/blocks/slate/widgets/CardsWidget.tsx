import { useState } from 'react'
import type { WidgetSpec } from '../../../../shared/protocol.js'
import { renderRich } from '../../../lib/rich'

type Spec = Extract<WidgetSpec, { type: 'cards' }>

/** Flip-through flashcards: click the card to flip. */
export function CardsWidget({ spec }: { spec: Spec }) {
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const n = spec.cards.length
  const card = spec.cards[i]
  const go = (d: number) => { setI((v) => (v + d + n) % n); setFlipped(false) }
  return (
    <div className="wg wg-cards">
      <button className={`wg-card ${flipped ? 'back' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label="Flip card">
        <span className="wg-cardlabel">{flipped ? 'Answer' : 'Question'} · click to flip</span>
        <span className="wg-cardtext" dangerouslySetInnerHTML={{ __html: renderRich(flipped ? card.a : card.q) }} />
      </button>
      <div className="wg-actions">
        <button onClick={() => go(-1)} aria-label="Previous card">◂</button>
        <span className="wg-count">{i + 1} / {n}</span>
        <button onClick={() => go(1)} aria-label="Next card">▸</button>
      </div>
    </div>
  )
}
