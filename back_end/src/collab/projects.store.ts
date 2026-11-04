import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ProjectRecord = { id: string; title: string; createdAt: number; updatedAt: number };

const PROJECT_ID = /^[a-f0-9]{48}$/;
const DOC_NAME = /^project:([a-f0-9]{48})$/;
const HOUR_MS = 3_600_000;

/** Writes through a temporary file, so a crash mid-write can't leave a half-written file behind. */
function writeAtomic(file: string, data: string | Uint8Array) {
  const temp = `${file}.tmp`;
  writeFileSync(temp, data);
  renameSync(temp, file);
}

/**
 * Plain files, kept in DATA_DIR. On the server that is ~/noree-api/data, which deploys don't touch.
 * Only ids that pass the pattern ever reach a file path, which rules out path tricks.
 */
@Injectable()
export class ProjectsStore {
  private readonly root = resolve(process.env.DATA_DIR ?? 'data');
  private readonly indexFile = join(this.root, 'projects.json');
  private readonly projects = new Map<string, ProjectRecord>();
  private recentCreates: number[] = [];

  constructor() {
    mkdirSync(join(this.root, 'docs'), { recursive: true });
    if (existsSync(this.indexFile)) {
      for (const project of JSON.parse(readFileSync(this.indexFile, 'utf8')) as ProjectRecord[]) {
        this.projects.set(project.id, project);
      }
    }
  }

  get dataDir() {
    return this.root;
  }

  private saveIndex() {
    writeAtomic(this.indexFile, JSON.stringify([...this.projects.values()]));
  }

  /** Returns null over the hourly limit, which keeps a script from filling the disk. */
  create(title: string): ProjectRecord | null {
    const now = Date.now();
    const limit = Number(process.env.PROJECTS_MAX_PER_HOUR ?? 200);
    this.recentCreates = this.recentCreates.filter((t) => now - t < HOUR_MS);
    if (this.recentCreates.length >= limit) return null;
    this.recentCreates.push(now);

    const project: ProjectRecord = { id: randomBytes(24).toString('hex'), title, createdAt: now, updatedAt: now };
    this.projects.set(project.id, project);
    this.saveIndex();
    return project;
  }

  get(id: string): ProjectRecord | undefined {
    return PROJECT_ID.test(id) ? this.projects.get(id) : undefined;
  }

  /** The project id for a valid document name of a known project. */
  idFromDocName(documentName: string): string | null {
    const id = DOC_NAME.exec(documentName)?.[1];
    return id && this.projects.has(id) ? id : null;
  }

  docName(id: string) {
    return `project:${id}`;
  }

  private docFile(id: string) {
    return join(this.root, 'docs', `${id}.bin`);
  }

  loadDoc(id: string): Uint8Array | null {
    const file = this.docFile(id);
    return existsSync(file) ? readFileSync(file) : null;
  }

  saveDoc(id: string, state: Uint8Array, title: string | undefined) {
    writeAtomic(this.docFile(id), state);
    const project = this.projects.get(id);
    if (project) {
      project.updatedAt = Date.now();
      if (title) project.title = title;
      this.saveIndex();
    }
  }
}
