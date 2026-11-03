import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { normalizeConfig, type CameraConfig } from './camera-config.js';
import { CameraSessionsService, type JoinResult } from './camera-sessions.service.js';

const MAX_FRAME_BYTES = 1_500_000;

export type CreateResult =
  | { ok: true; sessionId: string; token: string; config: CameraConfig }
  | { ok: false; error: 'too_many_sessions' };

/**
 * Pairs a laptop with a phone camera and relays the phone's frames to the
 * laptop. nginx strips `/api`, so clients connect with path `/api/socket.io`.
 */
@WebSocketGateway({ maxHttpBufferSize: MAX_FRAME_BYTES * 2 })
export class CameraGateway implements OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  constructor(private readonly sessions: CameraSessionsService) {}

  @SubscribeMessage('session:create')
  create(
    @ConnectedSocket() client: Socket,
    @MessageBody() body?: { config?: unknown },
  ): CreateResult {
    const session = this.sessions.create(client.id, normalizeConfig(body?.config));
    if (!session) return { ok: false, error: 'too_many_sessions' };
    return {
      ok: true,
      sessionId: session.id,
      token: session.pairingToken!,
      config: session.config,
    };
  }

  @SubscribeMessage('session:join')
  join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; token?: string; resumeKey?: string },
  ): JoinResult {
    const result = this.sessions.join(String(body?.sessionId ?? ''), client.id, {
      token: body?.token,
      resumeKey: body?.resumeKey,
    });
    if (result.ok) {
      const session = this.sessions.get(body.sessionId!)!;
      this.server.to(session.laptopSocketId).emit('phone:connected');
    }
    return result;
  }

  /** Laptop tunes the stream; the phone gets the clamped values. */
  @SubscribeMessage('config:set')
  setConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: boolean; config?: CameraConfig } {
    const session = this.sessions.findByLaptop(client.id);
    if (!session) return { ok: false };
    session.config = normalizeConfig(body, session.config);
    if (session.phoneSocketId) {
      this.server.to(session.phoneSocketId).emit('config', session.config);
    }
    return { ok: true, config: session.config };
  }

  /** Acks each frame so the phone can measure round-trip time and avoid queueing. */
  @SubscribeMessage('frame')
  frame(@ConnectedSocket() client: Socket, @MessageBody() data: Buffer): boolean {
    if (!Buffer.isBuffer(data) || data.length > MAX_FRAME_BYTES) return false;
    const session = this.sessions.findByPhone(client.id);
    if (!session) return false;
    // volatile: if the laptop is slow, drop frames instead of queueing them
    this.server.to(session.laptopSocketId).volatile.emit('frame', data);
    return true;
  }

  /** Phone-side measurements, shown on the laptop for tuning. */
  @SubscribeMessage('stats')
  stats(@ConnectedSocket() client: Socket, @MessageBody() body: Record<string, unknown>): void {
    const session = this.sessions.findByPhone(client.id);
    if (!session) return;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    this.server.to(session.laptopSocketId).volatile.emit('stats', {
      sent: num(body?.sent),
      dropped: num(body?.dropped),
      rtt: num(body?.rtt),
      kb: num(body?.kb),
    });
  }

  handleDisconnect(client: Socket): void {
    const session = this.sessions.clearPhone(client.id);
    if (session) this.server.to(session.laptopSocketId).emit('phone:disconnected');

    for (const ended of this.sessions.removeByLaptop(client.id)) {
      if (ended.phoneSocketId) {
        this.server.to(ended.phoneSocketId).emit('session:ended');
      }
    }
  }
}
