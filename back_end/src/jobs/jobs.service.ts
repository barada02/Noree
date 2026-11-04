import { ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, type BeforeApplicationShutdown } from '@nestjs/common';
import type { DirectConnection } from '@hocuspocus/server';
import * as Y from 'yjs';
import { CollabService } from '../collab/collab.service.js';
import { docParts, newId, type ActorRef, type JobKind, type JobStep, type Message } from '../shared/schema.js';

const HOUR_MS = 3_600_000;
const HEARTBEAT_MS = 10_000;

export type JobRequest = {
  projectId: string;
  blockId: string;
  kind: JobKind;
  startedBy: ActorRef;
  /** Extra fields stored on the job, such as the Slate page it runs on. */
  fields?: Record<string, string>;
  /** Where its messages go, when that isn't the block's own thread. */
  threadId?: string;
  /** Adds no messages, because whoever started it will report the result. */
  silent?: boolean;
};

export type JobOutcome = { status: 'done' | 'failed' | 'cancelled'; result?: string; error?: string };

/** Not tied to one block, such as the main agent's. Messages can go here without a block existing. */
const BOARD_THREAD = 'board';

/** What a running job uses to report. It writes into the shared document, so everyone sees it live. */
export type JobContext = {
  jobId: string;
  signal: AbortSignal;
  connection: DirectConnection;
  addStep(step: JobStep): Promise<void>;
  addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<void>;
  /** Marks the job failed with this message, once its work function returns. */
  fail(message: string): void;
  /** A short result, which is what a parent agent gets back. */
  setResult(text: string): void;
  /** Changes the job's own record in the document. */
  update(change: (job: Y.Map<unknown>) => void): Promise<void>;
};

/**
 * Starts work and returns immediately. Results and progress never go back over HTTP, only through the
 * document. Limits are server-wide: per-project limits are useless when anyone can make a new project.
 */
@Injectable()
export class JobsService implements BeforeApplicationShutdown {
  private readonly running = new Map<string, { controller: AbortController; blockKey: string }>();
  private readonly busyBlocks = new Set<string>();
  private recentRuns: number[] = [];
  private recent3dRuns: number[] = [];
  /** The 3D service handles one generation at a time well, and they take minutes. */
  private generating = false;

  constructor(private readonly collab: CollabService) {}

