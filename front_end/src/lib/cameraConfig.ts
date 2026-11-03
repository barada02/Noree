/** Mirrors back_end/src/camera/camera-config.ts. */
export interface CameraConfig {
  fps: number;
  width: number;
  quality: number;
  format: "jpeg" | "webp";
  captureWidth: number;
}

export const DEFAULT_CONFIG: CameraConfig = {
  fps: 10,
  width: 640,
  quality: 0.6,
  format: "jpeg",
  captureWidth: 1280,
};

// Wide on purpose: these are experiment knobs, not product limits.
export const RANGES = {
  fps: { min: 1, max: 30, step: 1 },
  width: { min: 160, max: 1920, step: 80 },
  quality: { min: 0.1, max: 1, step: 0.05 },
  captureWidth: { min: 320, max: 3840, step: 160 },
} as const;

export const PRESETS: { name: string; config: CameraConfig }[] = [
  {
    name: "Smooth",
    config: { fps: 20, width: 480, quality: 0.5, format: "jpeg", captureWidth: 960 },
  },
  { name: "Balanced", config: DEFAULT_CONFIG },
  {
    name: "Sharp",
    config: { fps: 4, width: 1280, quality: 0.85, format: "jpeg", captureWidth: 1920 },
  },
];
