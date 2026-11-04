import type { Msg, Provider, StepResult, ToolCall } from '../slate/providers/types.js';
import { runToolLoop, type LoopEvent, type LoopOptions, type ToolRun } from './loop.js';

type Reply = Partial<StepResult> | Error;

/** Plays back fixed replies, and records every conversation it was sent. */
function scripted(replies: Reply[], id: 'meta' | 'baseten' = 'meta') {
  const seen: Msg[][] = [];
  let index = 0;
  const provider = {
    id,
    model: 'fake',
    label: `Fake ${id}`,
    step: async (_system: string, messages: Msg[]) => {
      seen.push([...messages]);
      const reply = replies[index++] ?? { text: '' };
      if (reply instanceof Error) throw reply;
      return { text: '', ms: 1, toolCalls: [], ...reply };
    },
  } as unknown as Provider;
  return { provider, seen };
}

const call = (name: string, args: unknown = {}, id = name): ToolCall => ({ id, name, rawArgs: typeof args === 'string' ? args : JSON.stringify(args) });

type Extra = { type: 'extra'; value: string };

async function collect(options: Partial<LoopOptions<Extra>> & { chain: Provider[] }) {
  const events: (LoopEvent | Extra)[] = [];
  const run = runToolLoop<Extra>({
    system: 'system',
    messages: [{ role: 'user', text: 'go' }],
    tools: [],
    maxSteps: 5,
    execute: () => ({ ok: true, result: 'ok' }),
    ...options,
  });
  for await (const event of run) events.push(event);
  const last = events.at(-1) as Extract<LoopEvent, { type: 'stopped' }>;
  expect(last.type).toBe('stopped');
  return { events, stopped: last, types: events.map((e) => e.type) };
}

