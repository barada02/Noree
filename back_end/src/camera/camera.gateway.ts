import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CameraSessionsService, type JoinResult } from './camera-sessions.service.js';

const MAX_FRAME_BYTES = 1_500_000;

export type CreateResult =
  | { ok: true; sessionId: string; token: string }
  | { ok: false; error: 'too_many_sessions' };

/**
 * Pairs a laptop with a phone camera and relays the phone's JPEG frames to the
 * laptop. nginx strips `/api`, so clients connect with path `/api/socket.io`.
 */
@WebSocketGateway({ maxHttpBufferSize: MAX_FRAME_BYTES * 2 })
export class CameraGateway implements OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  constructor(private readonly sessions: CameraSessionsService) {}

  @SubscribeMessage('session:create')
  create(@ConnectedSocket() client: Socket): CreateResult {
    const session = this.sessions.create(client.id);
    if (!session) return { ok: false, error: 'too_many_sessions' };
    return { ok: true, sessionId: session.id, token: session.pairingToken! };
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

  @SubscribeMessage('frame')
  frame(@ConnectedSocket() client: Socket, @MessageBody() data: Buffer): void {
    if (!Buffer.isBuffer(data) || data.length > MAX_FRAME_BYTES) return;
    const session = this.sessions.findByPhone(client.id);
    if (!session) return;
    // volatile: if the laptop is slow, drop frames instead of queueing them
    this.server.to(session.laptopSocketId).volatile.emit('frame', data);
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
