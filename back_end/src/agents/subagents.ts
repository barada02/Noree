import * as Y from 'yjs';
import { z } from 'zod';
import type { JobOutcome, JobsService } from '../jobs/jobs.service.js';
import { docParts, readLayout, type ActorRef } from '../shared/schema.js';
import { defineTool, type AgentTool } from './engine/tools.js';
import { runGenerateJob } from './generate3d.js';
import type { SandboxClient } from './sandbox-client.js';
import { runSlateJob } from './slate-run.js';
import type { Provider } from './slate/providers/types.js';

/**
 * What a subagent needs from whoever starts it. Each subagent runs as its own job on its own block,
 * through the same functions the block's own button uses, so it behaves the same either way.
 */
export type SubagentContext = {
  doc: Y.Doc;
  projectId: string;
  person: ActorRef;
  jobs: JobsService;
  parentJobId: string;
  /** The conversation the main agent is in. */
  threadId: string;
  signal: AbortSignal;
  chainFor: (subagent: 'slate' | 'model3d') => Provider[];
  sandbox: () => SandboxClient;
  readAsset: (url: string) => string | null;
  saveImage: (data: Buffer) => string | null;
  saveCode: (code: string) => string;
};

function blockOfType(doc: Y.Doc, blockId: string, type: 'slate' | 'model3d') {
  const { blocks, content } = docParts(doc);
  const block = blocks.get(blockId);
  if (!block) return { error: `No block has the id ${blockId}. Use read_board to see the ids.` };
  const layout = readLayout(block);
  if (layout.type !== type) return { error: `${layout.title} is a ${layout.type} block, not a ${type} block.` };
  return { layout, content: content.get(blockId)! };
}

function reportOutcome(outcome: JobOutcome, fallback: string) {
  if (outcome.status === 'done') return { ok: true, result: outcome.result ?? fallback };
  if (outcome.status === 'cancelled') return { ok: false, result: 'This was stopped.' };
  return { ok: false, result: outcome.error ?? 'It failed.' };
}

const runSlateAgent = defineTool({
  name: 'run_slate_agent',
  description:
    "Runs the Slate specialist on a Slate block's current page. It reads the handwriting and annotates the page itself with outlines, arrows, explanations and interactive widgets. Use it when someone wants what's written on a Slate explained, solved or visualized. It needs something to already be on the page. Takes up to a minute or so.",
  schema: z.object({
    block_id: z.string().describe('The Slate block.'),
    instruction: z.string().max(2000).optional().describe('What to do. By default it explains what is written.'),
  }),
  run: async (args, context: SubagentContext) => {
    const { doc, projectId, person, jobs, parentJobId, signal } = context;
    const found = blockOfType(doc, args.block_id, 'slate');
    if ('error' in found) return { ok: false, result: found.error as string };

    const pages = (found.content.get('pages') as Y.Array<Y.Map<unknown>>).toArray();
    const page = pages.find((p) => p.get('id') === found.content.get('currentPageId')) ?? pages[0];
    const asset = page.get('snapshotAsset') as string | null;
    const snapshot = asset ? context.readAsset(asset) : null;
    if (!snapshot) return { ok: false, result: `${found.layout.title} has nothing on its current page to work from. Tell the person to write on it first.` };

    const pageId = page.get('id') as string;
    const { finished } = jobs.startTracked(
      { projectId, blockId: args.block_id, kind: 'slate-run', startedBy: person, fields: { pageId, parentJobId }, silent: args.block_id === context.threadId },
      (job) => runSlateJob(job, { blockId: args.block_id, pageId, snapshot, instruction: args.instruction, provider: 'baseten' }, context.chainFor('slate')),
      signal,
    );
    return reportOutcome(await finished, 'The Slate agent finished.');
  },
});

const generate3dModel = defineTool({
  name: 'generate_3d_model',
  description:
    "Runs the 3D specialist on a 3D model block. It builds a model from the block's prompt and whatever is connected to the block, tests it and reviews it. Connect any source blocks first. Takes from under a minute to a few minutes, and only one can run at a time.",
  schema: z.object({
    block_id: z.string().describe('The 3D model block.'),
    prompt: z.string().max(2000).optional().describe('What to build. Replaces the prompt on the block. Optional if connected blocks describe it.'),
  }),
  run: async (args, context: SubagentContext) => {
    const { doc, projectId, person, jobs, parentJobId, signal } = context;
    const found = blockOfType(doc, args.block_id, 'model3d');
    if ('error' in found) return { ok: false, result: found.error as string };
    if (args.prompt !== undefined) found.content.set('prompt', args.prompt);

    const { finished } = jobs.startTracked(
      { projectId, blockId: args.block_id, kind: 'generate-3d', startedBy: person, fields: { parentJobId }, silent: args.block_id === context.threadId },
      (job) =>
        runGenerateJob(
          job,
          { blockId: args.block_id, person, readAsset: context.readAsset, saveImage: context.saveImage, saveCode: context.saveCode },
          context.chainFor('model3d'),
          context.sandbox(),
        ),
      signal,
    );
    return reportOutcome(await finished, 'The 3D model was generated.');
  },
});

/** Adding a specialist means one tool here. The main agent picks it up from this list. */
export const SUBAGENT_TOOLS: AgentTool<SubagentContext>[] = [runSlateAgent, generate3dModel];
