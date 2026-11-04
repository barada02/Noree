// The one way to change board structure, used by people and agents alike. It only touches a Y.Doc,
// so the same code runs in the browser and on the server. Text typing and ink are direct Yjs edits
// on content that is already validated by its type.
import * as Y from 'yjs';
import { z } from 'zod';
import {
  DEFAULT_SIZE,
  BLOCK_LABEL,
  docParts,
  newContent,
  newId,
  newSlatePage,
  readEdge,
  readLayout,
  type ActorRef,
  type BlockLayout,
  type EdgeRecord,
  type Message,
  type Point,
} from './schema.js';

const coord = z.number().finite().min(-1_000_000).max(1_000_000);
const id = z.string().min(1).max(64);
const point = z.object({ x: coord, y: coord });
const size = z.object({ w: z.number().finite().min(40).max(20_000), h: z.number().finite().min(40).max(20_000) });
const title = z.string().max(200);
const blockType = z.enum(['frame', 'text', 'sticky', 'slate', 'model3d']);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('block.add'), blockType, at: point.optional(), parentId: id.optional(), title: title.optional(), id: id.optional() }),
  z.object({ type: z.literal('block.move'), id, to: point }),
  z.object({ type: z.literal('block.resize'), id, size }),
  z.object({
    type: z.literal('block.update'),
    id,
    patch: z.object({ title: title.optional(), color: z.string().max(32).optional() }).strict(),
  }),
  z.object({ type: z.literal('block.delete'), id }),
  z.object({ type: z.literal('frame.assign'), blockId: id, frameId: id.nullable() }),
  z.object({ type: z.literal('frame.reorder'), frameId: id, index: z.number().int().min(0) }),
  z.object({ type: z.literal('edge.add'), source: id, target: id }),
  z.object({ type: z.literal('edge.delete'), id }),
  z.object({ type: z.literal('slate.page.add'), blockId: id }),
  z.object({ type: z.literal('slate.undoRun'), blockId: id, pageId: id, runId: id }),
  z.object({
    type: z.literal('thread.add'),
    blockId: id,
    message: z.object({
      role: z.enum(['user', 'assistant', 'tool']),
      text: z.string().max(100_000),
      meta: z
        .object({ tool: z.string().optional(), ok: z.boolean().optional(), provider: z.string().optional(), ms: z.number().optional() })
        .optional(),
    }),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

/** A rule was broken, with a message safe to show to a person or return to an agent. */
export class ActionError extends Error {}

export type ActionResult = { id?: string };

export function absolutePosition(doc: Y.Doc, blockId: string): Point {
  const { blocks } = docParts(doc);
  const block = blocks.get(blockId);
  if (!block) throw new ActionError(`Block ${blockId} does not exist.`);
  const { x, y, parentId } = readLayout(block);
  const parent = parentId ? blocks.get(parentId) : undefined;
  if (!parent) return { x, y };
  const p = readLayout(parent);
  return { x: x + p.x, y: y + p.y };
}

/** Returns why a connection is not allowed, or null when it is. */
export function connectionProblem(doc: Y.Doc, source: string, target: string): string | null {
  const { blocks, edges } = docParts(doc);
  const a = blocks.get(source);
  const b = blocks.get(target);
  if (!a || !b) return 'Both blocks must exist.';
  if (source === target) return 'A block cannot connect to itself.';
  if (a.get('type') === 'frame' || b.get('type') === 'frame') return 'Frames cannot be connected.';

  const all: EdgeRecord[] = [];
  edges.forEach((edge) => all.push(readEdge(edge)));
  if (all.some((e) => e.source === source && e.target === target)) return 'These blocks are already connected.';

  // A cycle would appear if the source already reads, directly or not, from the target.
  const seen = new Set<string>();
  const stack = [source];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === target) return 'This connection would create a loop.';
    if (seen.has(current)) continue;
    seen.add(current);
    for (const e of all) if (e.target === current) stack.push(e.source);
  }
  return null;
}

