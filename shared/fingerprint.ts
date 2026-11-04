// Tells when a generated result is out of date. Shared because the browser shows the badge from
// the live document and the server records the value that a result was generated from.
import * as Y from 'yjs';
import { docParts, readEdge, readLayout } from './schema.js';

/** A fast, stable hash (cyrb53). Used to detect changes, not for security. */
export function stableHash(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, '0');
}

/** A connection means the target reads from the source. Reaches one step only, to stay predictable. */
export function incomingSources(doc: Y.Doc, blockId: string): string[] {
  const { edges, blocks } = docParts(doc);
  const sources: string[] = [];
  edges.forEach((edge) => {
    const { source, target } = readEdge(edge);
    if (target === blockId && blocks.has(source)) sources.push(source);
  });
  return sources;
}

/** Changes when what a block contributes as context changes. */
export function blockFingerprint(doc: Y.Doc, blockId: string): string {
  const { blocks, content } = docParts(doc);
  const block = blocks.get(blockId);
  if (!block) return 'missing';
  const { type } = readLayout(block);
  const blockContent = content.get(blockId);
  let input = '';
  if (type === 'text' || type === 'sticky') {
    input = String(blockContent?.get('text') ?? '');
  } else if (type === 'slate') {
    // Snapshot names are content hashes, so they change exactly when a page's picture does.
    const pages = blockContent?.get('pages') as Y.Array<Y.Map<unknown>> | undefined;
    input = (pages?.toArray() ?? []).map((page) => String(page.get('snapshotAsset') ?? 'empty')).join(',');
  } else if (type === 'model3d') {
    input = `${String(blockContent?.get('prompt') ?? '')}|${String(blockContent?.get('currentVersionId') ?? '')}`;
  }
  return stableHash(`${type}|${input}`);
}

/** What a generator's result depends on: its prompt and everything connected to it. */
export function inputHash(doc: Y.Doc, blockId: string, prompt: string): string {
  const sources = incomingSources(doc, blockId).map((id) => blockFingerprint(doc, id)).sort();
  return stableHash(`${prompt.trim()}|${sources.join(',')}`);
}
