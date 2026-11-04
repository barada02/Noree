import { z } from 'zod';
import { ActionError } from '../../shared/actions.js';
import type { ToolCall, ToolSpec } from '../slate/providers/types.js';
import type { ToolRun } from './loop.js';

/** A tool an agent can call. Its schema is both what the model sees and what its input is checked against. */
export type AgentTool<Context> = {
  name: string;
  description: string;
  schema: z.ZodObject;
  run: (args: never, context: Context) => Promise<ToolRun<never>> | ToolRun<never>;
};

export function defineTool<Schema extends z.ZodObject, Context>(tool: {
  name: string;
  description: string;
  schema: Schema;
  run: (args: z.infer<Schema>, context: Context) => Promise<ToolRun<never>> | ToolRun<never>;
}): AgentTool<Context> {
  return tool as unknown as AgentTool<Context>;
}

/** What the model is told about a tool. */
export function toolSpec<Context>(tool: AgentTool<Context>): ToolSpec {
  const { $schema: _unused, ...parameters } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, parameters };
}

/** Runs a model's tool call. Bad input comes back as a message the model can act on, instead of failing the run. */
export async function runTool<Context>(tools: AgentTool<Context>[], call: ToolCall, context: Context): Promise<ToolRun<never>> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) return { ok: false, result: `Unknown tool "${call.name}". Available: ${tools.map((t) => t.name).join(', ')}.` };

  let raw: unknown;
  try {
    raw = call.rawArgs ? JSON.parse(call.rawArgs) : {};
  } catch {
    return { ok: false, result: 'The arguments were not valid JSON. Send them again as a valid JSON object.' };
  }
  const parsed = tool.schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`);
    return { ok: false, result: `Invalid arguments. ${problems.join('; ')}.` };
  }
  try {
    return await tool.run(parsed.data as never, context);
  } catch (error) {
    // A broken board rule, such as a connection that would make a loop, is something the model can fix.
    if (error instanceof ActionError) return { ok: false, result: error.message };
    throw error;
  }
}
