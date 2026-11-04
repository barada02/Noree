import { HocuspocusProvider } from '@hocuspocus/provider';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import request from 'supertest';
import * as Y from 'yjs';
import { AppModule } from '../app.module.js';
import { applyAction } from '../shared/actions.js';
import { docParts, readLayout, type ActorRef } from '../shared/schema.js';
import { CollabService } from './collab.service.js';

const person: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };
const agent: ActorRef = { kind: 'agent', id: 'a1', name: 'Agent' };

async function until(condition: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('collaboration server', () => {
  let dataDir: string;
  let app: INestApplication;
  let port: number;
  const providers: HocuspocusProvider[] = [];

  async function startApp() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    app.get(CollabService).attach(app.getHttpServer() as HttpServer);
    await app.listen(0);
    port = ((app.getHttpServer() as HttpServer).address() as AddressInfo).port;
  }

  async function connect(projectId: string) {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}/collab`, name: `project:${projectId}`, document: doc });
    providers.push(provider);
    await until(() => provider.isSynced);
    return { doc, provider };
  }

  async function newProject(title?: string): Promise<string> {
    const res = await request(app.getHttpServer() as HttpServer)
      .post('/projects')
      .send(title ? { title } : {})
      .expect(201);
    return (res.body as { id: string }).id;
  }

  function closeProviders() {
    for (const provider of providers.splice(0)) provider.destroy();
  }

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'noree-collab-'));
    process.env.DATA_DIR = dataDir;
    await startApp();
  });

  afterEach(async () => {
    closeProviders();
    await app.close();
    delete process.env.DATA_DIR;
    delete process.env.PROJECTS_MAX_PER_HOUR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates a project with an initial document, and has no list endpoint', async () => {
    const id = await newProject('Phasors');
    expect(id).toMatch(/^[a-f0-9]{48}$/);
    const http = request(app.getHttpServer() as HttpServer);
    await http.get(`/projects/${id}`).expect(200);
    await http.get('/projects/nope').expect(404);
    await http.get('/projects').expect(404);
    const { doc } = await connect(id);
    expect(docParts(doc).meta.get('title')).toBe('Phasors');
  });

  it('keeps two clients in sync, including concurrent edits', async () => {
    const id = await newProject();
    const a = await connect(id);
    const b = await connect(id);
    const blockId = applyAction(a.doc, { type: 'block.add', blockType: 'text' }, person).id!;
    await until(() => docParts(b.doc).blocks.has(blockId));

    applyAction(a.doc, { type: 'block.move', id: blockId, to: { x: 7, y: 8 } }, person);
    applyAction(b.doc, { type: 'block.update', id: blockId, patch: { title: 'Merged' } }, person);
    const merged = (doc: Y.Doc) => {
      const layout = readLayout(docParts(doc).blocks.get(blockId)!);
      return layout.x === 7 && layout.title === 'Merged';
    };
    await until(() => merged(a.doc) && merged(b.doc));
  });

  it('shows a server-side write to connected clients, which is how agents work', async () => {
    const id = await newProject();
    const { doc } = await connect(id);
    const connection = await app.get(CollabService).open(id);
    let blockId = '';
    await connection.transact((serverDoc) => {
      blockId = applyAction(serverDoc, { type: 'block.add', blockType: 'sticky', title: 'From agent' }, agent).id!;
    });
    await until(() => docParts(doc).blocks.has(blockId));
    expect(readLayout(docParts(doc).blocks.get(blockId)!).createdBy).toEqual(agent);
    await connection.disconnect();
  });

  it('keeps data across a server restart', async () => {
    const id = await newProject();
    const { doc } = await connect(id);
    const blockId = applyAction(doc, { type: 'block.add', blockType: 'text', title: 'Survives' }, person).id!;
    // Long enough to reach the server, and shorter than the save delay, so only the shutdown flush saves it.
    await new Promise((r) => setTimeout(r, 200));
    closeProviders();
    await app.close();

    await startApp();
    const reopened = await connect(id);
    expect(readLayout(docParts(reopened.doc).blocks.get(blockId)!).title).toBe('Survives');
  });

  it('rejects unknown document names without writing anything', async () => {
    const doc = new Y.Doc();
    const known = await newProject();
    let failed = false;
    for (const name of ['project:' + 'a'.repeat(48), 'project:../../etc/passwd', 'anything']) {
      const provider = new HocuspocusProvider({
        url: `ws://127.0.0.1:${port}/collab`,
        name,
        document: doc,
        onAuthenticationFailed: () => {
          failed = true;
        },
      });
      providers.push(provider);
      await new Promise((r) => setTimeout(r, 250));
      expect(provider.isSynced).toBe(false);
      provider.destroy();
    }
    void failed;
    // Only the known project's document may exist.
    await new Promise((r) => setTimeout(r, 100));
    expect(readdirSync(join(dataDir, 'docs')).filter((f) => f !== `${known}.bin`)).toEqual([]);
  });

  it('limits new projects per hour', async () => {
    process.env.PROJECTS_MAX_PER_HOUR = '1';
    await newProject();
    await request(app.getHttpServer() as HttpServer).post('/projects').send({}).expect(429);
  });

  it('leaves the camera socket working beside /collab', async () => {
    const id = await newProject();
    await connect(id);
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    const ack = await socket.emitWithAck('session:create', {});
    expect((ack as { ok: boolean }).ok).toBe(true);
    socket.close();
  });

  it('leaves other WebSocket paths alone', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/not-collab`);
    const outcome = await new Promise<string>((resolve) => {
      socket.onopen = () => resolve('open');
      socket.onerror = () => resolve('refused');
      socket.onclose = () => resolve('refused');
    });
    expect(outcome).toBe('refused');
  });
});
