import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AssetsService } from '../assets/assets.service.js';
import { ProjectsStore } from '../collab/projects.store.js';
import { JobsService } from '../jobs/jobs.service.js';
import { runSlateJob } from './slate-run.js';
import { health, providerChain } from './slate/providers/index.js';

const SlateRunBody = z.object({
  pageId: z.string().min(1).max(64),
  snapshotUrl: z.string().max(200),
  instruction: z.string().trim().max(2000).optional(),
  provider: z.enum(['baseten', 'meta']).default('baseten'),
  person: z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(40) }),
});

@Controller()
export class AgentsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly assets: AssetsService,
    private readonly store: ProjectsStore,
  ) {}

  @Get('health')
  health() {
    return health();
  }

  /** Answers straight away with a job id. Progress and results arrive through the shared document. */
  @Post('projects/:id/blocks/:blockId/slate-run')
  @HttpCode(202)
  slateRun(@Param('id') id: string, @Param('blockId') blockId: string, @Body() body: unknown) {
    if (!this.store.get(id)) throw new NotFoundException();
    const parsed = SlateRunBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid run request.');
    const { pageId, snapshotUrl, instruction, provider, person } = parsed.data;
    const snapshot = this.assets.readAsDataUrl(id, snapshotUrl);
    if (!snapshot) throw new BadRequestException('The page snapshot was not found. Try again.');

    return this.jobs.start(
      { projectId: id, blockId, kind: 'slate-run', startedBy: { kind: 'person', ...person }, fields: { pageId } },
      (context) => runSlateJob(context, { blockId, pageId, snapshot, instruction: instruction || undefined, provider }, providerChain(provider)),
    );
  }

  @Post('projects/:id/jobs/:jobId/cancel')
  @HttpCode(202)
  cancel(@Param('jobId') jobId: string) {
    return { cancelled: this.jobs.cancel(jobId) };
  }
}
