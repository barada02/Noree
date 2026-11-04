import { create, all } from 'mathjs'
import type { AiObject, Rect } from '../../shared/protocol.js'
import { enclosingEllipse, inflate, intersects } from './geometry.js'
import {
  TEXTBOX_W, WIDGET_W, Scene, boxAtTip, clampToWorld, estimateTextBoxHeight, fits, type Dir,
} from './scene.js'
import type { ToolSpec } from './providers/types.js'
import { WIDGET_NEED, buildArgand, buildCards, buildGraph, buildSteps, type Built, type RoomFor } from './widgets.js'

export interface ToolOutcome {
  ok: boolean
  result: string
  ops: AiObject[]
  done?: boolean
}

const ATTACH_NOTE = 'One text box or widget per arrow; for a second one, draw another arrow. Keep within the room the arrow reported.'

export const TOOLS: ToolSpec[] = [
  {
    name: 'calculate',
    description:
      'Numerically evaluate a math expression (mathjs syntax; complex numbers like 3+4i; abs, conj, re, im, arg, sqrt, pow, sin, ...; unit conversion like "5 inch to cm"). NUMERIC ONLY: substitute concrete numbers via scope to spot-check an identity; there is no symbolic simplify. Use it to verify any number you intend to state.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'e.g. "abs(3+4i)", "conj(a + b*i)", "(a+b*i)^2" with scope {"a":2,"b":3}, or "60 miles/hour to km/hour"' },
        scope: { type: 'object', description: 'Optional numeric variable values, e.g. {"a": 3, "b": 4}', additionalProperties: { type: 'number' } },
      },
      required: ['expression'],
    },
  },
  {
    name: 'draw_outline',
    description:
      'Draw a perfect ellipse around one or more clusters of the user\'s ink (or existing AI objects). The geometry is computed for you from the stroke bounding boxes. Returns the new object id.',
    parameters: {
      type: 'object',
      properties: {
        target_ids: { type: 'array', items: { type: 'string' }, description: 'Cluster ids such as "g1", or object ids.' },
      },
      required: ['target_ids'],
    },
  },
  {
    name: 'draw_arrow',
    description:
      'Draw an arrow leaving an outline (or cluster) towards free canvas space, where a text box or widget can then be attached. The server finds free space. Set room_for to what you plan to attach so it picks a side with enough room. Returns the arrow id.',
    parameters: {
      type: 'object',
      properties: {
        from_id: { type: 'string', description: 'Id of an ellipse you drew, or a cluster id.' },
        direction: { type: 'string', enum: ['auto', 'right', 'down', 'left', 'up'], description: 'Prefer "auto": the server picks the side with free space.' },
        length: { type: 'string', enum: ['short', 'medium', 'long'] },
        room_for: { type: 'string', enum: ['text', 'argand', 'graph', 'steps', 'cards'], description: 'What you will attach (default text). Widgets need much more room than text.' },
      },
      required: ['from_id'],
    },
  },
  {
    name: 'add_text_box',
    description:
      `Attach an explanation text box to the tip of an arrow. body supports **bold**, newlines, bullets with "- ", inline math in $...$ and display math in $$...$$ (LaTeX). ${ATTACH_NOTE} If it does not fit you get an error with the maximum size; shorten and retry.`,
    parameters: {
      type: 'object',
      properties: {
        arrow_id: { type: 'string' },
        title: { type: 'string', description: 'Short heading, <= 30 chars.' },
        body: { type: 'string', description: 'The explanation. Concise, plain language, LaTeX for math.' },
      },
      required: ['arrow_id', 'title', 'body'],
    },
  },
  {
    name: 'add_argand_plane',
    description:
      `Attach an INTERACTIVE Argand (complex) plane to an arrow tip: a draggable point z = a + bi with sliders for a and b, live modulus, angle and conjugate. Use it whenever the user wrote a complex number. a and b are the starting values (use the user's numbers if given, else pick a clear example like 3 and 4). Call draw_arrow with room_for "argand" first. ${ATTACH_NOTE}`,
    parameters: {
      type: 'object',
      properties: {
        arrow_id: { type: 'string' },
        title: { type: 'string', description: 'e.g. "z = a + ib on the plane"' },
        a: { type: 'number', description: 'Starting real part' },
        b: { type: 'number', description: 'Starting imaginary part' },
        range: { type: 'number', description: 'Optional plane half-width (slider range is +/- this)' },
        show: { type: 'array', items: { type: 'string', enum: ['modulus', 'angle', 'conjugate'] }, description: 'Overlays to draw (default modulus, angle)' },
      },
      required: ['arrow_id', 'title', 'a', 'b'],
    },
  },
  {
    name: 'add_graph',
    description:
      `Attach an INTERACTIVE function graph y = f(x) with slider parameters. expression uses x and your parameter letters: operators + - * / ^, functions sin cos tan exp ln log sqrt abs, constants pi e (write multiplication explicitly, e.g. "a*x + b"). Use it when the user wrote a function, line, parabola or other equation in x. Call draw_arrow with room_for "graph" first. ${ATTACH_NOTE}`,
    parameters: {
      type: 'object',
      properties: {
        arrow_id: { type: 'string' },
        title: { type: 'string', description: 'e.g. "y = ax + b"' },
        expression: { type: 'string', description: 'f(x), e.g. "a*x + b" or "a*x^2 + b*x"' },
        params: {
          type: 'array',
          description: 'Up to 3 slider parameters (single letters, not x or e).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
            },
            required: ['name', 'value', 'min', 'max'],
          },
        },
        x_min: { type: 'number' },
        x_max: { type: 'number' },
      },
      required: ['arrow_id', 'title', 'expression'],
    },
  },
  {
    name: 'add_steps',
    description:
      `Attach a step-by-step solution the user can reveal one step at a time (2 to 8 steps). Use it when the user wrote a problem to solve or a derivation. Verify numbers with calculate first. Call draw_arrow with room_for "steps" first. ${ATTACH_NOTE}`,
    parameters: {
      type: 'object',
      properties: {
        arrow_id: { type: 'string' },
        title: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string', description: '<= 40 chars' }, body: { type: 'string', description: '1-2 sentences; LaTeX in $...$' } },
            required: ['title', 'body'],
          },
        },
      },
      required: ['arrow_id', 'title', 'steps'],
    },
  },
  {
    name: 'add_flashcards',
    description:
      `Attach flip-through flashcards (2 to 6) that quiz the user on what is on the board. Use it when asked to help them study or remember. Call draw_arrow with room_for "cards" first. ${ATTACH_NOTE}`,
    parameters: {
      type: 'object',
      properties: {
        arrow_id: { type: 'string' },
        title: { type: 'string' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: { q: { type: 'string', description: 'front, a question; LaTeX in $...$' }, a: { type: 'string', description: 'back, the answer' } },
            required: ['q', 'a'],
          },
        },
      },
      required: ['arrow_id', 'title', 'cards'],
    },
  },
  {
    name: 'finish',
    description: 'Call when the annotation is complete. Give a one-sentence summary of what you drew and why.',
    parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
  },
]

