import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { DEFAULT_CONFIG, type CameraConfig } from "../lib/cameraConfig";
import { connectCameraSocket, type JoinAck } from "../lib/cameraSocket";

type Phase = "idle" | "starting" | "streaming" | "ended" | "error";
type TorchTrack = MediaTrackCapabilities & { torch?: boolean };

// A frame is only sent while fewer than this many are awaiting the server's ack,
// so a slow network drops frames instead of building up delay.
const MAX_IN_FLIGHT = 2;
const STALE_ACK_MS = 3000;

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

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-14 w-14 place-items-center rounded-full text-xs font-medium backdrop-blur ${
        active ? "bg-white text-black" : "bg-black/50 text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function Cam() {
  const { sessionId, token } = pairingParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  const [paused, setPaused] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [config, setConfig] = useState<CameraConfig>(DEFAULT_CONFIG);
  const [live, setLive] = useState({ fps: 0, rtt: 0, kb: 0, dropped: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Shape of the camera image; the preview box is drawn in exactly this shape.
  const [aspect, setAspect] = useState(3 / 4);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const configRef = useRef(config);
  const pausedRef = useRef(false);
  const inFlightRef = useRef(0);

  const requestWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      // unsupported or denied: the screen may sleep, which is acceptable
    }
  }, []);

  // Ask the camera for the width the laptop chose; frames are downscaled from it.
  const applyCaptureWidth = useCallback(async (cfg: CameraConfig) => {
    const track = streamRef.current?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ width: { ideal: cfg.captureWidth } });
    } catch {
      // some devices refuse; keep whatever resolution we have
    }
  }, []);

  const applyConfig = useCallback(
    (cfg: CameraConfig) => {
      configRef.current = cfg;
      setConfig(cfg);
      void applyCaptureWidth(cfg);
    },
    [applyCaptureWidth],
  );

  const openCamera = useCallback(
    async (facingMode: "environment" | "user") => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: configRef.current.captureWidth },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTorchSupported(Boolean((track?.getCapabilities?.() as TorchTrack)?.torch));
      setTorchOn(false);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    },
    [],
  );

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
      inFlightRef.current = 0;
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
      applyConfig(res.config);
      setPhase("streaming");
      void requestWakeLock();
    });
    socket.on("config", applyConfig);
    socket.on("disconnect", () => setOnline(false));
    socket.on("session:ended", () => {
      setMessage("The laptop ended the session.");
      setPhase("ended");
      socket.disconnect();
    });
  };

  // Capture loop. Reads the live config every tick, so laptop tweaks apply instantly.
  useEffect(() => {
    if (phase !== "streaming") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let stopped = false;
    let timer = 0;
    let encoding = false;
    let lastSendAt = 0;
    let sentW = 0;
    let sentH = 0;
    const window1s = { sent: 0, dropped: 0, bytes: 0, rttSum: 0, acks: 0 };

    const tick = () => {
      if (stopped) return;
      const cfg = configRef.current;
      const video = videoRef.current;
      const socket = socketRef.current;
      const began = performance.now();

      if (
        !pausedRef.current &&
        video &&
        ctx &&
        socket?.connected &&
        video.videoWidth > 0
      ) {
        if (inFlightRef.current > 0 && began - lastSendAt > STALE_ACK_MS) {
          inFlightRef.current = 0; // lost ack (e.g. dropped connection)
        }
        if (encoding || inFlightRef.current >= MAX_IN_FLIGHT) {
          window1s.dropped++;
        } else {
          const scale = Math.min(1, cfg.width / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          sentW = canvas.width;
          sentH = canvas.height;

          encoding = true;
          canvas.toBlob(
            async (blob) => {
              try {
                if (!blob || stopped) return;
                const buf = await blob.arrayBuffer();
                const sentAt = performance.now();
                lastSendAt = sentAt;
                inFlightRef.current++;
                socket.emit("frame", buf, () => {
                  inFlightRef.current = Math.max(0, inFlightRef.current - 1);
                  window1s.rttSum += performance.now() - sentAt;
                  window1s.acks++;
                });
                window1s.sent++;
                window1s.bytes += buf.byteLength;
              } finally {
                encoding = false;
              }
            },
            // Safari can't encode webp and silently returns png; the laptop copes either way.
            `image/${cfg.format}`,
            cfg.quality,
          );
        }
      }

      timer = window.setTimeout(
        tick,
        Math.max(0, 1000 / cfg.fps - (performance.now() - began)),
      );
    };
    tick();

    const reporter = window.setInterval(() => {
      const w = window1s;
      const next = {
        fps: w.sent,
        dropped: w.dropped,
        rtt: w.acks ? Math.round(w.rttSum / w.acks) : 0,
        kb: w.sent ? Math.round(w.bytes / w.sent / 1024) : 0,
      };
      setLive(next);
      setSize((prev) =>
        prev.w === sentW && prev.h === sentH ? prev : { w: sentW, h: sentH },
      );
      socketRef.current?.volatile.emit("stats", {
        sent: next.fps,
        dropped: next.dropped,
        rtt: next.rtt,
        kb: next.kb,
      });
      w.sent = w.dropped = w.bytes = w.rttSum = w.acks = 0;
    }, 1000);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(reporter);
    };
  }, [phase]);

  // Keep the preview box the same shape as the camera image (also after a flip/rotate).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth > 0) setAspect(video.videoWidth / video.videoHeight);
    };
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, []);

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

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const flip = async () => {
    const next = facing === "environment" ? "user" : "environment";
    try {
      await openCamera(next);
      setFacing(next);
    } catch {
      setMessage("Couldn't switch camera.");
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !torchOn;
    try {
      await track?.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="grid h-dvh place-items-center bg-black px-6 text-center text-white">
        <p>Scan the QR code shown on your laptop to connect this phone.</p>
      </div>
    );
  }

  const streaming = phase === "streaming";

  return (
    <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-black text-white">
      {streaming && (
        <div className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  !online ? "bg-red-500" : paused ? "bg-amber-400" : "bg-emerald-400"
                }`}
              />
              {!online ? "Reconnecting…" : paused ? "Paused" : "Streaming"}
            </span>
            <span className="text-white/80">
              {live.fps}/{config.fps} fps · {live.kb} KB · {live.rtt} ms
              {live.dropped > 0 && ` · ${live.dropped} skipped`}
            </span>
          </div>
          <p className="mt-1 text-white/50">
            Green frame = exactly what your laptop sees
            {size.w > 0 && ` · ${size.w}×${size.h}`}
          </p>
        </div>
      )}

      {/* The box has the camera image's exact shape and fits inside the free space. */}
      <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 ${
            streaming ? "border-emerald-400" : "border-transparent"
          }`}
          style={{
            aspectRatio: String(aspect),
            width: `min(100cqw, calc(100cqh * ${aspect}))`,
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-fill"
          />
        </div>
      </div>

      {streaming && (
        <div className="flex shrink-0 items-center justify-center gap-5 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <IconButton label="Flip camera" onClick={flip}>
            Flip
          </IconButton>
          <IconButton
            label={paused ? "Resume streaming" : "Pause streaming"}
            active={paused}
            onClick={togglePause}
          >
            {paused ? "Resume" : "Pause"}
          </IconButton>
          {torchSupported && (
            <IconButton label="Torch" active={torchOn} onClick={toggleTorch}>
              Light
            </IconButton>
          )}
        </div>
      )}

      {!streaming && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center">
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
  );
}
