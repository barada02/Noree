import type { Transcriber } from './context.js';
import type { Msg, Provider, StepResult } from './slate/providers/types.js';

const TRANSCRIBE_SYSTEM = `You transcribe a page from a shared whiteboard into plain text, so other tools can read it.

Write out all handwriting and text exactly as written, using LaTeX in $...$ for math. Briefly describe any drawings or AI annotations. If handwriting is unclear, give your best reading and mark it (unclear). Output only the transcript.`;

/** Tries each provider in order, reporting a switch. Throws if all of them fail. */
export async function callWithFallback(
  chain: Provider[],
  system: string,
  messages: Msg[],
  signal: AbortSignal | undefined,
  onFallback?: (from: Provider, to: Provider, reason: string) => Promise<void>,
): Promise<StepResult & { provider: Provider }> {
  if (!chain.length) throw new Error('No model provider is configured on this server.');
  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    try {
      return { ...(await chain[i].step(system, messages, [], signal)), provider: chain[i] };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (chain[i + 1]) await onFallback?.(chain[i], chain[i + 1], (error as Error).message);
    }
  }
  throw lastError;
}

/** Makes the one vision call that turns a page into text. The caller caches the result on the page. */
export function createTranscriber(chain: Provider[], readAsset: (url: string) => string | null, signal?: AbortSignal): Transcriber {
  return async (assetUrl) => {
    const image = readAsset(assetUrl);
    if (!image) return null;
    try {
      const { text } = await callWithFallback(chain, TRANSCRIBE_SYSTEM, [{ role: 'user', text: 'Transcribe this page.', image }], signal);
      return text || null;
    } catch (error) {
      if (signal?.aborted) throw error;
      console.error('Transcription failed:', error);
      return null;
    }
  };
}
