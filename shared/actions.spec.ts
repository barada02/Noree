import * as Y from 'yjs';
import { ZodError } from 'zod';
import { absolutePosition, ActionError, applyAction, connectionProblem } from './actions.js';
import { docParts, PAGE, readEdge, readLayout, type ActorRef, type BlockType } from './schema.js';

const me: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };

function setup() {
  const doc = new Y.Doc();
  const add = (blockType: BlockType, at = { x: 0, y: 0 }, parentId?: string) =>
    applyAction(doc, { type: 'block.add', blockType, at, parentId }, me).id!;
  const layout = (id: string) => readLayout(docParts(doc).blocks.get(id)!);
  return { doc, add, layout, parts: docParts(doc) };
}

describe('block actions', () => {
  it('adds a block with layout and matching content', () => {
    const { doc, add, layout, parts } = setup();
    const slate = add('slate', { x: 10, y: 20 });
    expect(layout(slate)).toMatchObject({ type: 'slate', x: 10, y: 20, parentId: null, createdBy: me });
    const pages = parts.content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>;
    expect(pages.length).toBe(1);
    expect(parts.content.get(slate)!.get('currentPageId')).toBe(pages.get(0).get('id'));
    expect(parts.content.get(add('text'))!.get('text')).toBeInstanceOf(Y.Text);
    expect(parts.content.get(add('model3d'))!.get('versions')).toBeInstanceOf(Y.Array);
    expect(doc.getMap('content').has(add('frame'))).toBe(false);
  });

  it('moves, resizes and updates', () => {
    const { doc, add, layout } = setup();
    const id = add('text');
    applyAction(doc, { type: 'block.move', id, to: { x: 5, y: 6 } }, me);
    applyAction(doc, { type: 'block.resize', id, size: { w: 300, h: 200 } }, me);
    applyAction(doc, { type: 'block.update', id, patch: { title: 'Notes' } }, me);
    expect(layout(id)).toMatchObject({ x: 5, y: 6, w: 300, h: 200, title: 'Notes' });
  });

  it('deletes a block with its content and connections', () => {
    const { doc, add, parts } = setup();
    const a = add('text');
    const b = add('text');
    applyAction(doc, { type: 'edge.add', source: a, target: b }, me);
    applyAction(doc, { type: 'thread.add', blockId: a, message: { role: 'user', text: 'hi' } }, me);
    applyAction(doc, { type: 'block.delete', id: a }, me);
    expect(parts.blocks.has(a)).toBe(false);
    expect(parts.content.has(a)).toBe(false);
    expect(parts.threads.has(a)).toBe(false);
    expect(parts.edges.size).toBe(0);
  });

  it('rejects invalid input without changing the document', () => {
    const { doc, add, layout } = setup();
    const id = add('text');
    expect(() => applyAction(doc, { type: 'block.move', id, to: { x: Infinity, y: 0 } }, me)).toThrow(ZodError);
    expect(() => applyAction(doc, { type: 'nope' }, me)).toThrow(ZodError);
    expect(() => applyAction(doc, { type: 'block.add', blockType: 'virus' }, me)).toThrow(ZodError);
    expect(() => applyAction(doc, { type: 'block.update', id, patch: { x: 1 } }, me)).toThrow(ZodError);
    expect(() => applyAction(doc, { type: 'block.move', id: 'missing', to: { x: 0, y: 0 } }, me)).toThrow(ActionError);
    expect(layout(id)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('frames', () => {
  it('converts positions on entering and leaving a frame', () => {
    const { doc, add, layout } = setup();
    const frame = add('frame', { x: 100, y: 200 });
    const block = add('text', { x: 150, y: 260 });
    applyAction(doc, { type: 'frame.assign', blockId: block, frameId: frame }, me);
    expect(layout(block)).toMatchObject({ x: 50, y: 60, parentId: frame });
    expect(absolutePosition(doc, block)).toEqual({ x: 150, y: 260 });
    applyAction(doc, { type: 'frame.assign', blockId: block, frameId: null }, me);
    expect(layout(block)).toMatchObject({ x: 150, y: 260, parentId: null });
  });

  it('treats block.add position as a board position when given a parent', () => {
    const { add, layout } = setup();
    const frame = add('frame', { x: 100, y: 100 });
    expect(layout(add('text', { x: 130, y: 140 }, frame))).toMatchObject({ x: 30, y: 40, parentId: frame });
  });

  it('moves children with the frame, because their positions are relative', () => {
    const { doc, add } = setup();
    const frame = add('frame', { x: 100, y: 100 });
    const block = add('text', { x: 130, y: 140 }, frame);
    applyAction(doc, { type: 'block.move', id: frame, to: { x: 500, y: 500 } }, me);
    expect(absolutePosition(doc, block)).toEqual({ x: 530, y: 540 });
  });

  it('grows to fit a block but never shrinks', () => {
    const { doc, add, layout } = setup();
    const frame = add('frame');
    const { w, h } = layout(frame);
    const inside = add('text', { x: 10, y: 10 }, frame);
    expect(layout(frame)).toMatchObject({ w, h });
    // Moving alone must not grow it, or dragging a block out would drag the frame's edge along.
    applyAction(doc, { type: 'block.move', id: inside, to: { x: w + 100, y: 10 } }, me);
    expect(layout(frame)).toMatchObject({ w, h });
    // Dropping does.
    applyAction(doc, { type: 'frame.assign', blockId: inside, frameId: frame }, me);
    expect(layout(frame).w).toBe(w + 100 + layout(inside).w + 24);
    expect(layout(frame).h).toBe(h);
  });

  it('keeps children in place when their frame is deleted', () => {
    const { doc, add, layout, parts } = setup();
    const frame = add('frame', { x: 100, y: 100 });
    const block = add('text', { x: 130, y: 140 }, frame);
    applyAction(doc, { type: 'block.delete', id: frame }, me);
    expect(layout(block)).toMatchObject({ x: 130, y: 140, parentId: null });
    expect(parts.order.length).toBe(0);
  });

  it('rejects nesting and non-frame targets', () => {
    const { doc, add } = setup();
    const a = add('frame');
    const b = add('frame');
    const text = add('text');
    expect(() => applyAction(doc, { type: 'frame.assign', blockId: a, frameId: b }, me)).toThrow(ActionError);
    expect(() => applyAction(doc, { type: 'frame.assign', blockId: text, frameId: text }, me)).toThrow(ActionError);
  });

  it('reorders frames', () => {
    const { doc, add, parts } = setup();
    const [a, b, c] = [add('frame'), add('frame'), add('frame')];
    applyAction(doc, { type: 'frame.reorder', frameId: c, index: 0 }, me);
    expect(parts.order.toArray()).toEqual([c, a, b]);
    applyAction(doc, { type: 'frame.reorder', frameId: c, index: 99 }, me);
    expect(parts.order.toArray()).toEqual([a, b, c]);
  });
});

describe('connections', () => {
  it('connects and disconnects', () => {
    const { doc, add, parts } = setup();
    const a = add('text');
    const b = add('slate');
    const edgeId = applyAction(doc, { type: 'edge.add', source: a, target: b }, me).id!;
    expect(readEdge(parts.edges.get(edgeId)!)).toMatchObject({ source: a, target: b, createdBy: me });
    applyAction(doc, { type: 'edge.delete', id: edgeId }, me);
    expect(parts.edges.size).toBe(0);
  });

  it('rejects self links, duplicates, frames and missing blocks', () => {
    const { doc, add } = setup();
    const a = add('text');
    const b = add('text');
    const frame = add('frame');
    applyAction(doc, { type: 'edge.add', source: a, target: b }, me);
    expect(connectionProblem(doc, a, a)).toMatch(/itself/);
    expect(connectionProblem(doc, a, b)).toMatch(/already/);
    expect(connectionProblem(doc, a, frame)).toMatch(/Frames/);
    expect(connectionProblem(doc, a, 'missing')).toMatch(/exist/);
    expect(() => applyAction(doc, { type: 'edge.add', source: a, target: a }, me)).toThrow(ActionError);
  });

  it('rejects direct and indirect cycles but allows diamonds', () => {
    const { doc, add } = setup();
    const [a, b, c, d] = [add('text'), add('text'), add('text'), add('text')];
    applyAction(doc, { type: 'edge.add', source: a, target: b }, me);
    applyAction(doc, { type: 'edge.add', source: b, target: c }, me);
    expect(connectionProblem(doc, b, a)).toMatch(/loop/);
    expect(connectionProblem(doc, c, a)).toMatch(/loop/);
    applyAction(doc, { type: 'edge.add', source: a, target: d }, me);
    expect(connectionProblem(doc, d, c)).toBeNull();
  });
});

describe('slate and threads', () => {
  it('adds pages and undoes one AI run only', () => {
    const { doc, add, parts } = setup();
    const slate = add('slate');
    const pageId = applyAction(doc, { type: 'slate.page.add', blockId: slate }, me).id!;
    const pages = parts.content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>;
    expect(pages.length).toBe(2);
    const objects = pages.get(1).get('objects') as Y.Map<{ runId: string }>;
    objects.set('a', { runId: 'r1' });
    objects.set('b', { runId: 'r2' });
    applyAction(doc, { type: 'slate.undoRun', blockId: slate, pageId, runId: 'r1' }, me);
    expect([...objects.keys()]).toEqual(['b']);
  });

  it('rejects Slate actions on other blocks', () => {
    const { doc, add } = setup();
    expect(() => applyAction(doc, { type: 'slate.page.add', blockId: add('text') }, me)).toThrow(ActionError);
  });

  it('records the author of a message', () => {
    const { doc, add, parts } = setup();
    const id = add('text');
    const agent: ActorRef = { kind: 'agent', id: 'a1', name: 'Agent' };
    applyAction(doc, { type: 'thread.add', blockId: id, message: { role: 'assistant', text: 'hello' } }, agent);
    expect(parts.threads.get(id)!.get(0)).toMatchObject({ role: 'assistant', text: 'hello', author: agent });
  });

  it('uses one coordinate space per page', () => {
    expect(PAGE).toEqual({ width: 1600, height: 1000 });
  });
});

describe('sync', () => {
  it('converges when two peers act concurrently', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const block = applyAction(a, { type: 'block.add', blockType: 'text' }, me).id!;
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    applyAction(a, { type: 'block.move', id: block, to: { x: 1, y: 2 } }, me);
    applyAction(b, { type: 'block.update', id: block, patch: { title: 'Merged' } }, me);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getMap('blocks').toJSON()).toEqual(b.getMap('blocks').toJSON());
    expect(readLayout(docParts(a).blocks.get(block)!)).toMatchObject({ x: 1, y: 2, title: 'Merged' });
  });

  it('passes the origin to the transaction, for undo tracking', () => {
    const doc = new Y.Doc();
    const origins: unknown[] = [];
    doc.on('afterTransaction', (t) => origins.push(t.origin));
    applyAction(doc, { type: 'block.add', blockType: 'text' }, me, 'origin-1');
    expect(origins).toContain('origin-1');
  });
});
