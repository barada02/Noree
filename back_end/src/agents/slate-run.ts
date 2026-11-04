import * as Y from 'yjs';
import type { AgentEvent, AiObject, ProviderId, RunRequest, Stroke } from '../shared/protocol.js';
import { docParts, PAGE, type ActorRef, type JobStep, type PageItem } from '../shared/schema.js';
import type { JobContext } from '../jobs/jobs.service.js';
import { runAgent } from './slate/agent.js';
import type { Provider } from './slate/providers/types.js';

export const SLATE_AGENT: ActorRef = { kind: 'agent', id: 'slate-agent', name: 'Slate agent' };
/** Staggers objects so people watch them appear one at a time, as if drawn. */
export const OP_DELAY_MS = 650;

export type SlateRunInput = {
  blockId: string;
  pageId: string;
  /** PNG of the page as a data URL. Only the browser can render the page. */
  snapshot: string;
  instruction?: string;
  provider: ProviderId;
};

function findPage(doc: Y.Doc, blockId: string, pageId: string): Y.Map<unknown> | null {
  const pages = docParts(doc).content.get(blockId)?.get('pages') as Y.Array<Y.Map<unknown>> | undefined;
  return pages?.toArray().find((page) => page.get('id') === pageId) ?? null;
}

/**
 * The agent only works from ink. A pasted item counts as ink through a stroke around its edge, so the
 * agent can point at it and never places anything on top of it. The snapshot shows what it really is.
 */
export function pasteOutline(item: PageItem): Stroke {
  const { x, y, w, h } = item;
  return {
    id: `paste:${item.id}`,
    points: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  };
}

export function readPageRequest(doc: Y.Doc, input: SlateRunInput, runId: string): RunRequest | null {
  const page = findPage(doc, input.blockId, input.pageId);
  if (!page) return null;
  const strokes = (page.get('strokes') as Y.Array<Stroke>).toArray();
  const pastes = (page.get('pastes') as Y.Array<PageItem>).toArray();
  return {
    runId,
    provider: input.provider,
    instruction: input.instruction,
    world: { width: PAGE.width, height: PAGE.height },
    snapshot: input.snapshot,
    strokes: [...strokes, ...pastes.map(pasteOutline)],
    objects: [...(page.get('objects') as Y.Map<AiObject>).values()],
  };
}

function stepFor(event: AgentEvent): JobStep | null {
  switch (event.type) {
    case 'start':
      return { title: 'Reading the page', status: 'info', note: `${event.model}, ${event.clusters.length} group(s) of ink` };
    case 'step':
      return { title: `Model step ${event.step}`, status: 'info', note: `${(event.ms / 1000).toFixed(1)}s` };
    case 'thought':
      return { title: 'Thinking', status: 'info', note: event.text };
    case 'tool':
      return { title: event.name, status: event.ok ? 'pass' : 'fail', note: event.result };
    case 'fallback':
      return { title: `Switched from ${event.from} to ${event.to}`, status: 'warn', note: event.reason.slice(0, 200) };
    case 'error':
      return { title: 'Error', status: 'fail', note: event.message };
    default:
      return null;
  }
}

/** Turns the agent's events into document writes. The agent itself is unchanged from ink-agent. */
export async function runSlateJob(context: JobContext, input: SlateRunInput, chain: Provider[], opDelayMs = OP_DELAY_MS) {
  const { connection, signal, jobId } = context;
  let request: RunRequest | null = null;
  await connection.transact((doc) => {
    request = readPageRequest(doc, input, jobId);
  });
  if (!request) {
    context.fail('This page no longer exists.');
    return;
  }

  const writeToPage = (change: (objects: Y.Map<AiObject>) => void) =>
    connection.transact((doc) => {
      // The block may have been deleted during the run, by anyone.
      const page = findPage(doc, input.blockId, input.pageId);
      if (page) change(page.get('objects') as Y.Map<AiObject>);
    });

  for await (const event of runAgent(request, chain, signal)) {
    const step = stepFor(event);
    if (step) await context.addStep(step);
    if (event.type === 'op') {
      await new Promise((resolve) => setTimeout(resolve, opDelayMs));
      await writeToPage((objects) => objects.set(event.op.id, event.op));
    } else if (event.type === 'remove') {
      await writeToPage((objects) => objects.delete(event.id));
    } else if (event.type === 'error') {
      context.fail(event.message);
    } else if (event.type === 'done') {
      await context.addStep({ title: 'Done', status: 'pass', note: event.summary });
      context.setResult(event.summary);
      await context.addMessage({ role: 'assistant', author: SLATE_AGENT, text: event.summary, meta: { ok: true } });
    }
  }
}
