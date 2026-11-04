import type { ProviderId } from '../../../shared/protocol.js'

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  rawArgs: string
}

/** Provider-neutral conversation. Each adapter translates this to its own wire format. */
export type Msg =
  | { role: 'user'; text: string; image?: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; callId: string; name: string; result: string }

export interface StepResult {
  text: string
  reasoning?: string
  toolCalls: ToolCall[]
  inTokens?: number
  outTokens?: number
  ms: number
}

export interface Provider {
  id: ProviderId
  model: string
  label: string
  step(system: string, msgs: Msg[], tools: ToolSpec[], signal?: AbortSignal): Promise<StepResult>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function postJson(url: string, key: string, body: unknown, signal?: AbortSignal): Promise<any> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      const text = await res.text()
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
        if (res.status === 429 || res.status >= 500) {
          lastErr = err
          await sleep(800)
          continue
        }
        throw err
      }
      return JSON.parse(text)
    } catch (e) {
      if (signal?.aborted) throw e
      lastErr = e
      if (attempt === 0 && e instanceof TypeError) {
        await sleep(500) // network blip, retry once
        continue
      }
      throw e
    }
  }
  throw lastErr
}
