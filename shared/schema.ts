// Shape of a project's Y.Doc. See docs/noree-v1-plan.html, section 5.
// Compiled by both apps: use `import type`, `.js` import extensions, and no enums.
import * as Y from 'yjs';
import type { AiObject, Stroke } from './protocol.js';

export const SCHEMA_VERSION = 1;
/** Every Slate page is its own coordinate space. The agent receives this as its `world` size. */
export const PAGE = { width: 1600, height: 1000 } as const;

export type BlockType = 'frame' | 'text' | 'sticky' | 'slate' | 'model3d';
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };
export type ActorRef = { kind: 'person' | 'agent'; id: string; name: string };

export interface BlockLayout {
  id: string;
  type: BlockType;
  title: string;
  /** Relative to the parent frame when parentId is set. */
  x: number;
  y: number;
  w: number;
  h: number;
  parentId: string | null;
  color?: string;
  createdBy: ActorRef;
}

export interface EdgeRecord {
  id: string;
  source: string;
  target: string;
  createdBy: ActorRef;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  author: ActorRef;
  text: string;
  createdAt: number;
  meta?: { tool?: string; ok?: boolean; provider?: string; ms?: number };
}

export type PageItem =
  | { id: string; kind: 'text'; x: number; y: number; w: number; h: number; text: string }
  | { id: string; kind: 'image'; x: number; y: number; w: number; h: number; url: string };

export interface Model3dVersion {
  id: string;
  entryId: string;
  status: 'approved' | 'draft';
  codeAsset: string;
  previewAsset: string | null;
  inputHash: string;
  /** What the 3D service was asked to build. */
  brief?: string;
  createdBy: ActorRef;
  createdAt: number;
}

export type JobKind = 'slate-run' | 'generate-3d' | 'chat';
export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';
export interface JobStep {
  title: string;
  status: string;
  note?: string;
}

export const DEFAULT_SIZE: Record<BlockType, Size> = {
  frame: { w: 640, h: 420 },
  text: { w: 280, h: 160 },
  sticky: { w: 200, h: 200 },
  slate: { w: 480, h: 300 },
  model3d: { w: 320, h: 300 },
};

export const BLOCK_LABEL: Record<BlockType, string> = {
  frame: 'Frame',
  text: 'Text',
  sticky: 'Sticky',
  slate: 'Slate',
  model3d: '3D model',
};

/** Named access to the document's top-level types, so the names live in one place. */
export function docParts(doc: Y.Doc) {
  return {
    meta: doc.getMap<unknown>('meta'),
    blocks: doc.getMap<Y.Map<unknown>>('blocks'),
    edges: doc.getMap<Y.Map<unknown>>('edges'),
    order: doc.getArray<string>('order'),
    content: doc.getMap<Y.Map<unknown>>('content'),
    threads: doc.getMap<Y.Array<Message>>('threads'),
    jobs: doc.getMap<Y.Map<unknown>>('jobs'),
  };
}

export function newId(): string {
  // getRandomValues rather than randomUUID: randomUUID is missing outside secure contexts.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function readLayout(block: Y.Map<unknown>): BlockLayout {
  return block.toJSON() as BlockLayout;
}

export function readEdge(edge: Y.Map<unknown>): EdgeRecord {
  return edge.toJSON() as EdgeRecord;
}

/** Takes the id because a Y.Map cannot be read until it is attached to a document. */
export function newSlatePage(id: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set('id', id);
  page.set('strokes', new Y.Array<Stroke>());
  page.set('objects', new Y.Map<AiObject>());
  page.set('widgetValues', new Y.Map<unknown>());
  page.set('pastes', new Y.Array<PageItem>());
  page.set('snapshotAsset', null);
  page.set('transcript', null);
  return page;
}

/** Text and sticky hold a Y.Text, Slate holds pages, and 3D holds a prompt and versions. Frames hold nothing. */
export function newContent(type: BlockType): Y.Map<unknown> | null {
  if (type === 'frame') return null;
  const content = new Y.Map<unknown>();
  if (type === 'text' || type === 'sticky') {
    content.set('text', new Y.Text());
  } else if (type === 'slate') {
    const pageId = newId();
    const pages = new Y.Array<Y.Map<unknown>>();
    pages.push([newSlatePage(pageId)]);
    content.set('pages', pages);
    content.set('currentPageId', pageId);
  } else {
    content.set('prompt', '');
    content.set('versions', new Y.Array<Model3dVersion>());
    content.set('currentVersionId', null);
  }
  return content;
}

export function initDoc(doc: Y.Doc, title: string): void {
  const { meta } = docParts(doc);
  doc.transact(() => {
    meta.set('title', title);
    meta.set('createdAt', Date.now());
    meta.set('schemaVersion', SCHEMA_VERSION);
  });
}