function requireBlock(doc: Y.Doc, blockId: string): Y.Map<unknown> {
  const block = docParts(doc).blocks.get(blockId);
  if (!block) throw new ActionError(`Block ${blockId} does not exist.`);
  return block;
}

function requireFrame(doc: Y.Doc, frameId: string): Y.Map<unknown> {
  const frame = requireBlock(doc, frameId);
  if (frame.get('type') !== 'frame') throw new ActionError(`Block ${frameId} is not a frame.`);
  return frame;
}

const FRAME_PADDING = 24;

/**
 * A frame grows to fit a block dropped inside it. Children are relative, so only w and h change.
 * This happens on assignment and not on every move, or a block could never be dragged out.
 */
function growFrameToFit(frame: Y.Map<unknown>, child: Pick<BlockLayout, 'x' | 'y' | 'w' | 'h'>): void {
  const needW = child.x + child.w + FRAME_PADDING;
  const needH = child.y + child.h + FRAME_PADDING;
  if (needW > (frame.get('w') as number)) frame.set('w', needW);
  if (needH > (frame.get('h') as number)) frame.set('h', needH);
}

function assignToFrame(doc: Y.Doc, block: Y.Map<unknown>, frameId: string | null): void {
  const layout = readLayout(block);
  const absolute = absolutePosition(doc, layout.id);
  if (frameId === null) {
    block.set('parentId', null);
    block.set('x', absolute.x);
    block.set('y', absolute.y);
    return;
  }
  if (layout.type === 'frame') throw new ActionError('Frames cannot be placed inside frames.');
  const frame = requireFrame(doc, frameId);
  const f = readLayout(frame);
  const x = absolute.x - f.x;
  const y = absolute.y - f.y;
  block.set('parentId', frameId);
  block.set('x', x);
  block.set('y', y);
  growFrameToFit(frame, { x, y, w: layout.w, h: layout.h });
}

function addBlock(doc: Y.Doc, action: Extract<Action, { type: 'block.add' }>, actor: ActorRef): string {
  const { blocks, content, order } = docParts(doc);
  const blockId = action.id ?? newId();
  if (blocks.has(blockId)) throw new ActionError(`Block ${blockId} already exists.`);
  const { w, h } = DEFAULT_SIZE[action.blockType];
  const at = action.at ?? { x: 0, y: 0 };

  const block = new Y.Map<unknown>();
  block.set('id', blockId);
  block.set('type', action.blockType);
  block.set('title', action.title ?? BLOCK_LABEL[action.blockType]);
  block.set('x', at.x);
  block.set('y', at.y);
  block.set('w', w);
  block.set('h', h);
  block.set('parentId', null);
  block.set('createdBy', actor);
  blocks.set(blockId, block);

  const blockContent = newContent(action.blockType);
  if (blockContent) content.set(blockId, blockContent);
  if (action.blockType === 'frame') order.push([blockId]);
  // `at` is a board position, so assigning converts it to the frame's coordinates.
  if (action.parentId) assignToFrame(doc, block, action.parentId);
  return blockId;
}

function deleteEdgesOf(doc: Y.Doc, blockId: string): void {
  const { edges } = docParts(doc);
  for (const [edgeId, edge] of [...edges.entries()]) {
    const { source, target } = readEdge(edge);
    if (source === blockId || target === blockId) edges.delete(edgeId);
  }
}

function deleteBlock(doc: Y.Doc, blockId: string): void {
  const { blocks, content, threads, order } = docParts(doc);
  const block = requireBlock(doc, blockId);
  if (block.get('type') === 'frame') {
    // Deleting a frame keeps its blocks, at the same place on the board.
    for (const child of [...blocks.values()]) {
      if (child.get('parentId') === blockId) assignToFrame(doc, child, null);
    }
    const index = order.toArray().indexOf(blockId);
    if (index >= 0) order.delete(index);
  }
  deleteEdgesOf(doc, blockId);
  content.delete(blockId);
  threads.delete(blockId);
  blocks.delete(blockId);
}

