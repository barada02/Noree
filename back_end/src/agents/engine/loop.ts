import type { ProviderId } from '../../shared/protocol.js';
import type { Msg, Provider, ToolCall, ToolSpec } from '../slate/providers/types.js';

/** What a tool reports back. `events` lets an agent surface extra things, such as objects it drew. */
export type ToolRun<E> = {
  ok: boolean;
  result: string;
  /** Ends the loop after this step's tool calls. */
  done?: boolean;
  events?: E[];
};

export type LoopStopReason = 'finished' | 'replied' | 'max_steps' | 'failed' | 'aborted';

export type LoopEvent =
  | { type: 'step'; step: number; provider: ProviderId; model: string; ms: number; inTokens?: number; outTokens?: number }
  | { type: 'thinking'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool'; name: string; args: unknown; ok: boolean; result: string }
  | { type: 'fallback'; from: ProviderId; to: ProviderId; reason: string }
  | { type: 'error'; message: string }
  /** Always the last event. */
  | { type: 'stopped'; reason: LoopStopReason; steps: number; text: string };

export type LoopOptions<E> = {
  system: string;
  messages: Msg[];
  tools: ToolSpec[];
  chain: Provider[];
  maxSteps: number;
  signal?: AbortSignal;
  /** Runs one tool. May be slow, such as a subagent. Any error it throws becomes a tool error the model can read. */
  execute: (call: ToolCall) => ToolRun<E> | Promise<ToolRun<E>>;
  /** When the model replies with no tool calls, text returned here is sent back to keep it going. */
  nudge?: (reply: string) => string | null;
};

function parseForDisplay(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * The engine every agent runs on: call the model, run its tools, feed results back, and stop.
 * It knows nothing about any one agent. Prompts, tools and meaning live in each agent's definition.
 */
export async function* runToolLoop<E>(options: LoopOptions<E>): AsyncGenerator<LoopEvent | E> {
  const { system, tools, chain, maxSteps, signal, execute, nudge } = options;
  const messages = [...options.messages];
  let steps = 0;
  let lastText = '';
  const stopped = (reason: LoopStopReason): LoopEvent => ({ type: 'stopped', reason, steps, text: lastText });

  if (!chain.length) {
    yield { type: 'error', message: 'No model provider is configured on this server.' };
    yield stopped('failed');
    return;
  }

  let providerIndex = 0;
  for (let step = 1; step <= maxSteps; step++) {
    if (signal?.aborted) {
      yield stopped('aborted');
      return;
    }

    let response;
    for (;;) {
      const provider = chain[providerIndex];
      try {
        response = await provider.step(system, messages, tools, signal);
        break;
      } catch (error) {
        if (signal?.aborted) {
          yield stopped('aborted');
          return;
        }
        const reason = (error as Error).message;
        const next = chain[providerIndex + 1];
        if (!next) {
          yield { type: 'error', message: `${provider.label} failed: ${reason}` };
          yield stopped('failed');
          return;
        }
        yield { type: 'fallback', from: provider.id, to: next.id, reason };
        providerIndex += 1;
      }
    }

    steps = step;
    const provider = chain[providerIndex];
    yield { type: 'step', step, provider: provider.id, model: provider.model, ms: response.ms, inTokens: response.inTokens, outTokens: response.outTokens };
    if (response.reasoning) yield { type: 'thinking', text: response.reasoning.slice(0, 700) };
    if (response.text) {
      lastText = response.text;
      yield { type: 'thought', text: response.text };
    }
    messages.push({ role: 'assistant', text: response.text, toolCalls: response.toolCalls });

    if (!response.toolCalls.length) {
      const push = nudge?.(response.text);
      if (push) {
        messages.push({ role: 'user', text: push });
        continue;
      }
      yield stopped('replied');
      return;
    }

    let finished = false;
    for (const call of response.toolCalls) {
      let run: ToolRun<E>;
      try {
        run = await execute(call);
      } catch (error) {
        if (signal?.aborted) {
          yield stopped('aborted');
          return;
        }
        console.error(`Tool ${call.name} threw:`, error);
        run = { ok: false, result: `The tool failed unexpectedly: ${(error as Error).message}` };
      }
      yield { type: 'tool', name: call.name, args: parseForDisplay(call.rawArgs), ok: run.ok, result: run.result };
      for (const event of run.events ?? []) yield event;
      // Every call needs a result, or the provider rejects the next request.
      messages.push({ role: 'tool', callId: call.id, name: call.name, result: run.ok ? run.result : `ERROR: ${run.result}` });
      if (run.done) finished = true;
    }
    if (finished) {
      yield stopped('finished');
      return;
    }
  }
  yield stopped('max_steps');
}
