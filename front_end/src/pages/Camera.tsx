import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import {
  connectCameraSocket,
  type CreateAck,
} from "../lib/cameraSocket";

type Status = "connecting" | "waiting" | "live" | "phone-left" | "error";

export default function Camera() {
  const [status, setStatus] = useState<Status>("connecting");
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [fps, setFps] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Dropping the socket makes the server end this laptop's sessions (and tell a
  // paired phone), then reconnecting creates a fresh session with a new QR code.
  const newCode = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    setPairUrl(null);
    setFrames(0);
    setFps(0);
    setStatus("connecting");
    if (imgRef.current) imgRef.current.removeAttribute("src");
    socket.disconnect().connect();
  }, []);

  useEffect(() => {
    const socket = connectCameraSocket();
    socketRef.current = socket;
    let lastUrl: string | null = null;
    let recent: number[] = [];

    // A fresh session is needed on every (re)connect: the server drops a
    // laptop's sessions as soon as its socket disconnects.
    socket.on("connect", async () => {
      const res = (await socket.emitWithAck("session:create")) as CreateAck;
      if (!res.ok) {
        setStatus("error");
        return;
      }
      // Token lives in the hash so it never reaches server logs.
      setPairUrl(
        `${window.location.origin}/#/cam?s=${res.sessionId}&t=${res.token}`,
      );
      setStatus("waiting");
    });
    socket.on("connect_error", () => setStatus("error"));
    socket.on("disconnect", () => setStatus("connecting"));
    socket.on("phone:connected", () => setStatus("live"));
    socket.on("phone:disconnected", () => setStatus("phone-left"));

    socket.on("frame", (data: ArrayBuffer) => {
      const url = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
      if (imgRef.current) imgRef.current.src = url;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = url;

      const now = performance.now();
      recent = [...recent.filter((t) => now - t < 5000), now];
      setFrames((n) => n + 1);
      setFps(recent.length > 1 ? (recent.length - 1) / ((now - recent[0]) / 1000) : 0);
    });

    return () => {
      socket.disconnect();
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, []);

  const hasFrame = frames > 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <a href="#/" className="text-lg font-semibold tracking-tight">
          Noree
        </a>
        <a
          href="#/"
          className="font-mono text-xs tracking-widest uppercase hover:underline"
        >
          ← Back
        </a>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        <p className="pt-10 font-mono text-xs tracking-widest uppercase text-white/50">
          Experiment
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Phone camera link
        </h1>
        <p className="mt-3 max-w-xl text-white/70">
          Scan the code with your phone. Its rear camera streams still frames
          here, the same frames a multimodal model would receive.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-[240px_1fr]">
          <div>
            <div className="inline-block rounded-lg bg-white p-3">
              {pairUrl && status === "waiting" ? (
                <QRCodeSVG value={pairUrl} size={216} />
              ) : (
                <div className="grid h-[216px] w-[216px] place-items-center text-sm text-black/50">
                  {status === "live" || status === "phone-left"
                    ? "Paired"
                    : status === "error"
                      ? "Can't reach server"
                      : "Connecting…"}
                </div>
              )}
            </div>
            <p className="mt-3 font-mono text-xs text-white/60">
              {status === "waiting" && "Waiting for phone…"}
              {status === "live" && `Live · ${fps.toFixed(1)} fps · ${frames} frames`}
              {status === "phone-left" && "Phone disconnected. It can rejoin without rescanning."}
              {status === "error" && "Connection failed. Is the API running?"}
            </p>
            <button
              onClick={newCode}
              className="mt-4 rounded-md border border-white/40 px-3 py-1.5 font-mono text-xs tracking-widest uppercase hover:bg-white hover:text-black"
            >
              {status === "live" || status === "phone-left"
                ? "Disconnect · new QR"
                : "New QR code"}
            </button>
            {pairUrl && status === "waiting" && (
              <a
                href={pairUrl}
                className="mt-3 block break-all font-mono text-[10px] text-white/30 hover:text-white/60"
              >
                {pairUrl}
              </a>
            )}
          </div>

          <div className="grid aspect-video place-items-center overflow-hidden rounded-lg border border-white/20 bg-white/5">
            <img
              ref={imgRef}
              alt="Latest frame from phone"
              className={hasFrame ? "h-full w-full object-contain" : "hidden"}
            />
            {!hasFrame && (
              <span className="font-mono text-xs text-white/40">
                No frames yet
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
