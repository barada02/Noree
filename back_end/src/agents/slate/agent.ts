import type { AgentEvent, RunRequest } from '../../shared/protocol.js'
import { runToolLoop } from '../engine/loop.js'
import type { Provider } from './providers/types.js'
import { Scene } from './scene.js'
import { TOOLS, executeTool } from './tools.js'

const MAX_STEPS = 10

const SYSTEM = `You are the AI collaborator inside a handwriting whiteboard. The user writes or draws by hand; when asked, you annotate their work directly on the canvas by calling tools, the way a tutor would circle something, draw an arrow, and write a short explanation beside it.

How you work:
1. Look at the image and read what the user wrote or drew. Handwriting can be messy: transcribe it, and gently note a likely typo in the explanation rather than ignoring it (for example "z = ax + ib" is most likely the complex number z = a + ib).
2. The user's ink has been grouped into clusters (g1, g2, ...) listed in the message. You NEVER output pixel coordinates. You point at things only by id; the tools compute exact geometry.
3. If your explanation states a number or identity, verify it first with calculate.
4. Draw: draw_outline around the cluster, draw_arrow from the outline to free space (direction "auto"; set room_for to what you will attach), then attach ONE of these at the arrow tip, then call finish:
   - add_text_box: a short explanation (default).
   - add_argand_plane: the user wrote a complex number (z = a + ib). Interactive point with sliders. The default choice for a complex number when the user gave no instruction.
   - add_graph: the user wrote a function or line in x (y = ax + b, x^2, sin x ...). Slider parameters for the letters that act like constants.
   - add_steps: the user wrote a problem to solve; reveal the solution step by step.
   - add_flashcards: the user wants to study or remember what is on the board.
   You may add a second attachment (e.g. a text box next to a widget) with a second draw_arrow from the same outline, but only when it adds something the first one does not.
5. Text rules (box and widgets): titles <= 30 chars. Plain language for a learner, short (about 40-70 words in a text box). Use LaTeX in $...$ for math. Use **bold** for key terms. Respect the size the arrow tool reports; if a tool says it is too big, shorten or switch to a text box and retry.
6. Only annotate clusters that are not already outlined, unless the user's instruction says otherwise. If the user gave an instruction, do exactly what it asks and attach only what it needs (no extra widgets). If there is no instruction, explain what they wrote.
   Tools may run in parallel, so create an arrow and attach to it before drawing another arrow from the same outline.
7. Be efficient: do not call a tool you do not need. Do not describe your plan at length; act.`

function describe(scene: Scene, req: RunRequest): string {
  const W = req.world.width
  const H = req.world.height
  const pct = (v: number, total: number) => `${Math.round((v / total) * 100)}%`
  const lines: string[] = []
  lines.push(`The image is the full canvas (${W}x${H} world units, x to the right, y down).`)
  lines.push('Clusters of the user\'s ink:')
  if (!scene.clusters.length) lines.push('  (none: the canvas is empty)')
  for (const c of scene.clusters) {
    const outlined = scene.outlinedBy(c)
    lines.push(
      `  ${c.id}: x ${pct(c.bbox.x, W)}-${pct(c.bbox.x + c.bbox.w, W)}, y ${pct(c.bbox.y, H)}-${pct(c.bbox.y + c.bbox.h, H)} of the image, ${c.strokeIds.length} strokes` +
        (outlined ? ` (already outlined by ${outlined})` : ''),
    )
  }
  const existing = [...scene.objects.values()]
  if (existing.length) {
    lines.push('AI objects already on the canvas from earlier runs: ' + existing.map((o) => o.id).join(', '))
  }
  return lines.join('\n')
}

export async function* runAgent(req: RunRequest, chain: Provider[], signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  if (!chain.length) {
    yield { type: 'error', message: 'No provider is configured. Set BASETEN_API_KEY and/or META_API in the repo .env.' }
    return
  }
  const scene = new Scene(req)
  yield { type: 'start', provider: chain[0].id, model: chain[0].model, clusters: scene.clusters }

  if (!scene.clusters.length) {
    yield { type: 'done', summary: 'The canvas is empty: write something first.', steps: 0, ops: 0 }
    return
  }

  const instruction = req.instruction?.trim() || 'Explain what I wrote.'
  let ops = 0
  let nudged = false
  let summary = ''

  const loop = runToolLoop<AgentEvent>({
    system: SYSTEM,
    messages: [{ role: 'user', text: `${instruction}\n\n${describe(scene, req)}`, image: req.snapshot }],
    tools: TOOLS,
    chain,
    maxSteps: MAX_STEPS,
    signal,
    execute: (call) => {
      const out = executeTool(scene, call.name, call.rawArgs)
      ops += out.ops.length
      if (out.done) {
        try { summary = JSON.parse(call.rawArgs).summary ?? '' } catch { /* ignore */ }
      }
      return { ok: out.ok, result: out.result, done: out.done, events: out.ops.map((op): AgentEvent => ({ type: 'op', op })) }
    },
    nudge: () => {
      if (ops > 0 || nudged) return null
      nudged = true
      return 'You have not drawn anything yet. Use the tools: draw_outline, draw_arrow, add_text_box, then finish.'
    },
  })

  let steps = 0
  let reason = ''
  let reply = ''
  for await (const event of loop) {
    if (event.type === 'stopped') {
      steps = event.steps
      reason = event.reason
      reply = event.text
    } else {
      yield event
    }
  }

  if (reason === 'aborted') return
  if (reason === 'failed') {
    yield { type: 'done', summary: summary || 'Stopped after a model error.', steps, ops }
    return
  }
  if (reason === 'replied') summary = summary || reply

  // Tidy up: an arrow that never got anything attached (e.g. an attach failed and the model retried
  // from a new arrow) would point at nothing. Remove it from the canvas.
  const attached = new Set<string>()
  for (const o of scene.objects.values()) if (o.kind === 'textbox' || o.kind === 'widget') attached.add(o.arrowId)
  const dangling = [...scene.objects.values()].filter((o) => o.kind === 'arrow' && o.runId === req.runId && !attached.has(o.id))
  for (const o of dangling) {
    scene.objects.delete(o.id)
    yield { type: 'remove', id: o.id, reason: 'arrow had nothing attached' }
  }

  yield { type: 'done', summary: summary || 'Done.', steps, ops }
}
