/** Stream parameters the laptop tunes live; the phone applies them. */
export interface CameraConfig {
  /** Target frames per second sent by the phone. */
  fps: number;
  /** Width in px of each sent frame (height follows the aspect ratio). */
  width: number;
  /** Encoder quality, 0..1. */
  quality: number;
  format: 'jpeg' | 'webp';
  /** Width the phone asks its camera for (frames are downscaled from this). */
  captureWidth: number;
}

export const DEFAULT_CONFIG: CameraConfig = {
  fps: 10,
  width: 640,
  quality: 0.6,
  format: 'jpeg',
  captureWidth: 1280,
};

// Deliberately wide: these are knobs for experiments, not product limits.
const RANGES = {
  fps: [1, 30],
  width: [160, 1920],
  quality: [0.1, 1],
  captureWidth: [320, 3840],
} as const;

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeConfig(
  input: unknown,
  base: CameraConfig = DEFAULT_CONFIG,
): CameraConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    fps: clamp(raw.fps, RANGES.fps, base.fps),
    width: Math.round(clamp(raw.width, RANGES.width, base.width)),
    quality: clamp(raw.quality, RANGES.quality, base.quality),
    format: raw.format === 'webp' || raw.format === 'jpeg' ? raw.format : base.format,
    captureWidth: Math.round(clamp(raw.captureWidth, RANGES.captureWidth, base.captureWidth)),
  };
}