describe('runToolLoop', () => {
  it('stops on a plain reply, which is how a simple question gets a one-step answer', async () => {
    const { stopped } = await collect({ chain: [scripted([{ text: 'The answer.' }]).provider] });
    expect(stopped).toMatchObject({ reason: 'replied', steps: 1, text: 'The answer.' });
  });

  it('runs tools, feeds results back, and stops when a tool says it is done', async () => {
    const model = scripted([{ toolCalls: [call('a', { x: 1 })] }, { toolCalls: [call('finish')] }]);
    const ran: string[] = [];
    const { stopped, events } = await collect({
      chain: [model.provider],
      execute: (c) => {
        ran.push(c.name);
        return { ok: true, result: `${c.name} result`, done: c.name === 'finish' };
      },
    });
    expect(ran).toEqual(['a', 'finish']);
    expect(stopped).toMatchObject({ reason: 'finished', steps: 2 });
    expect(model.seen[1].at(-1)).toMatchObject({ role: 'tool', callId: 'a', result: 'a result' });
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ name: 'a', args: { x: 1 }, ok: true });
  });

  it('answers every call when a model makes several at once, even if one finishes', async () => {
    const model = scripted([{ toolCalls: [call('finish'), call('after')] }]);
    const ran: string[] = [];
    const { stopped } = await collect({
      chain: [model.provider],
      execute: (c) => {
        ran.push(c.name);
        return { ok: true, result: 'ok', done: c.name === 'finish' };
      },
    });
    expect(ran).toEqual(['finish', 'after']);
    expect(stopped.reason).toBe('finished');
  });

  it('sends tool failures back so the model can correct itself', async () => {
    const model = scripted([{ toolCalls: [call('a')] }, { text: 'Fixed.' }]);
    await collect({ chain: [model.provider], execute: () => ({ ok: false, result: 'bad id' }) });
    expect(model.seen[1].at(-1)).toMatchObject({ role: 'tool', result: 'ERROR: bad id' });
  });

  it('turns a throwing tool into a tool error, and keeps going', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = scripted([{ toolCalls: [call('a')] }, { text: 'Recovered.' }]);
    const { stopped, events } = await collect({
      chain: [model.provider],
      execute: () => {
        throw new Error('boom');
      },
    });
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ ok: false });
    expect(model.seen[1].at(-1)).toMatchObject({ role: 'tool', result: expect.stringContaining('boom') });
    expect(stopped).toMatchObject({ reason: 'replied', text: 'Recovered.' });
    quiet.mockRestore();
  });

  it('awaits slow tools, which is what makes subagents possible', async () => {
    const model = scripted([{ toolCalls: [call('slow')] }, { text: 'Done.' }]);
    const { events } = await collect({
      chain: [model.provider],
      execute: async (): Promise<ToolRun<Extra>> => {
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true, result: 'slow result' };
      },
    });
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ result: 'slow result' });
  });

  it('passes through extra events from a tool, right after its result', async () => {
    const model = scripted([{ toolCalls: [call('draw')] }, { text: 'Done.' }]);
    const { types } = await collect({
      chain: [model.provider],
      execute: () => ({ ok: true, result: 'ok', events: [{ type: 'extra', value: 'one' }] }),
    });
    expect(types[types.indexOf('tool') + 1]).toBe('extra');
  });

  it('stops at the step limit', async () => {
    const model = scripted(Array.from({ length: 9 }, (_, i) => ({ toolCalls: [call('a', {}, `c${i}`)] })));
    const { stopped } = await collect({ chain: [model.provider], maxSteps: 3 });
    expect(stopped).toMatchObject({ reason: 'max_steps', steps: 3 });
  });

  it('nudges when asked to, and only then', async () => {
    const model = scripted([{ text: 'I will draw.' }, { text: 'Still talking.' }]);
    let nudges = 0;
    const { stopped } = await collect({
      chain: [model.provider],
      nudge: () => (nudges++ === 0 ? 'Use the tools.' : null),
    });
    expect(model.seen[1].at(-1)).toEqual({ role: 'user', text: 'Use the tools.' });
    expect(stopped).toMatchObject({ reason: 'replied', steps: 2 });
  });

  it('falls back to the next provider and stays on it, keeping the conversation', async () => {
    const first = scripted([{ toolCalls: [call('a')] }, new Error('down')], 'meta');
    const second = scripted([{ text: 'From the fallback.' }], 'baseten');
    const { events, stopped } = await collect({ chain: [first.provider, second.provider] });
    expect(events.find((e) => e.type === 'fallback')).toMatchObject({ from: 'meta', to: 'baseten', reason: 'down' });
    expect(second.seen[0].at(-1)).toMatchObject({ role: 'tool', callId: 'a' });
    expect(stopped).toMatchObject({ reason: 'replied', text: 'From the fallback.' });
  });

  it('fails clearly when every provider fails, or none is configured', async () => {
    const failed = await collect({ chain: [scripted([new Error('down')]).provider] });
    expect(failed.events.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('down') });
    expect(failed.stopped.reason).toBe('failed');

    const none = await collect({ chain: [] });
    expect(none.events.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('No model provider') });
    expect(none.stopped.reason).toBe('failed');
  });

  it('stops when aborted, before a step and during one', async () => {
    const before = new AbortController();
    before.abort();
    const first = await collect({ chain: [scripted([{ text: 'x' }]).provider], signal: before.signal });
    expect(first.stopped.reason).toBe('aborted');

    const during = new AbortController();
    const provider = {
      id: 'meta',
      model: 'fake',
      label: 'Fake',
      step: async () => {
        during.abort();
        throw new Error('aborted');
      },
    } as unknown as Provider;
    const second = await collect({ chain: [provider], signal: during.signal });
    expect(second.stopped.reason).toBe('aborted');
    expect(second.types).not.toContain('error');
  });

  it('does not change the conversation it was given', async () => {
    const messages: Msg[] = [{ role: 'user', text: 'go' }];
    await collect({ chain: [scripted([{ toolCalls: [call('a')] }, { text: 'x' }]).provider], messages });
    expect(messages).toHaveLength(1);
  });
});