  private check3dLimits() {
    if (this.generating) throw new ConflictException('Another 3D model is being generated. Try again in a few minutes.');
    const now = Date.now();
    const limit = Number(process.env.GEN3D_MAX_RUNS_PER_HOUR ?? 30);
    this.recent3dRuns = this.recent3dRuns.filter((t) => now - t < HOUR_MS);
    if (this.recent3dRuns.length >= limit) {
      throw new HttpException('The 3D limit for this hour has been reached. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private checkLimits(blockKey: string, kind: JobKind) {
    if (process.env.AI_ENABLED === 'false') throw new ServiceUnavailableException('AI is turned off on this server right now.');
    if (this.busyBlocks.has(blockKey)) {
      throw new ConflictException(kind === 'main' ? 'The AI is already working on a request on this board. Try again when it finishes.' : 'This block already has a run in progress.');
    }
    const now = Date.now();
    const limit = Number(process.env.AI_MAX_RUNS_PER_HOUR ?? 120);
    this.recentRuns = this.recentRuns.filter((t) => now - t < HOUR_MS);
    if (this.recentRuns.length >= limit) {
      throw new HttpException('The AI limit for this hour has been reached. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.recentRuns.push(now);
  }

  start(request: JobRequest, work: (context: JobContext) => Promise<void>): { jobId: string } {
    const { jobId } = this.startTracked(request, work);
    return { jobId };
  }

  /** Also gives back when and how it ended, and stops when `parentSignal` does. How one agent runs another. */
  startTracked(request: JobRequest, work: (context: JobContext) => Promise<void>, parentSignal?: AbortSignal): { jobId: string; finished: Promise<JobOutcome> } {
    const blockKey = `${request.projectId}:${request.blockId}`;
    const is3d = request.kind === 'generate-3d';
    if (is3d) this.check3dLimits();
    this.checkLimits(blockKey, request.kind);
    if (is3d) {
      this.generating = true;
      this.recent3dRuns.push(Date.now());
    }
    const jobId = newId();
    const controller = new AbortController();
    this.busyBlocks.add(blockKey);
    this.running.set(jobId, { controller, blockKey });
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener('abort', () => controller.abort(), { once: true });
    const finished = this.run(jobId, controller, request, work).finally(() => {
      this.busyBlocks.delete(blockKey);
      this.running.delete(jobId);
      if (is3d) this.generating = false;
    });
    return { jobId, finished };
  }

  /** Returns false if this job isn't running here. */
  cancel(jobId: string): boolean {
    const job = this.running.get(jobId);
    if (!job) return false;
    job.controller.abort();
    return true;
  }

  private async run(jobId: string, controller: AbortController, request: JobRequest, work: (context: JobContext) => Promise<void>): Promise<JobOutcome> {
    let connection: DirectConnection | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let failure: string | null = null;
    let result: string | undefined;
    const threadId = request.threadId ?? request.blockId;
    const withJob = async (change: (job: Y.Map<unknown>, doc: Y.Doc) => void) => {
      await connection?.transact((doc) => {
        const job = docParts(doc).jobs.get(jobId);
        if (job) change(job, doc);
      });
    };

    try {
      connection = await this.collab.open(request.projectId);
      await connection.transact((doc) => {
        const job = new Y.Map<unknown>();
        job.set('id', jobId);
        job.set('blockId', request.blockId);
        job.set('threadId', threadId);
        job.set('kind', request.kind);
        job.set('status', 'running');
        job.set('steps', new Y.Array<JobStep>());
        job.set('startedBy', request.startedBy);
        job.set('startedAt', Date.now());
        job.set('heartbeatAt', Date.now());
        for (const [key, value] of Object.entries(request.fields ?? {})) job.set(key, value);
        docParts(doc).jobs.set(jobId, job);
      });
      heartbeat = setInterval(() => void withJob((job) => job.set('heartbeatAt', Date.now())), HEARTBEAT_MS);

      await work({
        jobId,
        signal: controller.signal,
        connection,
        addStep: (step) => withJob((job) => (job.get('steps') as Y.Array<JobStep>).push([step])),
        addMessage: async (message) => {
          if (request.silent) return;
          await connection?.transact((doc) => {
            const { threads, blocks } = docParts(doc);
            if (threadId !== BOARD_THREAD && !blocks.has(threadId)) return;
            let thread = threads.get(threadId);
            if (!thread) {
              thread = new Y.Array<Message>();
              threads.set(threadId, thread);
            }
            thread.push([{ id: newId(), createdAt: Date.now(), ...message }]);
          });
        },
        fail: (message) => {
          failure = message;
        },
        setResult: (text) => {
          result = text;
        },
        update: (change) => withJob((job) => change(job)),
      });
    } catch (error) {
      // Details go to the server log. People see a message that can't leak internals.
      console.error(`Job ${jobId} failed:`, error);
      failure = 'The run stopped because of a server error. Try again.';
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      try {
        await withJob((job) => {
          job.set('status', controller.signal.aborted ? 'cancelled' : failure ? 'failed' : 'done');
          if (failure) job.set('error', failure);
          if (result) job.set('result', result);
          job.set('heartbeatAt', Date.now());
        });
        await connection?.disconnect();
      } catch (error) {
        console.error(`Job ${jobId} could not save its final state:`, error);
      }
    }
    if (controller.signal.aborted) return { status: 'cancelled' };
    return failure ? { status: 'failed', error: failure } : { status: 'done', result };
  }

  beforeApplicationShutdown() {
    for (const { controller } of this.running.values()) controller.abort();
  }
}
