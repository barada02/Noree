import { io, type Socket } from "socket.io-client";
import type { CameraConfig } from "./cameraConfig";

// nginx strips "/api" before proxying to Nest, so the socket path is /api/socket.io.
export function connectCameraSocket(): Socket {
  return io({ path: "/api/socket.io" });
}

export type CreateAck =
  | { ok: true; sessionId: string; token: string; config: CameraConfig }
  | { ok: false; error: string };

export type JoinAck =
  | { ok: true; resumeKey: string; config: CameraConfig }
  | { ok: false; error: string };

/** Phone-side measurements relayed to the laptop once a second. */
export interface PhoneStats {
  sent: number;
  dropped: number;
  rtt: number;
  kb: number;
}
