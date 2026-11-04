import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AssetsService } from '../assets/assets.service.js';
import { CollabService } from '../collab/collab.service.js';
import * as Y from 'yjs';
import { docParts, newId, type Message } from '../shared/schema.js';
import { ProjectsStore } from '../collab/projects.store.js';
import { JobsService } from '../jobs/jobs.service.js';
import { BOARD_THREAD, runMainAgentJob, applyUndo, type UndoStep } from './main-agent.js';
import { runGenerateJob } from './generate3d.js';
import { httpSandboxClient } from './sandbox-client.js';
import { runSlateJob } from './slate-run.js';
import { health, providerChain } from './slate/providers/index.js';


const person = z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(40) });

const AskBody = z.object({
  text: z.string().trim().min(1).max(4000),
  person,
  focusBlockId: z.string().min(1).max(64).optional(),
});

const UndoBody = z.object({ person });

const SlateRunBody = z.object({
  pageId: z.string().min(1).max(64),
  snapshotUrl: z.string().max(200),
  instruction: z.string().trim().max(2000).optional(),
  provider: z.enum(['baseten', 'meta']).default('baseten'),
  person,
});

const GenerateBody = z.object({ person });


@Controller()
export class AgentsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly assets: AssetsService,
    private readonly store: ProjectsStore,
    private readonly collab: CollabService,
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
    const { pageId, snapshotUrl, instruction, provider } = parsed.data;
    const snapshot = this.assets.readAsDataUrl(id, snapshotUrl);
    if (!snapshot) throw new BadRequestException('The page snapshot was not found. Try again.');

    return this.jobs.start(
      { projectId: id, blockId, kind: 'slate-run', startedBy: { kind: 'person', ...parsed.data.person }, fields: { pageId } },
      (context) => runSlateJob(context, { blockId, pageId, snapshot, instruction: instruction || undefined, provider }, providerChain(provider)),
    );
  }

  /** Asks the main agent, with or without a selected block. The reply arrives through the document. */
  @Post('projects/:id/agent')
  @HttpCode(202)
  askAgent(@Param('id') id: string, @Body() body: unknown) {
    if (!this.store.get(id)) throw new NotFoundException();
    const parsed = AskBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid question.');
    const { text, focusBlockId } = parsed.data;
    const asker = { kind: 'person' as const, ...parsed.data.person };
    // One main agent run per project, so two requests can't build on the board at once.
    return this.jobs.start({ projectId: id, blockId: BOARD_THREAD, kind: 'main', startedBy: asker, threadId: focusBlockId ?? BOARD_THREAD }, (context) =>
      runMainAgentJob(context, { question: text, person: asker, focusBlockId }, providerChain('meta'), {
        projectId: id,
        jobs: this.jobs,
        chainFor: (subagent) => providerChain(subagent === 'slate' ? 'baseten' : 'meta'),
        sandbox: () => httpSandboxClient(),
        readAsset: (url) => this.assets.readAsDataUrl(id, url),
        saveImage: (data) => this.assets.saveImage(id, data),
        saveCode: (code) => this.assets.saveCode(id, code),
      }),
    );
  }

  /** Reverses the board changes from one main agent run. Slate annotations and 3D versions have their own undo. */
  @Post('projects/:id/jobs/:jobId/undo')
  @HttpCode(200)
  async undoAgentRun(@Param('id') id: string, @Param('jobId') jobId: string, @Body() body: unknown) {
    if (!this.store.get(id)) throw new NotFoundException();
    const parsed = UndoBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request.');
    const asker = { kind: 'person' as const, ...parsed.data.person };
    const undone = await this.collab.read(id, (doc) => {
      const job = docParts(doc).jobs.get(jobId);
      const steps = job?.get('undo') as UndoStep[] | undefined;
      if (!job || !steps?.length || job.get('undone')) return false;
      applyUndo(doc, steps, asker);
      job.set('undone', true);
      // It goes in the conversation too, or the agent's history still says its work is on the board.
      const threads = docParts(doc).threads;
      const threadId = job.get('threadId') as string;
      if (!threads.has(threadId)) threads.set(threadId, new Y.Array<Message>());
      threads.get(threadId)!.push([{ id: newId(), role: 'user', author: asker, text: 'I undid those changes.', createdAt: Date.now() }]);
      return true;
    });
    return { undone };
  }

  /** Generates a 3D model from the block's prompt and what's connected to it. Can take minutes. */
  @Post('projects/:id/blocks/:blockId/generate')
  @HttpCode(202)
  generate(@Param('id') id: string, @Param('blockId') blockId: string, @Body() body: unknown) {
    if (!this.store.get(id)) throw new NotFoundException();
    const parsed = GenerateBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request.');
    const asker = { kind: 'person' as const, ...parsed.data.person };
    return this.jobs.start({ projectId: id, blockId, kind: 'generate-3d', startedBy: asker }, (context) =>
      runGenerateJob(
        context,
        {
          blockId,
          person: asker,
          readAsset: (url) => this.assets.readAsDataUrl(id, url),
          saveImage: (data) => this.assets.saveImage(id, data),
          saveCode: (code) => this.assets.saveCode(id, code),
        },
        providerChain('meta'),
        httpSandboxClient(),
      ),
    );
  }

  @Post('projects/:id/jobs/:jobId/cancel')
  @HttpCode(202)
  cancel(@Param('jobId') jobId: string) {
    return { cancelled: this.jobs.cancel(jobId) };
  }
}