/* ---------- calculate: hardened mathjs ---------- */
const math = create(all)
const evaluate = math.evaluate.bind(math)
const format = math.format.bind(math)
math.import(
  {
    import: () => { throw new Error('disabled') },
    createUnit: () => { throw new Error('disabled') },
    reviver: () => { throw new Error('disabled') },
    evaluate: () => { throw new Error('disabled') },
    parse: () => { throw new Error('disabled') },
    derivative: () => { throw new Error('disabled') },
  },
  { override: true },
)

function calculate(args: any): ToolOutcome {
  const expr = String(args?.expression ?? '')
  if (!expr || expr.length > 300) return { ok: false, result: 'expression missing or longer than 300 chars', ops: [] }
  const scope: Record<string, number> = {}
  for (const [k, v] of Object.entries((args?.scope ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'number' && /^[A-Za-z_]\w*$/.test(k)) scope[k] = v
  }
  try {
    const out = evaluate(expr, scope)
    return { ok: true, result: String(format(out, { precision: 8 })), ops: [] }
  } catch (e) {
    return { ok: false, result: `could not evaluate: ${(e as Error).message}`, ops: [] }
  }
}

/* ---------- drawing tools ---------- */
const ARROW_LEN = { short: 70, medium: 115, long: 165 } as const
const DIRS: Dir[] = ['right', 'down', 'left', 'up']
const VEC: Record<Dir, { x: number; y: number }> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } }

/** Largest box height (px) of the given width that fits in free space at the tip, or 0. */
function budget(scene: Scene, tip: { x: number; y: number }, dir: Dir, except: string[], w = TEXTBOX_W): number {
  for (let h = 420; h >= 90; h -= 20) {
    const box = clampToWorld(boxAtTip(tip, dir, w, h), scene.world)
    if (fits(scene, box, except)) return h
  }
  return 0
}

function budgetText(h: number, widgetKind: RoomFor): string {
  if (widgetKind !== 'text') return `Room for the ${widgetKind} widget: ${WIDGET_W}px wide, ${h}px tall available (needs ${WIDGET_NEED[widgetKind]}).`
  const lines = Math.max(1, Math.floor((h - 14 * 2 - 30 - 6) / 22))
  return `Text box budget: ${TEXTBOX_W}px wide, up to ~${lines} body lines (~${lines * 40} characters, inline math counts ~60%). A widget needs more room: pass room_for.`
}

