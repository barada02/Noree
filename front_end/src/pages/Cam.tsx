import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectCameraSocket, type JoinAck } from "../lib/cameraSocket";

const MAX_WIDTH = 960;
const JPEG_QUALITY = 0.7;
const INTERVALS = [500, 1000, 2000];

type Phase = "idle" | "starting" | "streaming" | "ended" | "error";

function pairingParams() {
  const query = window.location.hash.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  return { sessionId: params.get("s"), token: params.get("t") };
}

function resumeKeyStore(sessionId: string) {
  const key = `noree:cam:${sessionId}`;
  return {
    get: () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (value: string) => {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // private mode: reconnects will just need a fresh scan
      }
    },
  };
}

export default function Cam() {
  const { sessionId, token } = pairingParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(0);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [online, setOnline] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      // unsupported or denied: the screen may sleep, which is acceptable
    }
  }, []);

  const openCamera = useCallback(async (facingMode: "environment" | "user") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
      },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, []);

  const start = async () => {
    if (!sessionId) return;
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera needs a secure (https) connection.");
      }
      await openCamera(facing);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Camera unavailable");
      setPhase("error");
      return;
    }

    const store = resumeKeyStore(sessionId);
    const socket = connectCameraSocket();
    socketRef.current = socket;

    // Runs on first connect and on every automatic reconnect.
    socket.on("connect", async () => {
      setOnline(true);
      const resumeKey = store.get();
      const res = (await socket.emitWithAck("session:join", {
        sessionId,
        ...(resumeKey ? { resumeKey } : { token }),
      })) as JoinAck;
      if (!res.ok) {
        setMessage(
          res.error === "already_paired"
            ? "This code was already used. Scan a new one on your laptop."
            : "Pairing failed. Scan a new code on your laptop.",
        );
        setPhase("error");
        socket.disconnect();
        return;
      }
      store.set(res.resumeKey);
      setPhase("streaming");
      void requestWakeLock();
    });
    socket.on("disconnect", () => setOnline(false));
    socket.on("session:ended", () => {
      setMessage("The laptop ended the session.");
      setPhase("ended");
      socket.disconnect();
    });
  };

  // Capture loop: grab a frame, downscale, JPEG-encode, send.
  useEffect(() => {
    if (phase !== "streaming") return;
    const canvas = document.createElement("canvas");
    let busy = false;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const socket = socketRef.current;
      if (busy || !video || !socket?.connected || video.videoWidth === 0) return;

      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

      busy = true;
      canvas.toBlob(
        async (blob) => {
          try {
            if (blob) {
              socket.volatile.emit("frame", await blob.arrayBuffer());
              setSent((n) => n + 1);
            }
          } finally {
            busy = false;
          }
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [phase, intervalMs]);

  // The wake lock is released when the tab is hidden; take it back on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phase === "streaming") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, requestWakeLock]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeLockRef.current?.release();
    },
    [],
  );

  const flip = async () => {
    const next = facing === "environment" ? "user" : "environment";
    try {
      await openCamera(next);
      setFacing(next);
    } catch {
      setMessage("Couldn't switch camera.");
    }
  };

  if (!sessionId) {
    return (
      <div className="grid min-h-screen place-items-center bg-black px-6 text-center text-white">
        <p>Scan the QR code shown on your laptop to connect this phone.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {phase !== "streaming" && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Noree camera</h1>
              {(phase === "idle" || phase === "starting") && (
                <>
                  <p className="mt-3 text-white/70">
                    This phone will send what its camera sees to your laptop.
                  </p>
                  <button
                    onClick={start}
                    disabled={phase === "starting"}
                    className="mt-6 rounded-full bg-white px-8 py-3 font-medium text-black disabled:opacity-50"
                  >
                    {phase === "starting" ? "Starting…" : "Start camera"}
                  </button>
                </>
              )}
              {(phase === "error" || phase === "ended") && (
                <p className="mt-3 text-white/70">{message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {phase === "streaming" && (
        <footer className="flex items-center justify-between gap-3 border-t border-white/20 px-4 py-3 text-sm">
          <span className="font-mono text-xs text-white/60">
            {online ? `Sending · ${sent}` : "Reconnecting…"}
          </span>
          <select
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="rounded bg-white/10 px-2 py-1 text-xs"
            aria-label="Frame rate"
          >
            {INTERVALS.map((ms) => (
              <option key={ms} value={ms} className="text-black">
                {(1000 / ms).toFixed(1)} fps
              </option>
            ))}
          </select>
          <button onClick={flip} className="rounded bg-white/10 px-3 py-1 text-xs">
            Flip
          </button>
        </footer>
      )}
    </div>
  );
}
