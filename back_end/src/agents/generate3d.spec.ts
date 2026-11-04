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
import { AssetsService } from '../assets/assets.service.js';
import { CollabService } from '../collab/collab.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { applyAction } from '../shared/actions.js';
import { inputHash } from '../shared/fingerprint.js';
import { docParts, type ActorRef, type Model3dVersion } from '../shared/schema.js';
import { MODEL_AGENT, runGenerateJob } from './generate3d.js';
import { httpSandboxClient, SandboxUnavailable, type GeneratePayload, type SandboxClient, type SandboxRun } from './sandbox-client.js';
import type { Msg, Provider } from './slate/providers/types.js';

const person: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const CODE = 'export default function create(container) { return { dispose() {} }; }';

async function until(condition: () => boolean, ms = 6000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 15));
  }
}

function fakeProvider() {
  const calls: Msg[][] = [];
  const provider = {
    id: 'meta',
    model: 'fake',
    label: 'Fake',
    step: async (system: string, msgs: Msg[]) => {
      calls.push(msgs);
      return { text: system.startsWith('You transcribe') ? 'a sketch of a chair' : 'A wooden chair with four legs.', ms: 1, toolCalls: [] };
    },
  } as unknown as Provider;
  return { provider, calls };
}

/** Behaves like the real service: a run appears, gains steps over time, then the call returns. */
function fakeSandbox(options: { status?: 'approved' | 'draft'; preview?: boolean; delayMs?: number; failWith?: Error } = {}) {
  const runs: SandboxRun[] = [{ id: 'old', prompt: 'A wooden chair with four legs.', status: 'approved', steps: [{ title: 'From an earlier run', status: 'pass' }] }];
  const payloads: GeneratePayload[] = [];
  const client: SandboxClient = {
    listRuns: async () => [...runs].reverse(),
    generate: async (payload) => {
      payloads.push(payload);
      if (options.failWith) throw options.failWith;
      const run: SandboxRun = { id: 'new', prompt: payload.prompt, status: 'running', steps: [{ title: 'Agent writes code', status: 'pass' }] };
      runs.push(run);
      await new Promise((r) => setTimeout(r, options.delayMs ?? 60));
      run.steps.push({ title: 'Modal Sandbox test', status: 'pass', note: 'Rendered' });
      run.status = options.status ?? 'approved';
      return { run, entry: { id: 'e1', version: 1, status: options.status ?? 'approved', preview: options.preview === false ? null : '/registry/e1/preview' }, attempts: 1, review: 'ok' };
    },
    code: async () => CODE,
    preview: async () => PNG,
  };
  return { client, payloads };
}

