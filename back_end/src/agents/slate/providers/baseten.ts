import { env } from '../env'
import { postJson, type Msg, type Provider, type StepResult, type ToolCall, type ToolSpec } from './types'

/** Baseten serverless inference of the open-weight Muse Spark Open (OpenAI-compatible chat completions). */
export function basetenProvider(): Provider {
  const model = env.basetenModel
  return {
    id: 'baseten',
    model,
    label: 'Baseten · Muse Spark Open (open weights)',
    async step(system: string, msgs: Msg[], tools: ToolSpec[], signal?: AbortSignal): Promise<StepResult> {
      const messages: unknown[] = [{ role: 'system', content: system }]
      for (const m of msgs) {
        if (m.role === 'user') {
          const content: unknown[] = [{ type: 'text', text: m.text }]
          if (m.image) content.push({ type: 'image_url', image_url: { url: m.image } })
          messages.push({ role: 'user', content })
        } else if (m.role === 'assistant') {
          messages.push({
            role: 'assistant',
            content: m.text || '',
            ...(m.toolCalls.length
              ? { tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.rawArgs } })) }
              : {}),
          })
        } else {
          messages.push({ role: 'tool', tool_call_id: m.callId, content: m.result })
        }
      }

      const t0 = Date.now()
      const json = await postJson(
        'https://inference.baseten.co/v1/chat/completions',
        env.basetenKey,
        {
          model,
          messages,
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 4096,
        },
        signal,
      )
      const choice = json.choices?.[0]
      if (!choice) throw new Error(`Baseten returned no choices: ${JSON.stringify(json).slice(0, 300)}`)
      const msg = choice.message ?? {}
      const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name,
        rawArgs: tc.function?.arguments ?? '{}',
      }))
      return {
        text: (msg.content ?? '').trim(),
        reasoning: (msg.reasoning_content ?? msg.reasoning ?? '').trim() || undefined,
        toolCalls,
        inTokens: json.usage?.prompt_tokens,
        outTokens: json.usage?.completion_tokens,
        ms: Date.now() - t0,
      }
    },
  }
}
