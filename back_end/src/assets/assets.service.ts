import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectsStore } from '../collab/projects.store.js';

const HOUR_MS = 3_600_000;
const ASSET_FILE = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
const ASSET_URL = /^\/api\/assets\/([a-f0-9]{48})\/([a-f0-9]{32}\.(?:png|jpg|webp))$/;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Identifies an image from its bytes, not from what the upload claims to be. */
export function imageExtension(data: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

@Injectable()
export class AssetsService {
  private recentUploads: number[] = [];

  constructor(private readonly store: ProjectsStore) {}

  /** Returns false over the hourly limit, which keeps a script from filling the disk. */
  allowUpload(): boolean {
    const now = Date.now();
    const limit = Number(process.env.ASSETS_MAX_PER_HOUR ?? 1000);
    this.recentUploads = this.recentUploads.filter((t) => now - t < HOUR_MS);
    if (this.recentUploads.length >= limit) return false;
    this.recentUploads.push(now);
    return true;
  }

  private dir(projectId: string) {
    return join(this.store.dataDir, 'assets', projectId);
  }

  /** Names come from the content, so identical snapshots share one file. */
  save(projectId: string, data: Buffer, extension: string): string {
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${extension}`;
    const dir = this.dir(projectId);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    if (!existsSync(file)) {
      writeFileSync(`${file}.tmp`, data);
      renameSync(`${file}.tmp`, file);
    }
    return `/api/assets/${projectId}/${name}`;
  }

  /** The file on disk for a request, or null if the names aren't ours. */
  filePath(projectId: string, file: string): string | null {
    if (!this.store.get(projectId) || !ASSET_FILE.test(file)) return null;
    const path = join(this.dir(projectId), file);
    return existsSync(path) ? path : null;
  }

  /** Reads an asset of this project as a data URL, for sending to a vision model. */
  readAsDataUrl(projectId: string, url: string): string | null {
    const match = ASSET_URL.exec(url);
    if (!match || match[1] !== projectId) return null;
    const path = this.filePath(projectId, match[2]);
    if (!path) return null;
    const extension = match[2].split('.')[1];
    return `data:${IMAGE_TYPES[extension]};base64,${readFileSync(path).toString('base64')}`;
  }
}