describe('3D generation', () => {
  let dataDir: string;
  let app: INestApplication;
  let client: HocuspocusProvider;
  let doc: Y.Doc;
  let projectId: string;
  let blockId: string;

  const http = () => request(app.getHttpServer() as HttpServer);
  const content = () => docParts(doc).content.get(blockId)!;
  const versions = () => (content().get('versions') as Y.Array<Model3dVersion>).toArray();
  const job = (id: string) => docParts(doc).jobs.get(id)?.toJSON() as { status: string; error?: string; steps: { title: string; note?: string }[] } | undefined;
  const setPrompt = (text: string) => content().set('prompt', text);
  const settle = () => new Promise((r) => setTimeout(r, 100));

  function generate(chain: Provider[], sandbox: SandboxClient) {
    const assets = app.get(AssetsService);
    return app.get(JobsService).start({ projectId, blockId, kind: 'generate-3d', startedBy: person }, (context) =>
      runGenerateJob(
        context,
        {
          blockId,
          person,
          pollMs: 10,
          readAsset: (url) => assets.readAsDataUrl(projectId, url),
          saveImage: (data) => assets.saveImage(projectId, data),
          saveCode: (code) => assets.saveCode(projectId, code),
        },
        chain,
        sandbox,
      ),
    );
  }
  const finished = async (id: string) => {
    await until(() => !!job(id) && job(id)!.status !== 'running');
    await settle();
    return job(id)!;
  };

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'noree-3d-'));
    process.env.DATA_DIR = dataDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.get(CollabService).attach(app.getHttpServer() as HttpServer);
    await app.listen(0);
    const { port } = (app.getHttpServer() as HttpServer).address() as AddressInfo;
    projectId = ((await http().post('/projects').send({}).expect(201)).body as { id: string }).id;
    doc = new Y.Doc();
    client = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}/collab`, name: `project:${projectId}`, document: doc });
    await until(() => client.isSynced);
    blockId = applyAction(doc, { type: 'block.add', blockType: 'model3d' }, person).id!;
    await settle();
  });

  afterEach(async () => {
    client.destroy();
    await app.close();
    delete process.env.DATA_DIR;
    delete process.env.GEN3D_MAX_RUNS_PER_HOUR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('uses the prompt directly when nothing is connected, with no model call', async () => {
    setPrompt('a red cube');
    await settle();
    const llm = fakeProvider();
    const sandbox = fakeSandbox();
    const { status } = await finished(generate([llm.provider], sandbox.client).jobId);
    expect(status).toBe('done');
    expect(llm.calls).toHaveLength(0);
    expect(sandbox.payloads[0].prompt).toBe('a red cube');
  });

  it('turns connected blocks into a brief, and records a version with assets', async () => {
    const source = applyAction(doc, { type: 'block.add', blockType: 'text', title: 'Notes' }, person).id!;
    (docParts(doc).content.get(source)!.get('text') as Y.Text).insert(0, 'make it wooden');
    applyAction(doc, { type: 'edge.add', source, target: blockId }, person);
    setPrompt('a chair');
    await settle();

    const llm = fakeProvider();
    const sandbox = fakeSandbox();
    const { status } = await finished(generate([llm.provider], sandbox.client).jobId);
    expect(status).toBe('done');

    const sent = llm.calls[0].at(-1)!;
    expect(sent.role === 'user' && sent.text).toContain('make it wooden');
    expect(sandbox.payloads[0]).toMatchObject({ prompt: 'A wooden chair with four legs.', scene: ['Notes'] });

    const [version] = versions();
    expect(version).toMatchObject({ entryId: 'e1', status: 'approved', brief: 'A wooden chair with four legs.', createdBy: person });
    expect(version.codeAsset).toMatch(/\.js$/);
    expect(version.previewAsset).toMatch(/\.png$/);
    expect(content().get('currentVersionId')).toBe(version.id);
    expect(version.inputHash).toBe(inputHash(doc, blockId, 'a chair'));
    expect(docParts(doc).threads.get(blockId)!.get(0).author).toEqual(MODEL_AGENT);

    // The code comes back as text, so a browser can never run it directly from this site.
    const served = await http().get(version.codeAsset.replace('/api', '')).expect(200);
    expect(served.text).toBe(CODE);
    expect(served.headers['content-type']).toContain('text/plain');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  it('shows progress from the service as it runs, without steps from earlier runs', async () => {
    setPrompt('A wooden chair with four legs.');
    await settle();
    const sandbox = fakeSandbox({ delayMs: 200 });
    const { jobId } = generate([fakeProvider().provider], sandbox.client);
    await until(() => !!job(jobId)?.steps.some((s) => s.title === 'Agent writes code'));
    expect(job(jobId)!.status).toBe('running');
    const final = await finished(jobId);
    const titles = final.steps.map((s) => s.title);
    expect(titles).toContain('Modal Sandbox test');
    expect(titles).not.toContain('From an earlier run');
    expect(titles.filter((t) => t === 'Agent writes code')).toHaveLength(1);
  });

  it('hides the service bookkeeping from people watching', async () => {
    setPrompt('a cube');
    await settle();
    const sandbox = fakeSandbox();
    const generate_ = sandbox.client.generate;
    sandbox.client.generate = async (payload, signal) => {
      const result = await generate_(payload, signal);
      result.run.steps.push({ key: 'prompt', title: 'Prompt + context', status: 'pass' }, { key: 'registry', title: 'Registry', status: 'pass' }, { key: 'display', title: 'Final display', status: 'pass' });
      return result;
    };
    const final = await finished(generate([fakeProvider().provider], sandbox.client).jobId);
    const titles = final.steps.map((s) => s.title);
    expect(titles).toContain('Modal Sandbox test');
    expect(titles).not.toContain('Prompt + context');
    expect(titles).not.toContain('Final display');
  });

  it('marks a result that failed review as a draft, and says so', async () => {
    setPrompt('impossible shape');
    await settle();
    await finished(generate([fakeProvider().provider], fakeSandbox({ status: 'draft' }).client).jobId);
    expect(versions()[0].status).toBe('draft');
    expect(docParts(doc).threads.get(blockId)!.get(0).text).toMatch(/did not pass review/);
  });

  it('keeps a result that has no preview image', async () => {
    setPrompt('a sphere');
    await settle();
    await finished(generate([fakeProvider().provider], fakeSandbox({ preview: false }).client).jobId);
    expect(versions()[0].previewAsset).toBeNull();
  });

  it('keeps earlier versions when generating again', async () => {
    setPrompt('a cone');
    await settle();
    await finished(generate([fakeProvider().provider], fakeSandbox().client).jobId);
    setPrompt('a torus');
    await settle();
    await finished(generate([fakeProvider().provider], fakeSandbox().client).jobId);
    expect(versions()).toHaveLength(2);
    expect(content().get('currentVersionId')).toBe(versions()[1].id);
  });

  it('asks for a prompt when there is nothing to generate from', async () => {
    const final = await finished(generate([fakeProvider().provider], fakeSandbox().client).jobId);
    expect(final.status).toBe('failed');
    expect(final.error).toMatch(/Write a prompt/);
    expect(versions()).toHaveLength(0);
  });

  it('explains when the service is down, without leaking details', async () => {
    setPrompt('a cube');
    await settle();
    const down = fakeSandbox().client;
    down.listRuns = async () => {
      throw new SandboxUnavailable('connect ECONNREFUSED 127.0.0.1:8000');
    };
    const final = await finished(generate([fakeProvider().provider], down).jobId);
    expect(final.status).toBe('failed');
    expect(final.error).toMatch(/not available/);
    expect(final.error).not.toContain('ECONNREFUSED');
  });

  it('reports a failed generation', async () => {
    setPrompt('a cube');
    await settle();
    const final = await finished(generate([fakeProvider().provider], fakeSandbox({ failWith: new Error('boom 500') }).client).jobId);
    expect(final.status).toBe('failed');
    expect(final.error).toMatch(/generation failed/);
    expect(final.error).not.toContain('boom');
  });

  it('runs one generation at a time across the server', async () => {
    setPrompt('a cube');
    const other = applyAction(doc, { type: 'block.add', blockType: 'model3d' }, person).id!;
    await settle();
    const { jobId } = generate([fakeProvider().provider], fakeSandbox({ delayMs: 200 }).client);
    expect(() =>
      app.get(JobsService).start({ projectId, blockId: other, kind: 'generate-3d', startedBy: person }, async () => {}),
    ).toThrow(/Another 3D model/);
    // Other kinds of job aren't held up.
    const chat = app.get(JobsService).start({ projectId, blockId: other, kind: 'chat', startedBy: person }, async () => {});
    await finished(chat.jobId);
    await finished(jobId);
    const again = app.get(JobsService).start({ projectId, blockId: other, kind: 'generate-3d', startedBy: person }, async () => {});
    await finished(again.jobId);
  });

  it('has its own hourly limit', () => {
    process.env.GEN3D_MAX_RUNS_PER_HOUR = '0';
    expect(() => generate([], fakeSandbox().client)).toThrow(/3D limit/);
  });

  it('can be cancelled, and frees the slot for the next run', async () => {
    setPrompt('a cube');
    await settle();
    const hanging = fakeSandbox().client;
    hanging.generate = (_payload, signal) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const { jobId } = generate([fakeProvider().provider], hanging);
    await until(() => !!job(jobId)?.steps.some((s) => s.title === 'Brief'));
    expect(app.get(JobsService).cancel(jobId)).toBe(true);
    expect((await finished(jobId)).status).toBe('cancelled');
    expect(versions()).toHaveLength(0);
    await finished(generate([fakeProvider().provider], fakeSandbox().client).jobId);
    expect(versions()).toHaveLength(1);
  });

  it('starts over HTTP, and reports a stopped service through the job', async () => {
    process.env.SANDBOX_URL = 'http://127.0.0.1:9';
    setPrompt('a cube');
    await settle();
    const route = `/projects/${projectId}/blocks/${blockId}/generate`;
    await http().post(route).send({}).expect(400);
    const { jobId } = (await http().post(route).send({ person: { id: 'p', name: 'P' } }).expect(202)).body as { jobId: string };
    const final = await finished(jobId);
    delete process.env.SANDBOX_URL;
    expect(final.status).toBe('failed');
    expect(final.error).toMatch(/not available/);
  });

  it('talks to the real service over HTTP', async () => {
    // A tiny stand-in for the service, so the HTTP client itself is exercised.
    const { createServer } = await import('node:http');
    const service = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/runs') return res.end(JSON.stringify([]));
      if (req.url === '/generate') return res.end(JSON.stringify({ run: { id: 'r', prompt: 'p', status: 'approved', steps: [] }, entry: { id: 'e', version: 1, status: 'approved', preview: null }, attempts: 1, review: '' }));
      if (req.url === '/registry/e/code') return res.end(CODE);
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((r) => service.listen(0, '127.0.0.1', r));
    const { port } = service.address() as AddressInfo;
    const sandbox = httpSandboxClient(`http://127.0.0.1:${port}`);
    const { signal } = new AbortController();
    expect(await sandbox.listRuns(signal)).toEqual([]);
    expect((await sandbox.generate({ prompt: 'p', viewport: { width: 1, height: 1 }, scene: [], perfTier: 'high' }, signal)).entry.id).toBe('e');
    expect(await sandbox.code('e', signal)).toBe(CODE);
    expect(await sandbox.preview('missing', signal)).toBeNull();
    service.close();
    await expect(httpSandboxClient('http://127.0.0.1:9').listRuns(signal)).rejects.toBeInstanceOf(SandboxUnavailable);
  });
});
