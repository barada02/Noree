// The board in reading order: frames in the order people chose, then blocks by position.
// The Read view and the Markdown export both use this, so they always agree.
import * as Y from 'yjs';
import { docParts, readLayout, type BlockLayout, type Model3dVersion, type PageItem } from './schema.js';

export type OutlineSection = { frame: BlockLayout | null; blocks: BlockLayout[] };

const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;

export function boardOutline(doc: Y.Doc): OutlineSection[] {
  const { blocks, order } = docParts(doc);
  const layouts = [...blocks.values()].map(readLayout);
  const frames = new Map(layouts.filter((l) => l.type === 'frame').map((l) => [l.id, l]));
  const children = (frameId: string | null) => layouts.filter((l) => l.type !== 'frame' && l.parentId === frameId).sort(byPosition);

  const ordered = order.toArray().filter((id) => frames.has(id));
  const unlisted = [...frames.keys()].filter((id) => !ordered.includes(id));
  const sections: OutlineSection[] = [...ordered, ...unlisted].map((id) => ({ frame: frames.get(id)!, blocks: children(id) }));

  // Loose blocks whose parent frame is gone still have to appear.
  const loose = layouts.filter((l) => l.type !== 'frame' && (l.parentId === null || !frames.has(l.parentId))).sort(byPosition);
  if (loose.length) sections.push({ frame: null, blocks: loose });
  return sections;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function blockMarkdown(doc: Y.Doc, block: BlockLayout, assetBase: string): string {
  const content = docParts(doc).content.get(block.id);
  const heading = `### ${oneLine(block.title) || 'Untitled'}`;
  if (block.type === 'text') return `${heading}\n\n${String(content?.get('text') ?? '') || '_Empty._'}`;
  if (block.type === 'sticky') {
    const text = String(content?.get('text') ?? '');
    return `${heading}\n\n${text ? text.split('\n').map((line) => `> ${line}`).join('\n') : '_Empty._'}`;
  }
  if (block.type === 'slate') {
    const pages = (content?.get('pages') as Y.Array<Y.Map<unknown>> | undefined)?.toArray() ?? [];
    const parts = pages.map((page, index) => {
      const lines: string[] = [];
      const label = pages.length > 1 ? `Page ${index + 1}` : 'Page';
      const asset = page.get('snapshotAsset') as string | null;
      if (asset) lines.push(`![${label}](${assetBase}${asset})`);
      const transcript = page.get('transcript') as { text: string } | null;
      if (transcript?.text) lines.push(transcript.text);
      for (const item of (page.get('pastes') as Y.Array<PageItem>).toArray()) {
        if (item.kind === 'text' && !transcript?.text) lines.push(item.text);
      }
      return lines.join('\n\n') || `_${label} is empty._`;
    });
    return `${heading}\n\n${parts.join('\n\n')}`;
  }
  // 3D model
  const prompt = String(content?.get('prompt') ?? '');
  const versions = (content?.get('versions') as Y.Array<Model3dVersion> | undefined)?.toArray() ?? [];
  const current = versions.find((v) => v.id === content?.get('currentVersionId'));
  const lines: string[] = [];
  if (current?.previewAsset) lines.push(`![3D model preview](${assetBase}${current.previewAsset})`);
  if (current) lines.push(`Status: ${current.status === 'approved' ? 'approved' : 'draft, failed review'}`);
  if (prompt) lines.push(`Prompt: ${prompt}`);
  if (current?.brief) lines.push(`Brief: ${current.brief}`);
  return `${heading}\n\n${lines.join('\n\n') || '_Not generated yet._'}`;
}

/** The board as Markdown. `assetBase` makes image links absolute, so they work outside the site. */
export function boardMarkdown(doc: Y.Doc, assetBase = ''): string {
  const title = oneLine(String(docParts(doc).meta.get('title') ?? 'Untitled project'));
  const parts = [`# ${title}`];
  for (const section of boardOutline(doc)) {
    if (section.frame) {
      parts.push(`## ${oneLine(section.frame.title) || 'Untitled'}`);
      if (!section.blocks.length) parts.push('_This frame is empty._');
    }
    for (const block of section.blocks) parts.push(blockMarkdown(doc, block, assetBase));
  }
  if (parts.length === 1) parts.push('_This board is empty._');
  return `${parts.join('\n\n')}\n`;
}
