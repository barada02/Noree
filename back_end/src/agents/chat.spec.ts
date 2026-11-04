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
import { docParts, type ActorRef, type Message } from '../shared/schema.js';
import { CHAT_AGENT, runChatJob } from './chat.js';
import { MAX_IMAGES, MAX_SOURCE_CHARS } from './context.js';
import type { Msg, Provider } from './slate/providers/types.js';

const person: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };
const pngWith = (marker: number) => Buffer.concat([Buffer.from('89504e470d0a1a0a00000000', 'hex'), Buffer.from([marker])]);

async function until(condition: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

type Call = { system: string; msgs: Msg[]; toolCount: number };

/** Records what it was asked. Vision transcription calls are told apart by their system prompt. */
function fakeProvider(id: 'meta' | 'baseten' = 'meta', fail = false) {
  const calls: Call[] = [];
  const provider = {
    id,
    model: 'fake',
    label: 'Fake',
    step: async (system: string, msgs: Msg[], tools: unknown[]) => {
      calls.push({ system, msgs, toolCount: tools.length });
      if (fail) throw new Error('down');
      return { text: system.startsWith('You transcribe') ? 'handwritten: z = 3 + 4i' : 'The answer.', ms: 5, toolCalls: [] };
    },
  } as unknown as Provider;
  return { provider, calls, chats: () => calls.filter((c) => !c.system.startsWith('You transcribe')), transcriptions: () => calls.filter((c) => c.system.startsWith('You transcribe')) };
}

describe('block chat', () => {
  let dataDir: string;
  let app: INestApplication;
  let client: HocuspocusProvider;
  let doc: Y.Doc;
  let projectId: string;

  const http = () => request(app.getHttpServer() as HttpServer);
  const add = (blockType: 'text' | 'slate' | 'frame' | 'sticky', title?: string) => applyAction(doc, { type: 'block.add', blockType, title }, person).id!;
  const connect = (source: string, target: string) => applyAction(doc, { type: 'edge.add', source, target }, person);
  const setText = (id: string, text: string) => (docParts(doc).content.get(id)!.get('text') as Y.Text).insert(0, text);
  const job = (id: string) => docParts(doc).jobs.get(id)?.toJSON() as { status: string; error?: string } | undefined;
  const thread = (id: string): Message[] => docParts(doc).threads.get(id)?.toArray() ?? [];
  const lastPrompt = (fake: ReturnType<typeof fakeProvider>) => {
    const last = fake.chats().at(-1)!.msgs.at(-1)!;
    return last.role === 'user' ? last.text : '';
  };
  const setSnapshot = (slate: string, marker: number) => {
    const url = app.get(AssetsService).save(projectId, pngWith(marker), 'png');
    const page = (docParts(doc).content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0);
    page.set('snapshotAsset', url);
    return url;
  };
  const settle = () => new Promise((r) => setTimeout(r, 100));

  async function ask(blockId: string, chain: Provider[], question = 'What is on the board?') {
    const assets = app.get(AssetsService);
    const { jobId } = app.get(JobsService).start({ projectId, blockId, kind: 'chat', startedBy: person }, (context) =>
      runChatJob(context, { blockId, question, person, readAsset: (url) => assets.readAsDataUrl(projectId, url) }, chain),
    );
    await until(() => !!job(jobId) && job(jobId)!.status !== 'running');
    await settle();
    return job(jobId)!;
  }

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'noree-chat-'));
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
  });

  afterEach(async () => {
    client.destroy();
    await app.close();
    delete process.env.DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('answers using the block and what connects to it, and sends no tools', async () => {
    const notes = add('text', 'Notes');
    const facts = add('sticky', 'Facts');
    const other = add('sticky', 'Unconnected');
    setText(notes, 'my own notes');
    setText(facts, 'the sky is blue');
    setText(other, 'secret unrelated');
    connect(facts, notes);
    await settle();

    const fake = fakeProvider();
    expect((await ask(notes, [fake.provider])).status).toBe('done');
    const prompt = lastPrompt(fake);
    expect(prompt).toContain('my own notes');
    expect(prompt).toContain('Connected block "Facts"');
    expect(prompt).toContain('the sky is blue');
    expect(prompt).not.toContain('secret unrelated');
    expect(fake.chats()[0].toolCount).toBe(0);
  });

  it('reads one step only, and only in the direction of the line', async () => {
    const a = add('text', 'A');
    const b = add('text', 'B');
    const c = add('text', 'C');
    setText(a, 'content of a');
    setText(b, 'content of b');
    connect(a, b);
    connect(b, c);
    await settle();

    const fromC = fakeProvider();
    await ask(c, [fromC.provider]);
    expect(lastPrompt(fromC)).toContain('content of b');
    expect(lastPrompt(fromC)).not.toContain('content of a');

    const fromA = fakeProvider();
    await ask(a, [fromA.provider]);
    expect(lastPrompt(fromA)).not.toContain('content of b');
  });

  it('records both sides of the conversation, and sends earlier turns next time', async () => {
    const id = add('text');
    await settle();
    const fake = fakeProvider();
    await ask(id, [fake.provider], 'First question?');
    expect(thread(id).map((m) => [m.role, m.text])).toEqual([
      ['user', 'First question?'],
      ['assistant', 'The answer.'],
    ]);
    expect(thread(id)[0].author).toEqual(person);
    expect(thread(id)[1].author).toEqual(CHAT_AGENT);

    await ask(id, [fake.provider], 'Second question?');
    const history = fake.chats().at(-1)!.msgs.map((m) => (m.role === 'tool' ? '' : m.text));
    expect(history).toContain('First question?');
    expect(history).toContain('The answer.');
  });

  it('transcribes a Slate once, and again only when its picture changes', async () => {
    const slate = add('slate', 'Math');
    const notes = add('text', 'Notes');
    connect(slate, notes);
    setSnapshot(slate, 1);
    await settle();

    const fake = fakeProvider();
    await ask(notes, [fake.provider]);
    expect(lastPrompt(fake)).toContain('handwritten: z = 3 + 4i');
    expect(fake.transcriptions()).toHaveLength(1);

    await ask(notes, [fake.provider]);
    expect(fake.transcriptions()).toHaveLength(1);

    setSnapshot(slate, 2);
    await settle();
    await ask(notes, [fake.provider]);
    expect(fake.transcriptions()).toHaveLength(2);
  });

  it('says so when a Slate cannot be read, and still answers', async () => {
    const slate = add('slate', 'Math');
    const notes = add('text', 'Notes');
    connect(slate, notes);
    setSnapshot(slate, 3);
    await settle();
    const provider = {
      id: 'meta',
      model: 'fake',
      label: 'Fake',
      step: async (system: string) => {
        if (system.startsWith('You transcribe')) throw new Error('vision down');
        return { text: 'Still answered.', ms: 1, toolCalls: [] };
      },
    } as unknown as Provider;
    expect((await ask(notes, [provider])).status).toBe('done');
    expect(thread(notes).at(-1)!.text).toBe('Still answered.');
    const page = (docParts(doc).content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0);
    expect(page.get('transcript')).toBeNull();
  });

  it('limits text per source and images overall', async () => {
    const notes = add('text', 'Notes');
    const long = add('text', 'Long');
    setText(long, 'x'.repeat(MAX_SOURCE_CHARS + 500));
    connect(long, notes);
    for (let i = 0; i < MAX_IMAGES + 2; i++) {
      const slate = add('slate', `Slate ${i}`);
      connect(slate, notes);
      setSnapshot(slate, 10 + i);
    }
    await settle();
    const fake = fakeProvider();
    await ask(notes, [fake.provider]);
    const sent = fake.chats().at(-1)!.msgs;
    expect(sent.filter((m) => m.role === 'user' && m.image)).toHaveLength(MAX_IMAGES);
    expect(lastPrompt(fake)).toContain('[cut off here]');
    expect(lastPrompt(fake)).not.toContain('x'.repeat(MAX_SOURCE_CHARS + 1));
  });

  it('falls back to the next provider, then fails with a clear message', async () => {
    const id = add('text');
    await settle();
    const down = fakeProvider('meta', true);
    const up = fakeProvider('baseten');
    expect((await ask(id, [down.provider, up.provider])).status).toBe('done');
    expect(thread(id).at(-1)).toMatchObject({ text: 'The answer.', meta: { provider: 'baseten' } });

    const failed = await ask(id, [fakeProvider('meta', true).provider]);
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/could not answer/);
    // The underlying error isn't shown to people.
    expect(failed.error).not.toContain('down');

    const none = await ask(id, []);
    expect(none.status).toBe('failed');
    expect(none.error).toMatch(/No model provider/);
  });

  it('refuses frames and validates the request', async () => {
    const frame = add('frame');
    const text = add('text');
    await settle();
    expect((await ask(frame, [fakeProvider().provider])).error).toMatch(/Frames/);
    const route = `/projects/${projectId}/blocks/${text}/chat`;
    await http().post(route).send({ text: '', person: { id: 'p', name: 'P' } }).expect(400);
    await http().post(route).send({ text: 'hi' }).expect(400);
    await http().post(route).send({ text: 'x'.repeat(4001), person: { id: 'p', name: 'P' } }).expect(400);
    await http().post(`/projects/${'a'.repeat(48)}/blocks/${text}/chat`).send({ text: 'hi', person: { id: 'p', name: 'P' } }).expect(404);
    await http().post(route).send({ text: 'hi', person: { id: 'p', name: 'P' } }).expect(202);
  });
});
