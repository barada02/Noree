import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_CONFIG, type CameraConfig } from './camera-config.js';

const MAX_SESSIONS = 200;
const PAIRING_TTL_MS = 10 * 60 * 1000;

export interface CameraSession {
  id: string;
  laptopSocketId: string;
  /** One-time secret shown in the QR code; cleared once a phone pairs. */
  pairingToken: string | null;
  /** Lets the phone reconnect after a network drop without a new QR scan. */
  resumeKey: string | null;
  phoneSocketId: string | null;
  config: CameraConfig;
  createdAt: number;
}

export type JoinResult =
  | { ok: true; resumeKey: string; config: CameraConfig }
  | { ok: false; error: 'not_found' | 'invalid_token' | 'already_paired' };

function secret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class CameraSessionsService {
  private readonly sessions = new Map<string, CameraSession>();

  create(laptopSocketId: string, config: CameraConfig = DEFAULT_CONFIG): CameraSession | null {
    this.expireStale();
    if (this.sessions.size >= MAX_SESSIONS) return null;
    const session: CameraSession = {
      id: secret(9),
      laptopSocketId,
      pairingToken: secret(24),
      resumeKey: null,
      phoneSocketId: null,
      config,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): CameraSession | undefined {
    return this.sessions.get(id);
  }

  join(
    id: string,
    phoneSocketId: string,
    credentials: { token?: string; resumeKey?: string },
  ): JoinResult {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, error: 'not_found' };

    if (credentials.resumeKey && session.resumeKey) {
      if (!sameSecret(credentials.resumeKey, session.resumeKey)) {
        return { ok: false, error: 'invalid_token' };
      }
    } else if (session.pairingToken) {
      if (!credentials.token || !sameSecret(credentials.token, session.pairingToken)) {
        return { ok: false, error: 'invalid_token' };
      }
      session.pairingToken = null;
      session.resumeKey = secret(24);
    } else {
      return { ok: false, error: 'already_paired' };
    }

    session.phoneSocketId = phoneSocketId;
    return { ok: true, resumeKey: session.resumeKey!, config: session.config };
  }

  findByLaptop(socketId: string): CameraSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.laptopSocketId === socketId) return session;
    }
  }

  findByPhone(socketId: string): CameraSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.phoneSocketId === socketId) return session;
    }
  }

  clearPhone(socketId: string): CameraSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.phoneSocketId === socketId) {
        session.phoneSocketId = null;
        return session;
      }
    }
  }

  /** Removes every session owned by this laptop socket and returns them. */
  removeByLaptop(socketId: string): CameraSession[] {
    const removed: CameraSession[] = [];
    for (const [id, session] of this.sessions) {
      if (session.laptopSocketId === socketId) {
        this.sessions.delete(id);
        removed.push(session);
      }
    }
    return removed;
  }

  /** Drops sessions that never got a phone within the pairing window. */
  private expireStale(): void {
    const cutoff = Date.now() - PAIRING_TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.pairingToken && session.createdAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }
}
