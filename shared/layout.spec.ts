import * as Y from 'yjs';
import { absolutePosition, applyAction } from './actions.js';
import { fitAndReflowFrames, placeFrame, placeInFrame, placeLoose } from './layout.js';
import { docParts, readLayout, type ActorRef, type BlockType } from './schema.js';

const me: ActorRef = { kind: 'agent', id: 'a', name: 'Agent' };

function setup() {
  const doc = new Y.Doc();
  const frame = () => applyAction(doc, { type: 'block.add', blockType: 'frame', title: 'F', at: placeFrame(doc) }, me).id!;
  const loose = (blockType: BlockType) => applyAction(doc, { type: 'block.add', blockType, at: placeLoose(doc, blockType) }, me).id!;
  const inFrame = (frameId: string, blockType: BlockType) =>
    applyAction(doc, { type: 'block.add', blockType, at: placeInFrame(doc, frameId, blockType), parentId: frameId }, me).id!;

  /** Every pair of rectangles on the board, in board coordinates, must not overlap, except a frame and its children. */
  const overlaps = () => {
    const items = [...docParts(doc).blocks.values()].map(readLayout).map((b) => ({ ...b, ...absolutePosition(doc, b.id) }));
    const found: string[] = [];
    for (const a of items) {
      for (const b of items) {
        if (a.id >= b.id || a.parentId === b.id || b.parentId === a.id) continue;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) found.push(`${a.type}/${b.type}`);
      }
    }
    return found;
  };
  return { doc, frame, loose, inFrame, overlaps };
}

describe('placing what agents create', () => {
  it('keeps loose blocks apart, wrapping long rows', () => {
    const { loose, overlaps } = setup();
    for (let i = 0; i < 12; i++) loose(i % 2 ? 'sticky' : 'slate');
    expect(overlaps()).toEqual([]);
  });

  it('keeps frames apart, even as they grow while being filled in any order', () => {
    const { frame, inFrame, overlaps } = setup();
    const a = frame();
    const b = frame();
    const c = frame();
    for (let i = 0; i < 7; i++) {
      inFrame(a, 'text');
      inFrame(b, 'slate');
      inFrame(c, 'model3d');
    }
    expect(overlaps()).toEqual([]);
  });

  it('fills a frame without making it wider', () => {
    const { doc, frame, inFrame } = setup();
    const id = frame();
    const before = readLayout(docParts(doc).blocks.get(id)!).w;
    for (let i = 0; i < 9; i++) inFrame(id, 'text');
    const after = readLayout(docParts(doc).blocks.get(id)!);
    expect(after.w).toBe(before);
    expect(after.h).toBeGreaterThan(420);
  });

  it('keeps loose blocks clear of frames that grow afterwards', () => {
    const { frame, loose, inFrame, overlaps } = setup();
    const id = frame();
    loose('sticky');
    loose('slate');
    for (let i = 0; i < 8; i++) inFrame(id, 'text');
    loose('text');
    frame();
    expect(overlaps()).toEqual([]);
  });

  it('works around what people have already placed', () => {
    const { doc, frame, overlaps } = setup();
    applyAction(doc, { type: 'block.add', blockType: 'slate', at: { x: 300, y: 200 } }, me);
    frame();
    frame();
    expect(overlaps()).toEqual([]);
  });

  it('fits frames to their contents and spaces them out again, without overlaps', () => {
    const { doc, frame, inFrame, overlaps, loose } = setup();
    const a = frame();
    const b = frame();
    const c = frame();
    inFrame(a, 'text');
    inFrame(b, 'text');
    inFrame(b, 'sticky');
    inFrame(b, 'text');
    inFrame(c, 'slate');
    loose('sticky');
    const ids = [a, b, c];
    const before = ids.map((id) => readLayout(docParts(doc).blocks.get(id)!));
    fitAndReflowFrames(doc, ids);
    const after = ids.map((id) => readLayout(docParts(doc).blocks.get(id)!));
    after.forEach((f, i) => {
      expect(f.w).toBeLessThan(before[i].w);
      expect(f.w).toBeGreaterThanOrEqual(320);
      expect(f.h).toBeGreaterThanOrEqual(200);
    });
    expect(after[1].x).toBeGreaterThan(after[0].x + after[0].w);
    expect(after[2].x).toBeGreaterThan(after[1].x + after[1].w);
    expect(overlaps()).toEqual([]);
    // Contents stay inside their frame.
    for (const child of [...docParts(doc).blocks.values()].map(readLayout).filter((b) => b.parentId)) {
      const f = after[ids.indexOf(child.parentId!)];
      expect(child.x + child.w).toBeLessThanOrEqual(f.w);
      expect(child.y + child.h).toBeLessThanOrEqual(f.h);
    }
  });

  it('leaves empty frames and unknown ids alone', () => {
    const { doc, frame } = setup();
    const empty = frame();
    const size = readLayout(docParts(doc).blocks.get(empty)!);
    fitAndReflowFrames(doc, [empty, 'missing']);
    expect(readLayout(docParts(doc).blocks.get(empty)!)).toMatchObject({ w: size.w, h: size.h });
    expect(() => fitAndReflowFrames(doc, [])).not.toThrow();
  });

  it('reports a missing frame', () => {
    const { doc } = setup();
    expect(() => placeInFrame(doc, 'nope', 'text')).toThrow(/does not exist/);
  });
});
