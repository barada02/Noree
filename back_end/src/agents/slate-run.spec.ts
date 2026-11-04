import { HocuspocusProvider } from '@hocuspocus/provider';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../app.module.js';
import { CollabService } from '../collab/collab.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { applyAction } from '../shared/actions.js';
import type { AiObject, Stroke } from '../shared/protocol.js';
import { docParts, type ActorRef, type PageItem } from '../shared/schema.js';
import { pasteOutline, runSlateJob, SLATE_AGENT } from './slate-run.js';
import type { Provider, StepResult } from './slate/providers/types.js';

const person: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function until(condition: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** A provider that plays back fixed tool calls, so these tests are fast and spend no credits. */
function scripted(steps: { name: string; args: unknown }[][]): Provider {
  let index = 0;
  return {
    id: 'baseten',
    model: 'fake',
    label: 'Fake',
    step: async (): Promise<StepResult> => {
      const calls = steps[index++] ?? [];
      return {
        text: '',
        ms: 1,
        toolCalls: calls.map((c, i) => ({ id: `c${index}-${i}`, name: c.name, rawArgs: JSON.stringify(c.args) })),
      };
    },
  } as unknown as Provider;
}

const OUTLINE_AND_EXPLAIN = [
  [{ name: 'draw_outline', args: { target_ids: ['g1'] } }],
  [{ name: 'draw_arrow', args: { from_id: 'ellipse_1', direction: 'auto', room_for: 'text' } }],
  [{ name: 'add_text_box', args: { arrow_id: 'arrow_1', title: 'Note', body: 'A short explanation.' } }],
  [{ name: 'finish', args: { summary: 'Explained it.' } }],
];

const stroke = (id: string, x: number, y: number): Stroke => ({
  id,
  points: [
    [x, y],
    [x + 80, y + 10],
    [x + 40, y + 60],
  ],
});

describe('Slate runs', () => {
  let dataDir: string;
  let app: INestApplication;
  let port: number;
  let provider: HocuspocusProvider;
  let doc: Y.Doc;
  let projectId: string;
  let blockId: string;
  let pageId: string;

  const pages = () => docParts(doc).content.get(blockId)!.get('pages') as Y.Array<Y.Map<unknown>>;
  const page = () => pages().get(0);
  const objects = () => page().get('objects') as Y.Map<AiObject>;
  const job = (id: string) => docParts(doc).jobs.get(id)?.toJSON() as { status: string; error?: string; steps: { title: string }[] } | undefined;
  const http = () => request(app.getHttpServer() as HttpServer);

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'noree-slate-'));
    process.env.DATA_DIR = dataDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.get(CollabService).attach(app.getHttpServer() as HttpServer);
    await app.listen(0);
    port = ((app.getHttpServer() as HttpServer).address() as AddressInfo).port;

    projectId = ((await http().post('/projects').send({}).expect(201)).body as { id: string }).id;
    doc = new Y.Doc();
    provider = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}/collab`, name: `project:${projectId}`, document: doc });
    await until(() => provider.isSynced);
    blockId = applyAction(doc, { type: 'block.add', blockType: 'slate' }, person).id!;
    pageId = page().get('id') as string;
    (page().get('strokes') as Y.Array<Stroke>).push([stroke('s1', 300, 300)]);
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(async () => {
    provider.destroy();
    await app.close();
    delete process.env.DATA_DIR;
    delete process.env.AI_ENABLED;
    delete process.env.AI_MAX_RUNS_PER_HOUR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  function start(chain: Provider[], opDelayMs = 0) {
    return app.get(JobsService).start(
      { projectId, blockId, kind: 'slate-run', startedBy: person, fields: { pageId } },
      (context) => runSlateJob(context, { blockId, pageId, snapshot: 'data:image/png;base64,AA', provider: 'baseten' }, chain, opDelayMs),
    );
  }

  it('writes objects, steps and a message into the document for every client to see', async () => {
    const { jobId } = start([scripted(OUTLINE_AND_EXPLAIN)]);
    await until(() => job(jobId)?.status === 'done');
    expect([...objects().keys()].sort()).toEqual(['arrow_1', 'ellipse_1', 'textbox_1']);
    expect(objects().get('textbox_1')).toMatchObject({ runId: jobId, title: 'Note' });
    expect(job(jobId)!.steps.map((s) => s.title)).toContain('draw_outline');
    const message = docParts(doc).threads.get(blockId)!.get(0);
    expect(message).toMatchObject({ role: 'assistant', text: 'Explained it.', author: SLATE_AGENT });
  });

  it('leaves earlier runs in place, and Undo AI removes only one run', async () => {
    const first = start([scripted(OUTLINE_AND_EXPLAIN)]);
    await until(() => job(first.jobId)?.status === 'done');
    (page().get('strokes') as Y.Array<Stroke>).push([stroke('s2', 900, 700)]);
    await new Promise((r) => setTimeout(r, 100));
    const second = start([
      scripted([
        [{ name: 'draw_outline', args: { target_ids: ['g2'] } }],
        [{ name: 'finish', args: { summary: 'More.' } }],
      ]),
    ]);
    await until(() => job(second.jobId)?.status === 'done');
    expect(objects().has('ellipse_2')).toBe(true);
    applyAction(doc, { type: 'slate.undoRun', blockId, pageId, runId: second.jobId }, person);
    expect(objects().has('ellipse_2')).toBe(false);
    expect(objects().has('ellipse_1')).toBe(true);
  });

  it('allows one run per block', async () => {
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = { ...scripted(OUTLINE_AND_EXPLAIN), step: () => blocked.then(() => ({ text: '', ms: 1, toolCalls: [] })) } as unknown as Provider;
    const { jobId } = start([slow]);
    expect(() => start([scripted(OUTLINE_AND_EXPLAIN)])).toThrow(/already has a run/);
    release();
    await until(() => job(jobId) !== undefined && job(jobId)!.status !== 'running');
  });

  it('marks a cancelled run', async () => {
    const hanging = {
      ...scripted([]),
      step: (_s: unknown, _m: unknown, _t: unknown, signal: AbortSignal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    } as unknown as Provider;
    const { jobId } = start([hanging]);
    await until(() => job(jobId)?.status === 'running');
    expect(app.get(JobsService).cancel(jobId)).toBe(true);
    await until(() => job(jobId)?.status === 'cancelled');
    expect(app.get(JobsService).cancel(jobId)).toBe(false);
  });

  it('reports a missing provider as a failed run with a clear message', async () => {
    const { jobId } = start([]);
    await until(() => job(jobId)?.status === 'failed');
    expect(job(jobId)!.error).toMatch(/No provider/);
  });

  it('keeps going safely when the block is deleted during a run', async () => {
    const { jobId } = start([scripted(OUTLINE_AND_EXPLAIN)], 60);
    await until(() => (job(jobId)?.steps.length ?? 0) > 0);
    applyAction(doc, { type: 'block.delete', id: blockId }, person);
    await until(() => job(jobId)?.status === 'done');
    expect(docParts(doc).blocks.has(blockId)).toBe(false);
  });

  it('respects the kill switch and the hourly limit', () => {
    process.env.AI_ENABLED = 'false';
    expect(() => start([])).toThrow(/turned off/);
    delete process.env.AI_ENABLED;
    process.env.AI_MAX_RUNS_PER_HOUR = '0';
    expect(() => start([])).toThrow(/limit/);
  });

  it('treats a pasted item as something the agent can point at and avoid', () => {
    const item: PageItem = { id: 'x', kind: 'text', x: 10, y: 20, w: 100, h: 50, text: 'hi' };
    const outline = pasteOutline(item);
    expect(outline.id).toBe('paste:x');
    expect(outline.points).toContainEqual([110, 70]);
  });

  describe('assets', () => {
    const upload = (data: Buffer, name = 'a.png') => http().post(`/projects/${projectId}/assets`).attach('file', data, name);

    it('stores an image once, under a content hash, and serves it safely', async () => {
      const first = await upload(PNG).expect(201);
      const second = await upload(PNG).expect(201);
      const { url } = first.body as { url: string };
      expect(url).toMatch(new RegExp(`^/api/assets/${projectId}/[a-f0-9]{32}\\.png$`));
      expect((second.body as { url: string }).url).toBe(url);
      const served = await http().get(url.replace('/api', '')).expect(200);
      expect(served.headers['content-type']).toContain('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rejects anything that is not really an image, whatever its name says', async () => {
      await upload(Buffer.from('<script>alert(1)</script>'), 'evil.png').expect(415);
      await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg').expect(415);
      await upload(Buffer.from('export default function create() {}'), 'code.js').expect(415);
    });

    it('rejects oversized files, unknown projects and path tricks', async () => {
      await upload(Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1)])).expect(413);
      await http().post(`/projects/${'a'.repeat(48)}/assets`).attach('file', PNG, 'a.png').expect(404);
      await http().get(`/assets/${projectId}/..%2F..%2Fprojects.json`).expect(404);
      await http().get(`/assets/${projectId}/${'a'.repeat(32)}.png`).expect(404);
    });

    it('starts a run through HTTP, and refuses a snapshot from another project', async () => {
      const person_ = { id: 'p1', name: 'Test' };
      const route = `/projects/${projectId}/blocks/${blockId}/slate-run`;
      await http().post(route).send({ pageId, snapshotUrl: `/api/assets/${'a'.repeat(48)}/${'b'.repeat(32)}.png`, person: person_ }).expect(400);
      await http().post(route).send({ pageId }).expect(400);
      const { url } = (await upload(PNG).expect(201)).body as { url: string };
      const res = await http().post(route).send({ pageId, snapshotUrl: url, person: person_ }).expect(202);
      const { jobId } = res.body as { jobId: string };
      expect(jobId).toMatch(/^[a-f0-9]{24}$/);
      await until(() => job(jobId) !== undefined && job(jobId)!.status !== 'running');
    });
  });
});
