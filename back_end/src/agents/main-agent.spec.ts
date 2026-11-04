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
import { docParts, readEdge, readLayout, type ActorRef, type Message } from '../shared/schema.js';
import { MAX_IMAGES, MAX_SOURCE_CHARS } from './context.js';
import { applyUndo, boardSummary, BOARD_THREAD, MAIN_AGENT, runMainAgentJob, type UndoStep } from './main-agent.js';
import type { SandboxClient } from './sandbox-client.js';
import type { Msg, Provider, StepResult, ToolCall, ToolSpec } from './slate/providers/types.js';

const person: ActorRef = { kind: 'person', id: 'p1', name: 'Test' };
const pngWith = (marker: number) => Buffer.concat([Buffer.from('89504e470d0a1a0a00000000', 'hex'), Buffer.from([marker])]);

async function until(condition: () => boolean, ms = 6000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 15));
  }
}

type Turn = { text?: string; calls?: [string, unknown][] } | ((msgs: Msg[]) => { text?: string; calls?: [string, unknown][] }) | Error;

/** Plays a script, one model step per turn. Transcription calls answer on their own, and aren't in the script. */
function scripted(turns: Turn[], id: 'meta' | 'baseten' = 'meta') {
  let index = 0;
  const calls: { msgs: Msg[]; tools: ToolSpec[] }[] = [];
  const transcriptions: Msg[][] = [];
  const provider = {
    id,
    model: 'fake',
    label: `Fake ${id}`,
    step: async (system: string, msgs: Msg[], tools: ToolSpec[]): Promise<StepResult> => {
      if (system.startsWith('You transcribe')) {
        transcriptions.push(msgs);
        return { text: 'handwritten: z = 3 + 4i', ms: 1, toolCalls: [] };
      }
      calls.push({ msgs: [...msgs], tools });
      const turn = turns[index++] ?? { text: 'Done.' };
      if (turn instanceof Error) throw turn;
      const planned = typeof turn === 'function' ? turn(msgs) : turn;
      return {
        text: planned.text ?? '',
        ms: 1,
        toolCalls: (planned.calls ?? []).map(([name, args], i): ToolCall => ({ id: `${index}-${i}`, name, rawArgs: JSON.stringify(args) })),
      };
    },
  } as unknown as Provider;
  return { provider, calls, transcriptions };
}

const lastUser = (msgs: Msg[]) => {
  const message = [...msgs].reverse().find((m) => m.role === 'user');
  return message?.role === 'user' ? message.text : '';
};
/** The id a tool just reported, from a result like "Added frame [abc]." */
const idFrom = (msgs: Msg[], tool = 'add_frame') => {
  const found = [...msgs].reverse().find((m) => m.role === 'tool' && m.name === tool);
  return found?.role === 'tool' ? /\[([a-f0-9]+)\]/.exec(found.result)?.[1] ?? '' : '';
};

const fakeSandbox = (): SandboxClient => ({
  listRuns: async () => [],
  generate: async (payload) => ({
    run: { id: 'r', prompt: payload.prompt, status: 'approved', steps: [{ title: 'Modal Sandbox test', status: 'pass' }] },
    entry: { id: 'e', version: 1, status: 'approved', preview: null },
    attempts: 1,
    review: 'PASS',
  }),
  code: async () => 'export default function create() {}',
  preview: async () => null,
});

