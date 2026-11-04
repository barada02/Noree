import * as Y from 'yjs';
import { applyAction } from './actions.js';
import { blockFingerprint, inputHash, stableHash } from './fingerprint.js';
import { boardMarkdown, boardOutline } from './outline.js';
import { docParts, initDoc, type ActorRef, type BlockType } from './schema.js';

const me: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };

function setup() {
  const doc = new Y.Doc();
  initDoc(doc, 'Plan');
  const add = (blockType: BlockType, title: string, at = { x: 0, y: 0 }, parentId?: string) =>
    applyAction(doc, { type: 'block.add', blockType, title, at, parentId }, me).id!;
  const setText = (id: string, text: string) => (docParts(doc).content.get(id)!.get('text') as Y.Text).insert(0, text);
  const titles = () => boardOutline(doc).map((s) => [s.frame?.title ?? null, s.blocks.map((b) => b.title)]);
  return { doc, add, setText, titles };
}

describe('reading order', () => {
  it('follows frame order, then position, with loose blocks last', () => {
    const { doc, add, titles } = setup();
    const f1 = add('frame', 'First', { x: 0, y: 0 });
    const f2 = add('frame', 'Second', { x: 1000, y: 0 });
    add('text', 'Lower', { x: 10, y: 300 }, f1);
    add('text', 'Upper', { x: 10, y: 50 }, f1);
    add('sticky', 'In second', { x: 1010, y: 20 }, f2);
    add('text', 'Loose', { x: 5000, y: 5000 });
    expect(titles()).toEqual([
      ['First', ['Upper', 'Lower']],
      ['Second', ['In second']],
      [null, ['Loose']],
    ]);
    applyAction(doc, { type: 'frame.reorder', frameId: f2, index: 0 }, me);
    expect(titles().map((t) => t[0])).toEqual(['Second', 'First', null]);
  });

  it('changes when a block moves', () => {
    const { doc, add, titles } = setup();
    const a = add('text', 'A', { x: 0, y: 0 });
    add('text', 'B', { x: 0, y: 100 });
    applyAction(doc, { type: 'block.move', id: a, to: { x: 0, y: 500 } }, me);
    expect(titles()).toEqual([[null, ['B', 'A']]]);
  });
});

describe('Markdown export', () => {
  it('renders text, stickies, frames and images in reading order', () => {
    const { doc, add, setText } = setup();
    const frame = add('frame', 'Ideas', { x: 0, y: 0 });
    const text = add('text', 'Notes', { x: 10, y: 10 }, frame);
    setText(text, 'Some notes');
    const sticky = add('sticky', 'Reminder', { x: 10, y: 400 }, frame);
    setText(sticky, 'line one\nline two');
    const slate = add('slate', 'Math', { x: 5000, y: 0 });
    const page = (docParts(doc).content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0);
    page.set('snapshotAsset', '/api/assets/p/abc.png');
    page.set('transcript', { hash: 'x', text: 'z = 3 + 4i' });

    const md = boardMarkdown(doc, 'https://example.com');
    expect(md).toContain('# Plan');
    expect(md).toContain('## Ideas');
    expect(md.indexOf('## Ideas')).toBeLessThan(md.indexOf('### Notes'));
    expect(md).toContain('Some notes');
    expect(md).toContain('> line one\n> line two');
    expect(md).toContain('![Page](https://example.com/api/assets/p/abc.png)');
    expect(md).toContain('z = 3 + 4i');
  });

  it('keeps a title with line breaks from starting new sections', () => {
    const { doc, add } = setup();
    add('text', 'Bad\n# Heading');
    expect(boardMarkdown(doc)).toContain('### Bad # Heading');
  });

  it('says so when things are empty', () => {
    const { doc, add } = setup();
    expect(boardMarkdown(doc)).toContain('This board is empty');
    add('frame', 'Empty frame');
    add('model3d', 'Model', { x: 0, y: 900 });
    const md = boardMarkdown(doc);
    expect(md).toContain('This frame is empty');
    expect(md).toContain('Not generated yet');
  });
});

describe('out-of-date detection', () => {
  it('is stable, and sensitive to what matters', () => {
    expect(stableHash('a')).toBe(stableHash('a'));
    expect(stableHash('a')).not.toBe(stableHash('b'));
    const { doc, add, setText } = setup();
    const source = add('text', 'Source');
    const model = add('model3d', 'Model');
    const empty = inputHash(doc, model, 'chair');
    expect(inputHash(doc, model, 'chair')).toBe(empty);
    expect(inputHash(doc, model, ' chair ')).toBe(empty);
    expect(inputHash(doc, model, 'table')).not.toBe(empty);

    const edgeId = applyAction(doc, { type: 'edge.add', source, target: model }, me).id!;
    const connected = inputHash(doc, model, 'chair');
    expect(connected).not.toBe(empty);

    setText(source, 'wood');
    const edited = inputHash(doc, model, 'chair');
    expect(edited).not.toBe(connected);

    // Moving or renaming a source isn't a content change.
    applyAction(doc, { type: 'block.move', id: source, to: { x: 500, y: 500 } }, me);
    applyAction(doc, { type: 'block.update', id: source, patch: { title: 'Renamed' } }, me);
    expect(inputHash(doc, model, 'chair')).toBe(edited);

    applyAction(doc, { type: 'edge.delete', id: edgeId }, me);
    expect(inputHash(doc, model, 'chair')).toBe(empty);
  });

  it('follows a Slate through its snapshot', () => {
    const { doc, add } = setup();
    const slate = add('slate', 'Math');
    const before = blockFingerprint(doc, slate);
    const page = (docParts(doc).content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0);
    page.set('snapshotAsset', '/api/assets/p/one.png');
    expect(blockFingerprint(doc, slate)).not.toBe(before);
  });

  it('does not depend on connection order', () => {
    const { doc, add, setText } = setup();
    const a = add('text', 'A');
    const b = add('text', 'B');
    setText(a, 'one');
    setText(b, 'two');
    const m1 = add('model3d', 'M1');
    const m2 = add('model3d', 'M2');
    applyAction(doc, { type: 'edge.add', source: a, target: m1 }, me);
    applyAction(doc, { type: 'edge.add', source: b, target: m1 }, me);
    applyAction(doc, { type: 'edge.add', source: b, target: m2 }, me);
    applyAction(doc, { type: 'edge.add', source: a, target: m2 }, me);
    expect(inputHash(doc, m1, 'x')).toBe(inputHash(doc, m2, 'x'));
  });
});
