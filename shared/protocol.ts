// Wire protocol shared by the server and the web client. Types only (erased at runtime).

export type ProviderId = 'baseten' | 'meta'

export type Pt = [number, number]

export interface Stroke {
  id: string
  points: Pt[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface GraphParam {
  name: string
  value: number
  min: number
  max: number
  step: number
}

/** Interactive widgets the AI can place on the canvas. State (slider values etc.) lives in the browser. */
export type WidgetSpec =
  | { type: 'argand'; a: number; b: number; range: number; show: { modulus: boolean; conjugate: boolean; angle: boolean } }
  | { type: 'graph'; expr: string; params: GraphParam[]; xMin: number; xMax: number; yMin: number; yMax: number }
  | { type: 'steps'; steps: { title: string; body: string }[] }
  | { type: 'cards'; cards: { q: string; a: string }[] }

/** Objects the AI adds to the canvas. All coordinates are in world units. */
export type AiObject =
  /** Typeset mirror of a widget's current values, placed under the user's handwritten equation. */
  | { kind: 'livelabel'; id: string; runId: string; widgetId: string; x: number; y: number; w: number; h: number }
  | { kind: 'widget'; id: string; runId: string; arrowId: string; x: number; y: number; w: number; h: number; title: string; widget: WidgetSpec }
  | { kind: 'ellipse'; id: string; runId: string; cx: number; cy: number; rx: number; ry: number; targetIds: string[] }
  | { kind: 'arrow'; id: string; runId: string; from: { x: number; y: number }; to: { x: number; y: number }; bend: number }
  | { kind: 'textbox'; id: string; runId: string; arrowId: string; x: number; y: number; w: number; h: number; title: string; body: string }

export interface RunRequest {
  runId: string
  provider: ProviderId
  instruction?: string
  world: { width: number; height: number }
  /** PNG data URL of the whole canvas (user ink + earlier AI objects) on white. */
  snapshot: string
  strokes: Stroke[]
  objects: AiObject[]
}

export interface ClusterInfo {
  id: string
  bbox: Rect
  strokeIds: string[]
}

export type AgentEvent =
  | { type: 'start'; provider: ProviderId; model: string; clusters: ClusterInfo[] }
  | { type: 'step'; step: number; provider: ProviderId; model: string; ms: number; inTokens?: number; outTokens?: number }
  | { type: 'thinking'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool'; name: string; args: unknown; ok: boolean; result: string }
  | { type: 'op'; op: AiObject }
  | { type: 'remove'; id: string; reason: string }
  | { type: 'fallback'; from: ProviderId; to: ProviderId; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; summary: string; steps: number; ops: number }

export interface HealthResponse {
  providers: Record<ProviderId, { configured: boolean; model: string; label: string }>
}