describe('main agent', () => {
  let dataDir: string;
  let app: INestApplication;
  let client: HocuspocusProvider;
  let doc: Y.Doc;
  let projectId: string;

  const http = () => request(app.getHttpServer() as HttpServer);
  const parts = () => docParts(doc);
  const add = (blockType: 'text' | 'slate' | 'frame' | 'sticky' | 'model3d', title?: string) => applyAction(doc, { type: 'block.add', blockType, title }, person).id!;
  const connect = (source: string, target: string) => applyAction(doc, { type: 'edge.add', source, target }, person);
  const setText = (id: string, text: string) => (parts().content.get(id)!.get('text') as Y.Text).insert(0, text);
  const job = (id: string) => parts().jobs.get(id)?.toJSON() as { status: string; error?: string; undo?: UndoStep[]; undone?: boolean; steps: { title: string; status: string }[] } | undefined;
  const thread = (id: string): Message[] => parts().threads.get(id)?.toArray() ?? [];
  const settle = () => new Promise((r) => setTimeout(r, 120));
  const titles = () => [...parts().blocks.values()].map(readLayout).map((b) => b.title);
  const snapshot = (slate: string, marker: number) => {
    const url = app.get(AssetsService).save(projectId, pngWith(marker), 'png');
    (parts().content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0).set('snapshotAsset', url);
    return url;
  };

  function start(chain: Provider[], options: { question?: string; focusBlockId?: string; sandbox?: SandboxClient; subagentChain?: Provider[] } = {}) {
    const assets = app.get(AssetsService);
    const jobs = app.get(JobsService);
    return jobs.startTracked({ projectId, blockId: BOARD_THREAD, kind: 'main', startedBy: person, threadId: options.focusBlockId ?? BOARD_THREAD }, (context) =>
      runMainAgentJob(context, { question: options.question ?? 'Please help.', person, focusBlockId: options.focusBlockId }, chain, {
        projectId,
        jobs,
        chainFor: () => options.subagentChain ?? chain,
        sandbox: () => options.sandbox ?? fakeSandbox(),
        readAsset: (url) => assets.readAsDataUrl(projectId, url),
        saveImage: (data) => assets.saveImage(projectId, data),
        saveCode: (code) => assets.saveCode(projectId, code),
      }),
    );
  }
  const ask = async (chain: Provider[], options: Parameters<typeof start>[1] = {}) => {
    const { jobId, finished } = start(chain, options);
    const outcome = await finished;
    await settle();
    return { jobId, outcome };
  };

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'noree-main-'));
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

  describe('answering', () => {
    it('answers in one step with no changes, and gets the board summary up front', async () => {
      const note = add('text', 'Budget');
      setText(note, 'We have 5000 dollars.');
      await settle();
      const model = scripted([{ text: 'You have $5000.' }]);
      const { outcome } = await ask([model.provider], { question: 'How much budget?' });
      expect(outcome).toMatchObject({ status: 'done', result: 'You have $5000.' });
      expect(model.calls).toHaveLength(1);
      expect(lastUser(model.calls[0].msgs)).toContain('We have 5000 dollars.');
      expect(lastUser(model.calls[0].msgs)).toContain(note);
      expect(thread(BOARD_THREAD).map((m) => [m.role, m.text])).toEqual([
        ['user', 'How much budget?'],
        ['assistant', 'You have $5000.'],
      ]);
      expect(thread(BOARD_THREAD)[1].author).toEqual(MAIN_AGENT);
    });

    it('offers board tools and specialists', async () => {
      const model = scripted([{ text: 'Hi.' }]);
      await ask([model.provider]);
      const names = model.calls[0].tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['read_board', 'add_frame', 'add_block', 'connect', 'run_slate_agent', 'generate_3d_model']));
      expect(names).not.toContain('delete_block');
      expect(model.calls[0].tools.find((t) => t.name === 'add_block')!.parameters).toMatchObject({ type: 'object', required: expect.arrayContaining(['type', 'title']) });
    });

    it('uses the selected block and what connects to it, one step only', async () => {
      const a = add('text', 'A');
      const b = add('text', 'B');
      const c = add('text', 'C');
      setText(a, 'content of a');
      setText(b, 'content of b');
      connect(a, b);
      connect(b, c);
      await settle();
      const model = scripted([{ text: 'Sure.' }]);
      await ask([model.provider], { focusBlockId: c });
      const prompt = lastUser(model.calls[0].msgs);
      expect(prompt).toContain('selected the text block "C"');
      expect(prompt).toContain('Connected to it, "B"');
      expect(prompt).toContain('content of b');
      // A appears only in the short board summary line, not as connected content.
      expect(prompt).not.toContain('Connected to it, "A"');
    });

    it('keeps a separate conversation per block, and sends earlier turns', async () => {
      const a = add('text', 'A');
      await settle();
      const model = scripted([{ text: 'First answer.' }, { text: 'Second answer.' }, { text: 'Board answer.' }]);
      await ask([model.provider], { focusBlockId: a, question: 'First?' });
      await ask([model.provider], { focusBlockId: a, question: 'Second?' });
      expect(model.calls[1].msgs.map((m) => (m.role === 'tool' ? '' : m.text))).toEqual(expect.arrayContaining(['First?', 'First answer.']));
      expect(thread(a)).toHaveLength(4);

      await ask([model.provider], { question: 'Board?' });
      expect(thread(a)).toHaveLength(4);
      expect(thread(BOARD_THREAD)).toHaveLength(2);
      expect(model.calls[2].msgs.map((m) => (m.role === 'tool' ? '' : m.text))).not.toContain('First answer.');
    });

    it('transcribes a selected Slate once, and again only when its picture changes', async () => {
      const slate = add('slate', 'Math');
      snapshot(slate, 1);
      await settle();
      const model = scripted([]);
      await ask([model.provider], { focusBlockId: slate });
      expect(lastUser(model.calls[0].msgs)).toContain('handwritten: z = 3 + 4i');
      expect(model.transcriptions).toHaveLength(1);
      await ask([model.provider], { focusBlockId: slate });
      expect(model.transcriptions).toHaveLength(1);
      snapshot(slate, 2);
      await settle();
      await ask([model.provider], { focusBlockId: slate });
      expect(model.transcriptions).toHaveLength(2);
    });

    it('limits text per source and images overall', async () => {
      const notes = add('text', 'Notes');
      const long = add('text', 'Long');
      setText(long, 'x'.repeat(MAX_SOURCE_CHARS + 500));
      connect(long, notes);
      for (let i = 0; i < MAX_IMAGES + 2; i++) {
        const slate = add('slate', `Slate ${i}`);
        connect(slate, notes);
        snapshot(slate, 10 + i);
      }
      await settle();
      const model = scripted([{ text: 'ok' }]);
      await ask([model.provider], { focusBlockId: notes });
      const sent = model.calls[0].msgs;
      expect(sent.filter((m) => m.role === 'user' && m.image)).toHaveLength(MAX_IMAGES);
      expect(lastUser(sent)).toContain('[cut off here]');
    });
  });

  describe('changing the board', () => {
    it('builds frames, blocks and connections from tool calls, for everyone, and they persist', async () => {
      const model = scripted([
        { calls: [['add_frame', { title: 'Plan' }]] },
        (msgs) => {
          const frame = idFrom(msgs);
          return {
            calls: [
              ['add_block', { type: 'text', title: 'Notes', text: 'Ship in March', frame_id: frame }],
              ['add_block', { type: 'model3d', title: 'Model', prompt: 'a rocket', frame_id: frame }],
            ],
          };
        },
        (msgs) => {
          const results = msgs.filter((m) => m.role === 'tool' && m.name === 'add_block');
          const ids = results.map((m) => (m.role === 'tool' ? /\[([a-f0-9]+)\]/.exec(m.result)?.[1] : ''));
          return { calls: [['connect', { source_id: ids[0], target_id: ids[1] }]] };
        },
        { text: 'I set up your plan.' },
      ]);
      const { outcome } = await ask([model.provider], { question: 'Plan it.' });
      expect(outcome).toMatchObject({ status: 'done', result: 'I set up your plan.' });

      const layouts = [...parts().blocks.values()].map(readLayout);
      const frame = layouts.find((b) => b.type === 'frame')!;
      const note = layouts.find((b) => b.title === 'Notes')!;
      const model3d = layouts.find((b) => b.title === 'Model')!;
      expect(note.parentId).toBe(frame.id);
      expect(note.createdBy).toEqual(MAIN_AGENT);
      expect(String(parts().content.get(note.id)!.get('text'))).toBe('Ship in March');
      expect(parts().content.get(model3d.id)!.get('prompt')).toBe('a rocket');
      expect([...parts().edges.values()].map(readEdge)).toMatchObject([{ source: note.id, target: model3d.id }]);

      // A brand-new reader, after the document was saved, gets the same board.
      client.destroy();
      await settle();
      const markdown = await http().get(`/projects/${projectId}/export.md`).expect(200);
      expect(markdown.text).toContain('Ship in March');
      expect(markdown.text).toContain('## Plan');
    });

    it('handles several calls in one step, in order', async () => {
      const model = scripted([
        { calls: [['add_block', { type: 'text', title: 'One' }], ['add_block', { type: 'sticky', title: 'Two' }], ['add_block', { type: 'slate', title: 'Three' }]] },
      ]);
      await ask([model.provider]);
      expect(titles()).toEqual(expect.arrayContaining(['One', 'Two', 'Three']));
    });

    it('updates, disconnects and moves existing blocks', async () => {
      const frame = add('frame', 'Frame');
      const a = add('text', 'A');
      const b = add('text', 'B');
      connect(a, b);
      await settle();
      const model = scripted([
        {
          calls: [
            ['update_block', { block_id: a, title: 'Renamed', text: 'New text' }],
            ['disconnect', { source_id: a, target_id: b }],
            ['move_to_frame', { block_id: b, frame_id: frame }],
          ],
        },
      ]);
      await ask([model.provider]);
      expect(readLayout(parts().blocks.get(a)!).title).toBe('Renamed');
      expect(String(parts().content.get(a)!.get('text'))).toBe('New text');
      expect(parts().edges.size).toBe(0);
      expect(readLayout(parts().blocks.get(b)!).parentId).toBe(frame);
    });

    it('returns mistakes to the model as messages it can act on', async () => {
      const a = add('text', 'A');
      await settle();
      const model = scripted([
        {
          calls: [
            ['add_block', { type: 'hologram', title: 'Bad type' }],
            ['add_block', { type: 'text' }],
            ['connect', { source_id: a, target_id: a }],
            ['connect', { source_id: a, target_id: 'missing' }],
            ['add_block', { type: 'text', title: 'X', frame_id: 'missing' }],
            ['update_block', { block_id: 'missing', title: 'Y' }],
            ['update_block', { block_id: a, prompt: 'not a 3D block' }],
            ['no_such_tool', {}],
          ],
        },
        { text: 'I could not do that.' },
      ]);
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { outcome, jobId } = await ask([model.provider]);
      quiet.mockRestore();
      expect(outcome.status).toBe('done');
      expect(job(jobId)!.steps.filter((s) => s.status === 'fail')).toHaveLength(8);
      const results = model.calls[1].msgs.filter((m) => m.role === 'tool').map((m) => (m.role === 'tool' ? m.result : ''));
      expect(results.join(' ')).toMatch(/type:.*title:.*itself.*must exist.*No frame.*No block.*Only 3D.*Unknown tool/s);
      // Nothing about internal failure leaks through these, and no block was added by mistake.
      expect(titles()).toEqual(['A']);
    });

    it('stops adding at the limit for one request', async () => {
      const many = Array.from({ length: 35 }, (_, i): [string, unknown] => ['add_block', { type: 'sticky', title: `S${i}` }]);
      const model = scripted([{ calls: many }, { text: 'That was a lot.' }]);
      await ask([model.provider]);
      expect(parts().blocks.size).toBe(30);
    });

    it('allows one main agent run per project', async () => {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slow = { id: 'meta', model: 'f', label: 'F', step: () => held.then(() => ({ text: 'x', ms: 1, toolCalls: [] })) } as unknown as Provider;
      const { finished } = start([slow]);
      expect(() => start([scripted([]).provider])).toThrow(/already working/);
      release();
      await finished;
      await settle();
    });
  });

  describe('undo', () => {
    it('reverses a whole run, leaving what was there before', async () => {
      const existing = add('text', 'Existing');
      setText(existing, 'original');
      const other = add('sticky', 'Other');
      connect(existing, other);
      await settle();
      const model = scripted([
        { calls: [['add_frame', { title: 'New frame' }]] },
        (msgs) => ({ calls: [['add_block', { type: 'text', title: 'New', frame_id: idFrom(msgs) }]] }),
        { calls: [['update_block', { block_id: existing, title: 'Changed', text: 'changed' }], ['disconnect', { source_id: existing, target_id: other }]] },
        (msgs) => ({ calls: [['move_to_frame', { block_id: other, frame_id: idFrom(msgs) }]] }),
        { text: 'Done.' },
      ]);
      const { jobId } = await ask([model.provider]);
      expect(job(jobId)!.undo!.length).toBeGreaterThan(4);

      const res = await http().post(`/projects/${projectId}/jobs/${jobId}/undo`).send({ person: { id: 'p', name: 'P' } }).expect(200);
      expect(res.body).toEqual({ undone: true });
      await settle();

      expect(titles().sort()).toEqual(['Existing', 'Other']);
      expect(String(parts().content.get(existing)!.get('text'))).toBe('original');
      expect([...parts().edges.values()].map(readEdge)).toMatchObject([{ source: existing, target: other }]);
      expect(readLayout(parts().blocks.get(other)!).parentId).toBeNull();
      expect(job(jobId)!.undone).toBe(true);
      // The agent reads this next time, so it doesn't think its work is still there.
      expect(thread(BOARD_THREAD).at(-1)).toMatchObject({ role: 'user', text: 'I undid those changes.', author: { name: 'P' } });

      // A second press does nothing.
      const again = await http().post(`/projects/${projectId}/jobs/${jobId}/undo`).send({ person: { id: 'p', name: 'P' } }).expect(200);
      expect(again.body).toEqual({ undone: false });
    });

    it('tolerates what people changed since', () => {
      const d = new Y.Doc();
      const id = applyAction(d, { type: 'block.add', blockType: 'text' }, person).id!;
      const steps: UndoStep[] = [
        { type: 'delete-block', id: 'gone' },
        { type: 'delete-edge', id: 'gone' },
        { type: 'add-edge', source: 'gone', target: id },
        { type: 'assign-frame', id: 'gone', frameId: null },
        { type: 'set-title', id: 'gone', title: 'x' },
        { type: 'set-text', id: 'gone', text: 'x' },
        { type: 'set-prompt', id: 'gone', prompt: 'x' },
      ];
      expect(() => applyUndo(d, steps, person)).not.toThrow();
      expect(docParts(d).blocks.has(id)).toBe(true);
    });
  });

  describe('delegating to specialists', () => {
    it('runs the 3D specialist as its own job on its own block, and gets a short result back', async () => {
      const block = add('model3d', 'Rocket');
      await settle();
      const model = scripted([{ calls: [['generate_3d_model', { block_id: block, prompt: 'a red rocket' }]] }, { text: 'Your rocket is ready.' }]);
      const { outcome } = await ask([model.provider], { sandbox: fakeSandbox() });
      expect(outcome).toMatchObject({ status: 'done', result: 'Your rocket is ready.' });

      const toolResult = model.calls[1].msgs.at(-1);
      expect(toolResult).toMatchObject({ role: 'tool', result: expect.stringContaining('passed the sandbox test') });

      const child = [...parts().jobs.values()].map((j) => j.toJSON() as { kind: string; blockId: string; status: string; parentJobId?: string }).find((j) => j.kind === 'generate-3d')!;
      expect(child).toMatchObject({ blockId: block, status: 'done' });
      expect(child.parentJobId).toBeTruthy();
      expect(parts().content.get(block)!.get('prompt')).toBe('a red rocket');
      expect((parts().content.get(block)!.get('versions') as Y.Array<unknown>).length).toBe(1);
    });

    it('runs the Slate specialist with its own tools and its own model', async () => {
      const slate = add('slate', 'Math');
      const page = (parts().content.get(slate)!.get('pages') as Y.Array<Y.Map<unknown>>).get(0);
      (page.get('strokes') as Y.Array<unknown>).push([{ id: 's1', points: [[300, 300], [380, 310], [340, 360]] }]);
      snapshot(slate, 5);
      await settle();
      const specialist = scripted([
        { calls: [['draw_outline', { target_ids: ['g1'] }]] },
        { calls: [['finish', { summary: 'Outlined it.' }]] },
      ]);
      const model = scripted([{ calls: [['run_slate_agent', { block_id: slate, instruction: 'Outline it.' }]] }, { text: 'Done on your Slate.' }]);
      await ask([model.provider], { subagentChain: [specialist.provider] });

      expect(model.calls[1].msgs.at(-1)).toMatchObject({ role: 'tool', result: 'Outlined it.' });
      expect((page.get('objects') as Y.Map<unknown>).has('ellipse_1')).toBe(true);
      // The specialist has its drawing tools, not the main agent's board tools, and the reverse.
      expect(specialist.calls[0].tools.map((t) => t.name)).toContain('draw_outline');
      expect(specialist.calls[0].tools.map((t) => t.name)).not.toContain('add_block');
      expect(model.calls[0].tools.map((t) => t.name)).not.toContain('draw_outline');
    });

    it('speaks for a specialist in its own conversation, and lets it post in another', async () => {
      const block = add('model3d', 'Rocket');
      await settle();
      const inSameThread = scripted([{ calls: [['generate_3d_model', { block_id: block, prompt: 'x' }]] }, { text: 'Ready.' }]);
      await ask([inSameThread.provider], { focusBlockId: block });
      // Exactly the question and the main agent's reply, with no second voice.
      expect(thread(block).map((m) => m.author.name)).toEqual(['Test', MAIN_AGENT.name]);

      const fromBoard = scripted([{ calls: [['generate_3d_model', { block_id: block, prompt: 'y' }]] }, { text: 'Ready again.' }]);
      await ask([fromBoard.provider]);
      expect(thread(block).at(-1)!.author.name).toBe('3D agent');
      expect(thread(BOARD_THREAD).at(-1)!.text).toBe('Ready again.');
    });

    it('tells the model plainly when a specialist can not run, or fails', async () => {
      const slate = add('slate', 'Empty');
      const model3d = add('model3d', 'Model');
      await settle();
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      const broken = fakeSandbox();
      broken.generate = async () => {
        throw new Error('boom');
      };
      const model = scripted([
        {
          calls: [
            ['run_slate_agent', { block_id: slate }],
            ['run_slate_agent', { block_id: model3d }],
            ['generate_3d_model', { block_id: slate }],
            ['generate_3d_model', { block_id: 'missing' }],
            ['generate_3d_model', { block_id: model3d, prompt: 'a cube' }],
          ],
        },
        { text: 'I had trouble with that.' },
      ]);
      const { outcome } = await ask([model.provider], { sandbox: broken });
      quiet.mockRestore();
      expect(outcome.status).toBe('done');
      const results = model.calls[1].msgs.filter((m) => m.role === 'tool').map((m) => (m.role === 'tool' ? m.result : ''));
      expect(results[0]).toMatch(/nothing on its current page/);
      expect(results[1]).toMatch(/not a slate block/);
      expect(results[2]).toMatch(/not a model3d block/);
      expect(results[3]).toMatch(/No block/);
      expect(results[4]).toMatch(/generation failed/);
      expect(results[4]).not.toContain('boom');
    });

    it('stops the specialist when the main agent is stopped', async () => {
      const block = add('model3d', 'Rocket');
      await settle();
      const hanging = fakeSandbox();
      hanging.generate = (_p, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      const model = scripted([{ calls: [['generate_3d_model', { block_id: block, prompt: 'x' }]] }]);
      const { jobId, finished } = start([model.provider], { sandbox: hanging });
      const child = () => [...parts().jobs.values()].map((j) => j.toJSON() as { kind: string; status: string }).find((j) => j.kind === 'generate-3d');
      await until(() => child()?.status === 'running');
      await settle();
      app.get(JobsService).cancel(jobId);
      expect(await finished).toMatchObject({ status: 'cancelled' });
      await until(() => child()?.status === 'cancelled');
      // The one-at-a-time slot is free again.
      const next = scripted([{ calls: [['generate_3d_model', { block_id: block }]] }, { text: 'ok' }]);
      await ask([next.provider]);
      expect((parts().content.get(block)!.get('versions') as Y.Array<unknown>).length).toBe(1);
    });
  });

  describe('failure', () => {
    it('falls back to the next provider', async () => {
      const down = scripted([new Error('down')], 'meta');
      const up = scripted([{ text: 'From the fallback.' }], 'baseten');
      const { outcome, jobId } = await ask([down.provider, up.provider]);
      expect(outcome.result).toBe('From the fallback.');
      expect(job(jobId)!.steps.map((s) => s.title).join()).toContain('Switched from meta to baseten');
    });

    it('fails with a clear message, and no internal details', async () => {
      const { outcome } = await ask([scripted([new Error('secret detail')]).provider]);
      expect(outcome).toMatchObject({ status: 'failed' });
      expect(outcome.error).toMatch(/could not respond/);
      expect(outcome.error).not.toContain('secret');
      expect((await ask([])).outcome.error).toMatch(/No model provider/);
    });

    it('says so when the step limit ends a run', async () => {
      const looping = Array.from({ length: 30 }, () => ({ calls: [['read_board', {}]] as [string, unknown][] }));
      const { outcome } = await ask([scripted(looping).provider]);
      expect(outcome.result).toMatch(/step limit/);
    });

    it('refuses a selected block that no longer exists', async () => {
      const { outcome } = await ask([scripted([]).provider], { focusBlockId: 'a'.repeat(24) });
      expect(outcome.error).toMatch(/no longer exists/);
    });
  });

  it('validates the HTTP request', async () => {
    const route = `/projects/${projectId}/agent`;
    const asker = { id: 'p', name: 'P' };
    await http().post(route).send({ text: '', person: asker }).expect(400);
    await http().post(route).send({ text: 'hi' }).expect(400);
    await http().post(route).send({ text: 'x'.repeat(4001), person: asker }).expect(400);
    await http().post(`/projects/${'a'.repeat(48)}/agent`).send({ text: 'hi', person: asker }).expect(404);
    await http().post(`/projects/${projectId}/jobs/x/undo`).send({}).expect(400);
    expect((await http().post(`/projects/${projectId}/jobs/x/undo`).send({ person: asker }).expect(200)).body).toEqual({ undone: false });
  });

  it('summarizes the board with ids and connections', () => {
    const frame = add('frame', 'Stage');
    const inFrame = applyAction(doc, { type: 'block.add', blockType: 'text', title: 'Note', parentId: frame }, person).id!;
    setText(inFrame, 'hello');
    const model = add('model3d', 'Model');
    connect(inFrame, model);
    const summary = boardSummary(doc);
    expect(summary).toContain(`Frame [${frame}] "Stage"`);
    expect(summary).toContain(`[${inFrame}] text "Note": hello`);
    expect(summary).toContain('(not generated)');
    expect(summary).toContain(`[${inFrame}] -> [${model}]`);
    expect(boardSummary(new Y.Doc())).toBe('The board is empty.');
  });
});
