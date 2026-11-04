import { env } from '../env.js'
import { postJson, type Msg, type Provider, type StepResult, type ToolCall, type ToolSpec } from './types.js'

/** Meta Model API (Responses API). Muse Spark 1.x: vision + function calling, tool_choice "auto" only. */
export function metaProvider(): Provider {
  const model = env.metaModel
  return {
    id: 'meta',
    model,
    label: 'Meta Model API · Muse Spark',
    async step(system: string, msgs: Msg[], tools: ToolSpec[], signal?: AbortSignal): Promise<StepResult> {
      const input = msgs.flatMap((m): unknown[] => {
        if (m.role === 'user') {
          const content: unknown[] = [{ type: 'input_text', text: m.text }]
          if (m.image) content.push({ type: 'input_image', image_url: m.image })
          return [{ type: 'message', role: 'user', content }]
        }
        if (m.role === 'assistant') {
          const items: unknown[] = []
          if (m.text) items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.text }] })
          for (const tc of m.toolCalls) items.push({ type: 'function_call', call_id: tc.id, name: tc.name, arguments: tc.rawArgs })
          return items
        }
        return [{ type: 'function_call_output', call_id: m.callId, output: m.result }]
      })

      const t0 = Date.now()
      const json = await postJson(
        'https://api.meta.ai/v1/responses',
        env.metaKey,
        {
          model,
          instructions: system,
          input,
          ...(tools.length
            ? { tools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })), tool_choice: 'auto' }
            : {}),
          reasoning: { effort: env.metaEffort },
          max_output_tokens: 6000,
          stream: false,
        },
        signal,
      )
      if (json.error) throw new Error(`Meta API error: ${JSON.stringify(json.error).slice(0, 300)}`)
      if (json.status === 'incomplete') throw new Error(`Meta response incomplete: ${json.incomplete_details?.reason ?? 'unknown'}`)

      let text = ''
      let reasoning = ''
      const toolCalls: ToolCall[] = []
      for (const item of json.output ?? []) {
        if (item.type === 'message') {
          for (const c of item.content ?? []) if (c.type === 'output_text') text += c.text
        } else if (item.type === 'function_call') {
          toolCalls.push({ id: item.call_id ?? item.id, name: item.name, rawArgs: item.arguments ?? '{}' })
        } else if (item.type === 'reasoning') {
          for (const s of item.summary ?? []) if (s.text) reasoning += s.text + '\n'
        }
      }
      return {
        text: text.trim(),
        reasoning: reasoning.trim() || undefined,
        toolCalls,
        inTokens: json.usage?.input_tokens,
        outTokens: json.usage?.output_tokens,
        ms: Date.now() - t0,
      }
    },
  }
}