function drawOutline(scene: Scene, args: any): ToolOutcome {
  const ids = Array.isArray(args?.target_ids) ? args.target_ids.map(String) : []
  const { rect, error } = scene.resolveTargets(ids)
  if (error) return { ok: false, result: error, ops: [] }
  const e = enclosingEllipse(rect, 18)
  const op: AiObject = { kind: 'ellipse', id: scene.newId('ellipse'), runId: scene.runId, ...e, targetIds: ids }
  scene.add(op)
  return { ok: true, result: `Created ${op.id} around ${ids.join(', ')}.`, ops: [op] }
}

function drawArrow(scene: Scene, args: any): ToolOutcome {
  const fromId = String(args?.from_id ?? '')
  const src = scene.objects.get(fromId)
  const cluster = scene.clusters.find((c) => c.id === fromId)
  if (!src && !cluster) {
    return { ok: false, result: `Unknown from_id "${fromId}". Draw an outline first, then pass its id (e.g. ellipse_1).`, ops: [] }
  }
  if (src && src.kind !== 'ellipse') return { ok: false, result: 'Arrows can only start from an ellipse or an ink cluster.', ops: [] }

  const roomFor: RoomFor = args?.room_for in WIDGET_NEED ? (args.room_for as RoomFor) : 'text'
  const need = roomFor === 'text' ? 110 : WIDGET_NEED[roomFor]
  const boxW = roomFor === 'text' ? TEXTBOX_W : WIDGET_W
  const length = ARROW_LEN[(args?.length as keyof typeof ARROW_LEN) ?? 'medium'] ?? ARROW_LEN.medium
  const requested = String(args?.direction ?? 'auto')
  const edge = (dir: Dir) => {
    const v = VEC[dir]
    if (src?.kind === 'ellipse') return { x: src.cx + v.x * src.rx, y: src.cy + v.y * src.ry }
    const r = cluster!.bbox
    return { x: r.x + r.w / 2 + v.x * (r.w / 2 + 6), y: r.y + r.h / 2 + v.y * (r.h / 2 + 6) }
  }
  const except = src ? [src.id] : []
  const plan = (dir: Dir) => {
    const from = edge(dir)
    const to = { x: from.x + VEC[dir].x * length, y: from.y + VEC[dir].y * length }
    // The arrow shaft itself must not cross other content (e.g. a live label under the outline).
    const shaft = inflate({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }, 4)
    const blocked = scene.occupied(except).some((r) => intersects(r, shaft))
    return { dir, from, to, h: blocked ? 0 : budget(scene, to, dir, except, boxW) }
  }

  const noRoom = (extra: string) =>
    roomFor === 'text'
      ? extra
      : `${extra} A ${roomFor} widget needs ~${need}px of free height. Free some canvas (the user can erase or undo), or use a text box instead.`

  let chosen: ReturnType<typeof plan> | undefined
  if (requested !== 'auto' && DIRS.includes(requested as Dir)) {
    chosen = plan(requested as Dir)
    if (chosen.h < need) {
      const alt = DIRS.map(plan).sort((a, b) => b.h - a.h)[0]
      return { ok: false, result: noRoom(`Not enough room to the ${requested}. Try direction "auto"${alt.h >= need ? ` (best free side: ${alt.dir})` : ''}.`), ops: [] }
    }
  } else {
    const plans = DIRS.map(plan)
    chosen = plans.find((p) => p.h >= Math.max(180, need)) ?? [...plans].sort((a, b) => b.h - a.h)[0]
    if (!chosen || chosen.h < need) return { ok: false, result: noRoom('The canvas has no free space near this object.'), ops: [] }
  }

  const bend = (chosen.dir === 'right' || chosen.dir === 'left' ? -1 : 1) * length * 0.12
  const op: AiObject = { kind: 'arrow', id: scene.newId('arrow'), runId: scene.runId, from: chosen.from, to: chosen.to, bend }
  scene.add(op)
  scene.arrowDir.set(op.id, chosen.dir)
  scene.arrowSource.set(op.id, fromId)
  scene.reserved.set(op.id, clampToWorld(boxAtTip(chosen.to, chosen.dir, boxW, Math.min(chosen.h, roomFor === 'text' ? 200 : need)), scene.world))
  return { ok: true, result: `Created ${op.id} pointing ${chosen.dir} into free space. ${budgetText(chosen.h, roomFor)}`, ops: [op] }
}

