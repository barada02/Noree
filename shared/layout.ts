// Where the server puts things an agent creates. Models never give coordinates.
// The rule that keeps a batch of additions tidy: frames only grow downward, so new frames go to the
// right of everything, and loose blocks go above the frames, where a growing frame can't reach them.
import * as Y from 'yjs';
import { DEFAULT_SIZE, docParts, readLayout, type BlockLayout, type BlockType, type Point } from './schema.js';

const GAP = 40;
const PADDING = 24;
const ROW_WIDTH = 1400;

function allLayouts(doc: Y.Doc): BlockLayout[] {
  return [...docParts(doc).blocks.values()].map(readLayout);
}

/** Next free spot in a row of blocks, starting a new row when this one is full. */
function nextInRows(items: BlockLayout[], width: number, size: { w: number; h: number }, origin: Point, gap: number): Point {
  if (!items.length) return origin;
  const lastRowTop = Math.max(...items.map((b) => b.y));
  const row = items.filter((b) => b.y === lastRowTop);
  const x = Math.max(...row.map((b) => b.x + b.w)) + gap;
  if (x + size.w <= origin.x + width) return { x, y: lastRowTop };
  return { x: origin.x, y: Math.max(...items.map((b) => b.y + b.h)) + gap };
}

/** A new frame, to the right of everything else. */
export function placeFrame(doc: Y.Doc): Point {
  const layouts = allLayouts(doc).filter((b) => !b.parentId);
  if (!layouts.length) return { x: 0, y: 0 };
  const frames = layouts.filter((b) => b.type === 'frame');
  return {
    x: Math.max(...layouts.map((b) => b.x + b.w)) + GAP * 2,
    y: frames.length ? Math.min(...frames.map((b) => b.y)) : Math.min(...layouts.map((b) => b.y)),
  };
}

/** A board position inside a frame, filling rows that fit its width so it only grows downward. */
export function placeInFrame(doc: Y.Doc, frameId: string, type: BlockType): Point {
  const layouts = allLayouts(doc);
  const frame = layouts.find((b) => b.id === frameId);
  if (!frame) throw new Error(`Frame ${frameId} does not exist.`);
  const children = layouts.filter((b) => b.parentId === frameId);
  const spot = nextInRows(children, frame.w - PADDING * 2, DEFAULT_SIZE[type], { x: PADDING, y: PADDING }, PADDING);
  return { x: frame.x + spot.x, y: frame.y + spot.y };
}

/** A block in no frame. Above any frames, or in rows of its own on a board without them. */
export function placeLoose(doc: Y.Doc, type: BlockType): Point {
  const layouts = allLayouts(doc);
  const size = DEFAULT_SIZE[type];
  const frames = layouts.filter((b) => b.type === 'frame');
  const loose = layouts.filter((b) => b.type !== 'frame' && !b.parentId);
  if (!frames.length) return nextInRows(loose, ROW_WIDTH, size, { x: 0, y: 0 }, GAP);

  const top = Math.min(...frames.map((b) => b.y));
  const left = Math.min(...frames.map((b) => b.x));
  const above = loose.filter((b) => b.y + b.h <= top);
  if (!above.length) return { x: left, y: top - size.h - GAP };
  const rowTop = Math.min(...above.map((b) => b.y));
  const row = above.filter((b) => b.y === rowTop);
  const x = Math.max(...row.map((b) => b.x + b.w)) + GAP;
  // A taller block than the row's others mustn't reach down into the frames below.
  if (x + size.w <= left + ROW_WIDTH && rowTop + size.h + GAP <= top) return { x, y: rowTop };
  return { x: left, y: rowTop - size.h - GAP };
}

const MIN_FRAME = { w: 320, h: 200 };

/** Shrinks a frame to fit what's in it, with the same padding as when blocks are placed. */
export function fitFrame(doc: Y.Doc, frameId: string): void {
  const layouts = allLayouts(doc);
  const frame = docParts(doc).blocks.get(frameId);
  const children = layouts.filter((b) => b.parentId === frameId);
  if (!frame || !children.length) return;
  frame.set('w', Math.max(MIN_FRAME.w, Math.max(...children.map((b) => b.x + b.w)) + PADDING));
  frame.set('h', Math.max(MIN_FRAME.h, Math.max(...children.map((b) => b.y + b.h)) + PADDING));
}

/** Fits several frames, then spaces them out left to right again, since they were placed when they were bigger. */
export function fitAndReflowFrames(doc: Y.Doc, frameIds: string[]): void {
  const { blocks } = docParts(doc);
  const frames = frameIds.map((id) => blocks.get(id)).filter((f): f is Y.Map<unknown> => !!f);
  if (!frames.length) return;
  doc.transact(() => {
    for (const id of frameIds) fitFrame(doc, id);
    const ordered = [...frames].sort((a, b) => (a.get('x') as number) - (b.get('x') as number));
    let x = ordered[0].get('x') as number;
    for (const frame of ordered) {
      frame.set('x', x);
      x += (frame.get('w') as number) + GAP * 2;
    }
  });
}
