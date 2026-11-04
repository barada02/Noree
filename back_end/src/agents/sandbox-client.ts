import { Agent, fetch } from 'undici';

/** Runs can take many minutes. Node's default fetch would give up after 5 waiting for headers. */
const longRequests = new Agent({ headersTimeout: 30 * 60_000, bodyTimeout: 30 * 60_000 });

export type SandboxStep = { key?: string; title: string; status: string; note?: string };
export type SandboxRun = { id: string; prompt: string; status: string; steps: SandboxStep[] };
export type SandboxResult = {
  run: SandboxRun;
  entry: { id: string; version: number; status: 'approved' | 'draft'; preview: string | null };
  attempts: number;
  review: string;
};
export type GeneratePayload = {
  prompt: string;
  viewport: { width: number; height: number };
  scene: string[];
  perfTier: 'high' | 'low';
};

/** The 3D service, which runs unchanged and is only reachable from this server. */
export interface SandboxClient {
  listRuns(signal: AbortSignal): Promise<SandboxRun[]>;
  generate(payload: GeneratePayload, signal: AbortSignal): Promise<SandboxResult>;
  code(entryId: string, signal: AbortSignal): Promise<string>;
  preview(entryId: string, signal: AbortSignal): Promise<Buffer | null>;
}

export class SandboxUnavailable extends Error {}

export function httpSandboxClient(baseUrl = process.env.SANDBOX_URL ?? 'http://127.0.0.1:8000'): SandboxClient {
  const request = async (path: string, signal: AbortSignal, init?: { method: string; body: string }) => {
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: init ? { 'content-type': 'application/json' } : undefined,
        signal,
        dispatcher: longRequests,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new SandboxUnavailable(String(error));
    }
  };
  const json = async <T>(path: string, signal: AbortSignal, init?: { method: string; body: string }): Promise<T> => {
    const res = await request(path, signal, init);
    if (!res.ok) throw new Error(`3D service ${path} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  };

  return {
    listRuns: (signal) => json<SandboxRun[]>('/runs', signal),
    generate: (payload, signal) => json<SandboxResult>('/generate', signal, { method: 'POST', body: JSON.stringify(payload) }),
    code: async (entryId, signal) => {
      const res = await request(`/registry/${entryId}/code`, signal);
      if (!res.ok) throw new Error(`3D service could not return code for ${entryId}: ${res.status}`);
      return res.text();
    },
    preview: async (entryId, signal) => {
      const res = await request(`/registry/${entryId}/preview`, signal);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
  };
}