/** Validate the arrow and compute where a w x h box hangs off its tip. */
function placeOnArrow(scene: Scene, args: any, w: number, h: number): { arrowId: string; box: Rect } | ToolOutcome {
  const arrowId = String(args?.arrow_id ?? '')
  const arrow = scene.objects.get(arrowId)
  const dir = scene.arrowDir.get(arrowId)
  if (!arrow || arrow.kind !== 'arrow' || !dir) return { ok: false, result: `"${arrowId}" is not an arrow created in this run. Call draw_arrow first.`, ops: [] }
  const used = [...scene.objects.values()].some((o) => (o.kind === 'textbox' || o.kind === 'widget') && o.arrowId === arrowId)
  if (used) return { ok: false, result: `${arrowId} already has something attached. Draw another arrow.`, ops: [] }

  const box = clampToWorld(boxAtTip(arrow.to, dir, w, h), scene.world)
  if (!fits(scene, box, [arrow.id])) {
    const room = budget(scene, arrow.to, dir, [arrow.id], w)
    return {
      ok: false,
      result: room
        ? `Too big: needs ~${h}px height but only ~${room}px is free at this arrow. ${w === TEXTBOX_W ? 'Shorten the text and retry.' : 'Use a text box instead, or draw a new arrow with room_for set correctly.'}`
        : 'No free space at this arrow tip any more. Draw a new arrow with direction "auto".',
      ops: [],
    }
  }
  scene.reserved.delete(arrowId) // the real object takes over the reserved space
  return { arrowId, box }
}

function addTextBox(scene: Scene, args: any): ToolOutcome {
  const title = String(args?.title ?? '').trim().slice(0, 60)
  const body = String(args?.body ?? '').trim()
  if (!title || !body) return { ok: false, result: 'title and body are required.', ops: [] }
  if (body.length > 700) return { ok: false, result: `body is ${body.length} chars; keep it under ~500.`, ops: [] }
  const placed = placeOnArrow(scene, args, TEXTBOX_W, estimateTextBoxHeight(title, body))
  if ('ok' in placed) return placed
  const op: AiObject = { kind: 'textbox', id: scene.newId('textbox'), runId: scene.runId, arrowId: placed.arrowId, ...placed.box, title, body }
  scene.add(op)
  return { ok: true, result: `Created ${op.id} attached to ${placed.arrowId}.`, ops: [op] }
}

function addWidget(scene: Scene, args: any, built: Built): ToolOutcome {
  if (built.error || !built.spec) return { ok: false, result: built.error ?? 'invalid widget', ops: [] }
  const title = String(args?.title ?? '').trim().slice(0, 60)
  if (!title) return { ok: false, result: 'title is required.', ops: [] }
  const placed = placeOnArrow(scene, args, WIDGET_W, built.h)
  if ('ok' in placed) return placed
  const op: AiObject = { kind: 'widget', id: scene.newId('widget'), runId: scene.runId, arrowId: placed.arrowId, ...placed.box, title, widget: built.spec }
  scene.add(op)
  const ops: AiObject[] = [op]
  let note = ''

  // Write back to the canvas: a typeset label under the user's equation that mirrors the widget's live values.
  if (built.spec.type === 'argand' || built.spec.type === 'graph') {
    const label = liveLabelFor(scene, placed.arrowId, op.id)
    if (label) {
      scene.add(label)
      ops.push(label)
      note = ` A live label (${label.id}) under the equation mirrors the widget's values as the user drags; do not add another one.`
    }
  }
  return { ok: true, result: `Created interactive ${built.spec.type} widget ${op.id} attached to ${placed.arrowId}. It is live in the browser; the user can play with it.${note}`, ops }
}

/** Place a live label centred under the arrow's source (outline or ink), if there is free space. */
function liveLabelFor(scene: Scene, arrowId: string, widgetId: string): AiObject | undefined {
  const sourceId = scene.arrowSource.get(arrowId)
  if (!sourceId) return undefined
  const { rect, error } = scene.resolveTargets([sourceId])
  if (error) return undefined
  const w = Math.min(Math.max(rect.w * 0.6, 240), 380)
  const h = 48
  const box = { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h + 8, w, h }
  if (!fits(scene, box, [arrowId])) return undefined
  return { kind: 'livelabel', id: scene.newId('livelabel'), runId: scene.runId, widgetId, ...box }
}

export function executeTool(scene: Scene, name: string, rawArgs: string): ToolOutcome {
  let args: any
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    return { ok: false, result: 'Arguments were not valid JSON. Retry with a valid JSON object.', ops: [] }
  }
  switch (name) {
    case 'calculate': return calculate(args)
    case 'draw_outline': return drawOutline(scene, args)
    case 'draw_arrow': return drawArrow(scene, args)
    case 'add_text_box': return addTextBox(scene, args)
    case 'add_argand_plane': return addWidget(scene, args, buildArgand(args))
    case 'add_graph': return addWidget(scene, args, buildGraph(args))
    case 'add_steps': return addWidget(scene, args, buildSteps(args))
    case 'add_flashcards': return addWidget(scene, args, buildCards(args))
    case 'finish': return { ok: true, result: 'Done.', ops: [], done: true }
    default: return { ok: false, result: `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(', ')}`, ops: [] }
  }
}
