import type { DirectConnection } from '@hocuspocus/server';
import * as Y from 'yjs';
import { incomingSources } from '../shared/fingerprint.js';
import { docParts, readLayout, type BlockType, type Model3dVersion, type PageItem } from '../shared/schema.js';

export const MAX_SOURCE_CHARS = 6000;
export const MAX_IMAGES = 3;
const MAX_TRANSCRIBED_PAGES = 3;

export type BlockContext = {
  blockId: string;
  type: BlockType;
  title: string;
  text: string;
  /** Asset URLs. */
  images: string[];
};

/** Reads one Slate page's snapshot as text. Null means it couldn't be read this time. */
export type Transcriber = (assetUrl: string) => Promise<string | null>;

function clip(text: string): string {
  return text.length > MAX_SOURCE_CHARS ? `${text.slice(0, MAX_SOURCE_CHARS)}\n[cut off here]` : text;
}

async function readSlate(connection: DirectConnection, content: Y.Map<unknown>, transcribe: Transcriber): Promise<{ text: string; images: string[] }> {
  const pages = (content.get('pages') as Y.Array<Y.Map<unknown>>).toArray();
  const currentId = content.get('currentPageId');
  // The current page matters most, so it's first when the limits apply.
  const ordered = [...pages].sort((a, b) => Number(b.get('id') === currentId) - Number(a.get('id') === currentId));
  const parts: string[] = [];
  const images: string[] = [];

  for (const page of ordered.slice(0, MAX_TRANSCRIBED_PAGES)) {
    const number = pages.indexOf(page) + 1;
    const asset = page.get('snapshotAsset') as string | null;
    if (!asset) continue;
    images.push(asset);

    // The asset's name is a hash of its content, so it's a safe key: same picture, same transcript.
    let transcript = (page.get('transcript') as { hash: string; text: string } | null) ?? null;
    if (transcript?.hash !== asset) {
      const text = await transcribe(asset);
      if (text !== null) {
        transcript = { hash: asset, text };
        await connection.transact(() => page.set('transcript', transcript));
      } else {
        transcript = null;
      }
    }
    if (transcript) {
      parts.push(`Page ${number}:\n${transcript.text}`);
    } else {
      // Pasted text is still known without the vision call.
      const pasted = (page.get('pastes') as Y.Array<PageItem>).toArray().flatMap((p) => (p.kind === 'text' ? [p.text] : []));
      parts.push(`Page ${number}: could not be read as text this time.${pasted.length ? ` Pasted text: ${pasted.join(' / ')}` : ''}`);
    }
  }
  return { text: parts.join('\n\n') || 'This Slate is empty.', images };
}

async function readBlock(connection: DirectConnection, doc: Y.Doc, blockId: string, transcribe: Transcriber): Promise<BlockContext | null> {
  const { blocks, content } = docParts(doc);
  const block = blocks.get(blockId);
  if (!block) return null;
  const { type, title } = readLayout(block);
  const blockContent = content.get(blockId);
  let text = '';
  let images: string[] = [];

  if (type === 'text' || type === 'sticky') {
    text = String(blockContent?.get('text') ?? '');
  } else if (type === 'slate' && blockContent) {
    const slate = await readSlate(connection, blockContent, transcribe);
    text = slate.text;
    images = slate.images;
  } else if (type === 'model3d' && blockContent) {
    const prompt = String(blockContent.get('prompt') ?? '');
    const versions = (blockContent.get('versions') as Y.Array<Model3dVersion>).toArray();
    const current = versions.find((v) => v.id === blockContent.get('currentVersionId'));
    text = current ? `A generated 3D model. Description: ${current.brief ?? prompt}` : `A 3D model not generated yet. Prompt: ${prompt || '(none)'}`;
    if (current?.previewAsset) images = [current.previewAsset];
  }

  return { blockId, type, title, text: clip(text), images };
}

/** The live document behind a connection, through its public API. */
export async function documentOf(connection: DirectConnection): Promise<Y.Doc> {
  let doc: Y.Doc | undefined;
  await connection.transact((document) => {
    doc = document;
  });
  if (!doc) throw new Error('The document connection is closed.');
  return doc;
}

/** The block itself, then what it reads from. Applies the limits that keep model calls small. */
export async function collectContext(connection: DirectConnection, blockId: string, transcribe: Transcriber): Promise<{ own: BlockContext | null; sources: BlockContext[] }> {
  const doc = await documentOf(connection);
  const own = await readBlock(connection, doc, blockId, transcribe);
  const sources: BlockContext[] = [];
  for (const sourceId of incomingSources(doc, blockId)) {
    const source = await readBlock(connection, doc, sourceId, transcribe);
    if (source) sources.push(source);
  }
  // Sources come before the block's own, and the total is capped.
  let remaining = MAX_IMAGES;
  const limit = (context: BlockContext | null) => {
    if (!context) return;
    context.images = context.images.slice(0, remaining);
    remaining -= context.images.length;
  };
  sources.forEach(limit);
  limit(own);
  return { own, sources };
}

