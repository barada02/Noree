export type ShapeKind = "rect" | "circle" | "star" | "text";

export interface CanvasShape {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  fill: string;
  opacity: number;
  rotation: number;
  /** rect + text */
  width?: number;
  height?: number;
  cornerRadius?: number;
  /** circle */
  radius?: number;
  /** star */
  numPoints?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** text */
  text?: string;
  fontSize?: number;
  fontStyle?: string;
}

export const FILL_SWATCHES = [
  "#1c1917",
  "#44403c",
  "#059669",
  "#0f766e",
  "#d97706",
  "#dc2626",
  "#2563eb",
  "#f5f5f4",
] as const;

let counter = 0;

export function nextId(): string {
  counter += 1;
  return `shape-${Date.now().toString(36)}-${counter}`;
}

export function createShape(
  kind: ShapeKind,
  index: number,
): CanvasShape {
  const base = {
    id: nextId(),
    x: 90 + (index % 5) * 36,
    y: 80 + (index % 4) * 32,
    opacity: 1,
    rotation: 0,
  };
  switch (kind) {
    case "rect":
      return {
        ...base,
        kind,
        fill: "#059669",
        width: 180,
        height: 110,
        cornerRadius: 8,
      };
    case "circle":
      return { ...base, kind, fill: "#d97706", radius: 56 };
    case "star":
      return {
        ...base,
        kind,
        fill: "#dc2626",
        numPoints: 5,
        innerRadius: 28,
        outerRadius: 58,
      };
    case "text":
      return {
        ...base,
        kind,
        fill: "#1c1917",
        text: "Double-click to edit",
        fontSize: 22,
        width: 260,
      };
  }
}

export const STARTER_SHAPES: CanvasShape[] = [
  {
    id: "title",
    kind: "text",
    x: 48,
    y: 40,
    fill: "#1c1917",
    opacity: 1,
    rotation: 0,
    text: "Konva canvas",
    fontSize: 34,
    fontStyle: "bold",
    width: 360,
  },
  {
    id: "subtitle",
    kind: "text",
    x: 48,
    y: 86,
    fill: "#57534e",
    opacity: 1,
    rotation: 0,
    text: "Drag shapes, resize with the handles, edit in the inspector.",
    fontSize: 15,
    width: 420,
  },
  {
    id: "card",
    kind: "rect",
    x: 48,
    y: 140,
    fill: "#f5f5f4",
    opacity: 1,
    rotation: 0,
    width: 300,
    height: 170,
    cornerRadius: 10,
  },
  {
    id: "card-accent",
    kind: "rect",
    x: 68,
    y: 160,
    fill: "#059669",
    opacity: 1,
    rotation: 0,
    width: 120,
    height: 18,
    cornerRadius: 4,
  },
  {
    id: "card-text",
    kind: "text",
    x: 68,
    y: 196,
    fill: "#1c1917",
    opacity: 1,
    rotation: 0,
    text: "Scene graph on <canvas>",
    fontSize: 18,
    fontStyle: "bold",
    width: 260,
  },
  {
    id: "card-body",
    kind: "text",
    x: 68,
    y: 228,
    fill: "#57534e",
    opacity: 1,
    rotation: 0,
    text: "Konva owns hit-testing, dragging and transforms. React owns the shape list.",
    fontSize: 13,
    width: 255,
  },
  {
    id: "sun",
    kind: "circle",
    x: 470,
    y: 205,
    fill: "#d97706",
    opacity: 1,
    rotation: 0,
    radius: 52,
  },
  {
    id: "badge",
    kind: "star",
    x: 590,
    y: 300,
    fill: "#dc2626",
    opacity: 1,
    rotation: 12,
    numPoints: 5,
    innerRadius: 26,
    outerRadius: 54,
  },
  {
    id: "block",
    kind: "rect",
    x: 430,
    y: 330,
    fill: "#2563eb",
    opacity: 0.9,
    rotation: -6,
    width: 130,
    height: 84,
    cornerRadius: 8,
  },
];
