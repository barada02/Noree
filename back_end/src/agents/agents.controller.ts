import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import type { AgentEvent, RunRequest } from '../shared/protocol.js';
import { runAgent } from './slate/agent.js';
import { health, providerChain } from './slate/providers/index.js';

@Controller()
export class AgentsController {
  @Get('health')
  health() {
    return health();
  }

  /**
   * TEMPORARY, M0 only: proves the ported agent works through Nest. Replaced by the job-based
   * slate-run endpoint at M3. Disabled in production because it has no limits.
   */
  @Post('dev/slate-run')
  @HttpCode(200)
  async devSlateRun(@Body() request: RunRequest) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
    const events: AgentEvent[] = [];
    for await (const event of runAgent(request, providerChain(request.provider))) events.push(event);
    return events;
  }
}
