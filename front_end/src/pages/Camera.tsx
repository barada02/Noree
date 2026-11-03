import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Socket } from "socket.io-client";
import {
  DEFAULT_CONFIG,
  PRESETS,
  RANGES,
  type CameraConfig,
} from "../lib/cameraConfig";
import {
  connectCameraSocket,
  type CreateAck,
  type PhoneStats,
} from "../lib/cameraSocket";

type Status = "connecting" | "waiting" | "live" | "phone-left" | "error";

function Slider({
  label,
  value,
  display,
  range,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between font-mono text-xs text-white/60">
        <span>{label}</span>
        <span className="text-white">{display}</span>
      </span>
      <input
        type="range"
        {...range}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-white"
      />
    </label>
  );
}

export default function Camera() {
  const [status, setStatus] = useState<Status>("connecting");
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [frameSize, setFrameSize] = useState({ w: 4, h: 3 });
  const [config, setConfig] = useState<CameraConfig>(DEFAULT_CONFIG);
  const [recv, setRecv] = useState({ fps: 0, kbps: 0 });
  const [phone, setPhone] = useState<PhoneStats | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const configRef = useRef(config);
  const pushTimer = useRef(0);

  // Dropping the socket makes the server end this laptop's sessions (and tell a
  // paired phone), then reconnecting creates a fresh session with a new QR code.
  const newCode = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    setPairUrl(null);
    setHasFrame(false);
    setPhone(null);
    setRecv({ fps: 0, kbps: 0 });
    setStatus("connecting");
    socket.disconnect().connect();
  }, []);

  // Update the sliders at once, send to the phone shortly after the last change.
  const updateConfig = useCallback((patch: Partial<CameraConfig>) => {
    const next = { ...configRef.current, ...patch };
    configRef.current = next;
    setConfig(next);
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(
      () => socketRef.current?.emit("config:set", next),
      120,
    );
  }, []);

  useEffect(() => {
    const socket = connectCameraSocket();
    socketRef.current = socket;

    // Frames can arrive faster than they decode; only the newest one is kept.
    let decoding = false;
    let pending: ArrayBuffer | null = null;
    let frames = 0;
    let bytes = 0;
    let shown = false;

    const draw = async (buf: ArrayBuffer) => {
      decoding = true;
      try {
        const bitmap = await createImageBitmap(new Blob([buf]));
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            setFrameSize({ w: bitmap.width, h: bitmap.height });
          }
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
        if (!shown) {
          shown = true;
          setHasFrame(true);
        }
      } catch {
        // a corrupt frame is just skipped
      } finally {
        decoding = false;
        if (pending) {
          const next = pending;
          pending = null;
          void draw(next);
        }
      }
    };

    // A fresh session is needed on every (re)connect: the server drops a
    // laptop's sessions as soon as its socket disconnects.
    socket.on("connect", async () => {
      shown = false;
      const res = (await socket.emitWithAck("session:create", {
        config: configRef.current,
      })) as CreateAck;
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
    socket.on("stats", setPhone);

    socket.on("frame", (data: ArrayBuffer) => {
      frames++;
      bytes += data.byteLength;
      if (decoding) pending = data;
      else void draw(data);
    });

    const meter = window.setInterval(() => {
      setRecv({ fps: frames * 2, kbps: Math.round((bytes * 2 * 8) / 1000) });
      frames = 0;
      bytes = 0;
    }, 500);

    return () => {
      window.clearInterval(meter);
      window.clearTimeout(pushTimer.current);
      socket.disconnect();
    };
  }, []);

  const select =
    "mt-1 w-full rounded bg-white/10 px-2 py-1.5 font-mono text-xs text-white";

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
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

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <p className="pt-6 font-mono text-xs tracking-widest uppercase text-white/50">
          Experiment
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Phone camera link
        </h1>
        <p className="mt-3 max-w-xl text-white/70">
          Scan the code with your phone. Its camera streams frames here, the
          same frames a multimodal model would receive. Tune the stream below;
          the phone applies changes instantly.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-8">
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
                {status === "live" && "Phone connected"}
                {status === "phone-left" &&
                  "Phone disconnected. It can rejoin without rescanning."}
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

            <div className="space-y-4">
              <p className="font-mono text-xs tracking-widest uppercase text-white/50">
                Stream settings
              </p>
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => updateConfig(p.config)}
                    className="flex-1 rounded border border-white/30 py-1.5 font-mono text-xs hover:bg-white hover:text-black"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <Slider
                label="Frame rate"
                value={config.fps}
                display={`${config.fps} fps`}
                range={RANGES.fps}
                onChange={(fps) => updateConfig({ fps })}
              />
              <Slider
                label="Frame width"
                value={config.width}
                display={`${config.width}px`}
                range={RANGES.width}
                onChange={(width) => updateConfig({ width })}
              />
              <Slider
                label="Quality"
                value={config.quality}
                display={config.quality.toFixed(2)}
                range={RANGES.quality}
                onChange={(quality) => updateConfig({ quality })}
              />
              <Slider
                label="Camera resolution"
                value={config.captureWidth}
                display={`${config.captureWidth}px`}
                range={RANGES.captureWidth}
                onChange={(captureWidth) => updateConfig({ captureWidth })}
              />
              <label className="block">
                <span className="font-mono text-xs text-white/60">Format</span>
                <select
                  value={config.format}
                  onChange={(e) =>
                    updateConfig({ format: e.target.value as CameraConfig["format"] })
                  }
                  className={select}
                >
                  <option value="jpeg" className="text-black">
                    JPEG
                  </option>
                  <option value="webp" className="text-black">
                    WebP (smaller; not on iPhone)
                  </option>
                </select>
              </label>
            </div>
          </aside>

          <div>
            {/* Same shape as the phone's green frame, as large as fits. */}
            <div className="@container w-full">
              <div
                className="mx-auto grid place-items-center overflow-hidden rounded-lg border border-white/20 bg-white/5"
                style={{
                  aspectRatio: hasFrame
                    ? `${frameSize.w} / ${frameSize.h}`
                    : "16 / 9",
                  width: hasFrame
                    ? `min(100cqw, calc(75vh * ${frameSize.w / frameSize.h}))`
                    : "100%",
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={hasFrame ? "h-full w-full" : "hidden"}
                />
                {!hasFrame && (
                  <span className="font-mono text-xs text-white/40">
                    No frames yet
                  </span>
                )}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
              {[
                ["Received", `${recv.fps} fps`],
                ["Bandwidth", `${recv.kbps} kbps`],
                [
                  "Frame",
                  hasFrame
                    ? `${frameSize.w}×${frameSize.h}${phone ? ` · ${phone.kb} KB` : ""}`
                    : "–",
                ],
                ["Phone → server", phone ? `${phone.rtt} ms` : "–"],
                ["Phone sent", phone ? `${phone.sent} fps` : "–"],
                ["Skipped", phone ? `${phone.dropped}/s` : "–"],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-white/15 px-3 py-2">
                  <dt className="text-white/50">{k}</dt>
                  <dd className="mt-0.5 text-sm text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
