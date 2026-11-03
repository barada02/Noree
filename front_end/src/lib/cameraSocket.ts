import { io, type Socket } from "socket.io-client";

// nginx strips "/api" before proxying to Nest, so the socket path is /api/socket.io.
export function connectCameraSocket(): Socket {
  return io({ path: "/api/socket.io" });
}

export type CreateAck =
  | { ok: true; sessionId: string; token: string }
  | { ok: false; error: string };

export type JoinAck =
  | { ok: true; resumeKey: string }
  | { ok: false; error: string };
