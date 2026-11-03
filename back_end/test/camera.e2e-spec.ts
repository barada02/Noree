import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module.js';

function once<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as never));
}

describe('Camera pairing (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

  const connect = async (): Promise<Socket> => {
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await app.close();
  });

  it('pairs a phone with a one-time token and relays frames to the laptop', async () => {
    const laptop = await connect();
    const created = await laptop.emitWithAck('session:create');
    expect(created.ok).toBe(true);

    const phone = await connect();
    const connected = once(laptop, 'phone:connected');
    const joined = await phone.emitWithAck('session:join', {
      sessionId: created.sessionId,
      token: created.token,
    });
    expect(joined.ok).toBe(true);
    await connected;

    const frame = once<Buffer>(laptop, 'frame');
    phone.emit('frame', Buffer.from([0xff, 0xd8, 0xff]));
    expect(Buffer.from(await frame)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('rejects a second phone using the same QR token', async () => {
    const laptop = await connect();
    const { sessionId, token } = await laptop.emitWithAck('session:create');

    const first = await connect();
    await first.emitWithAck('session:join', { sessionId, token });

    const second = await connect();
    const result = await second.emitWithAck('session:join', { sessionId, token });
    expect(result).toEqual({ ok: false, error: 'already_paired' });
  });

  it('rejects a wrong token and ignores frames from unpaired sockets', async () => {
    const laptop = await connect();
    const { sessionId } = await laptop.emitWithAck('session:create');

    const stranger = await connect();
    const result = await stranger.emitWithAck('session:join', {
      sessionId,
      token: 'nope',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_token' });

    let received = false;
    laptop.on('frame', () => (received = true));
    stranger.emit('frame', Buffer.from([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toBe(false);
  });

  it('lets the phone resume with its key after reconnecting', async () => {
    const laptop = await connect();
    const { sessionId, token } = await laptop.emitWithAck('session:create');

    const phone = await connect();
    const { resumeKey } = await phone.emitWithAck('session:join', { sessionId, token });
    phone.disconnect();

    const again = await connect();
    const result = await again.emitWithAck('session:join', { sessionId, resumeKey });
    expect(result.ok).toBe(true);
  });

  it('tells the phone when the laptop leaves', async () => {
    const laptop = await connect();
    const { sessionId, token } = await laptop.emitWithAck('session:create');
    const phone = await connect();
    await phone.emitWithAck('session:join', { sessionId, token });

    const ended = once(phone, 'session:ended');
    laptop.disconnect();
    await ended;
  });
});
