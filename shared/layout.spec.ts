import * as Y from 'yjs';
import { absolutePosition, applyAction } from './actions.js';
import { placeFrame, placeInFrame, placeLoose } from './layout.js';
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

  it('reports a missing frame', () => {
    const { doc } = setup();
    expect(() => placeInFrame(doc, 'nope', 'text')).toThrow(/does not exist/);
  });
});