function slatePages(doc: Y.Doc, blockId: string): Y.Array<Y.Map<unknown>> {
  if (requireBlock(doc, blockId).get('type') !== 'slate') throw new ActionError(`Block ${blockId} is not a Slate.`);
  return docParts(doc).content.get(blockId)!.get('pages') as Y.Array<Y.Map<unknown>>;
}

function run(doc: Y.Doc, action: Action, actor: ActorRef): ActionResult {
  const { edges, order, threads } = docParts(doc);
  switch (action.type) {
    case 'block.add':
      return { id: addBlock(doc, action, actor) };
    case 'block.move': {
      const block = requireBlock(doc, action.id);
      block.set('x', action.to.x);
      block.set('y', action.to.y);
      return {};
    }
    case 'block.resize': {
      const block = requireBlock(doc, action.id);
      block.set('w', action.size.w);
      block.set('h', action.size.h);
      return {};
    }
    case 'block.update': {
      const block = requireBlock(doc, action.id);
      if (action.patch.title !== undefined) block.set('title', action.patch.title);
      if (action.patch.color !== undefined) block.set('color', action.patch.color);
      return {};
    }
    case 'block.delete':
      deleteBlock(doc, action.id);
      return {};
    case 'frame.assign':
      assignToFrame(doc, requireBlock(doc, action.blockId), action.frameId);
      return {};
    case 'frame.reorder': {
      requireFrame(doc, action.frameId);
      const current = order.toArray().indexOf(action.frameId);
      if (current < 0) throw new ActionError(`Frame ${action.frameId} is not in the frame order.`);
      order.delete(current);
      order.insert(Math.min(action.index, order.length), [action.frameId]);
      return {};
    }
    case 'edge.add': {
      const problem = connectionProblem(doc, action.source, action.target);
      if (problem) throw new ActionError(problem);
      const edgeId = newId();
      const edge = new Y.Map<unknown>();
      edge.set('id', edgeId);
      edge.set('source', action.source);
      edge.set('target', action.target);
      edge.set('createdBy', actor);
      edges.set(edgeId, edge);
      return { id: edgeId };
    }
    case 'edge.delete':
      if (!edges.has(action.id)) throw new ActionError(`Connection ${action.id} does not exist.`);
      edges.delete(action.id);
      return {};
    case 'slate.page.add': {
      const pageId = newId();
      slatePages(doc, action.blockId).push([newSlatePage(pageId)]);
      return { id: pageId };
    }
    case 'slate.undoRun': {
      const page = slatePages(doc, action.blockId)
        .toArray()
        .find((p) => p.get('id') === action.pageId);
      if (!page) throw new ActionError(`Page ${action.pageId} does not exist.`);
      const objects = page.get('objects') as Y.Map<{ runId: string }>;
      for (const [objectId, object] of [...objects.entries()]) {
        if (object.runId === action.runId) objects.delete(objectId);
      }
      return {};
    }
    case 'thread.add': {
      requireBlock(doc, action.blockId);
      let thread = threads.get(action.blockId);
      if (!thread) {
        thread = new Y.Array<Message>();
        threads.set(action.blockId, thread);
      }
      const messageId = newId();
      thread.push([{ id: messageId, author: actor, createdAt: Date.now(), ...action.message }]);
      return { id: messageId };
    }
  }
}

/**
 * Validates and applies one action in one transaction. Throws ZodError on malformed input and
 * ActionError on a broken rule. `origin` lets undo managers tell who made the change.
 */
export function applyAction(doc: Y.Doc, input: unknown, actor: ActorRef, origin?: unknown): ActionResult {
  const action = ActionSchema.parse(input);
  let result: ActionResult = {};
  doc.transact(() => {
    result = run(doc, action, actor);
  }, origin);
  return result;
}
