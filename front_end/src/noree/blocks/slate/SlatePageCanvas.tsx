import { memo, useId, useRef, useState } from "react";
import type { AiObject, Pt, Stroke } from "../../../shared/protocol.js";
import { PAGE, type PageItem } from "../../../shared/schema.js";
import { distToPolyline, strokePath } from "../../lib/path";
import { AiLayer } from "./AiLayer";
import "./slate.css";

export type Tool = "pen" | "eraser";

const StrokeView = memo(function StrokeView({ s }: { s: Stroke }) {
  return <path className="ink" d={strokePath(s.points)} />;
});

/** Removes points that add nothing, so a page's ink stays small in the shared document. */
export function simplify(points: Pt[], tolerance = 1): Pt[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  let furthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance = Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
    if (distance > furthest) {
      furthest = distance;
      index = i;
    }
  }
  if (furthest <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function PastedItem({ item, editable, onMove }: { item: PageItem; editable: boolean; onMove?: (id: string, x: number, y: number) => void }) {
  const drag = useRef<{ startX: number; startY: number; x: number; y: number; scale: number } | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const at = offset ?? { x: item.x, y: item.y };

  const handlers = editable
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const svg = e.currentTarget.closest("svg");
          const scale = svg ? PAGE.width / svg.getBoundingClientRect().width : 1;
          drag.current = { startX: e.clientX, startY: e.clientY, x: item.x, y: item.y, scale };
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.x + (e.clientX - d.startX) * d.scale, y: d.y + (e.clientY - d.startY) * d.scale });
        },
        onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          if (drag.current && offset) onMove?.(item.id, Math.round(offset.x), Math.round(offset.y));
          drag.current = null;
          setOffset(null);
        },
      }
    : {};

  return (
    <foreignObject x={at.x} y={at.y} width={item.w} height={item.h}>
      <div {...handlers} data-paste={item.kind} className={`h-full w-full ${editable ? "cursor-move" : ""}`}>
        {item.kind === "text" ? (
          <div className="h-full w-full overflow-hidden rounded-lg border border-stone-300 bg-amber-50 p-3 text-[22px] leading-7 whitespace-pre-wrap text-stone-900">{item.text}</div>
        ) : (
          // Only our own asset path is ever rendered, whatever someone writes into the document.
          item.url.startsWith("/api/assets/") && <img src={item.url} alt="Pasted on this page" draggable={false} className="h-full w-full rounded-lg object-contain" />
        )}
      </div>
    </foreignObject>
  );
}

type Props = {
  strokes: Stroke[];
  objects: AiObject[];
  pastes: PageItem[];
  /** Left out for the read-only board preview. */
  tool?: Tool;
  onAddStroke?: (points: Pt[]) => void;
  onEraseStroke?: (id: string) => void;
  onMovePaste?: (id: string, x: number, y: number) => void;
};

/** One Slate page. From ink-agent's Whiteboard, with its data coming from the shared document. */
export function SlatePageCanvas({ strokes, objects, pastes, tool, onAddStroke, onEraseStroke, onMovePaste }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef<Pt[] | null>(null);
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const patternId = useId();
  const editable = !!tool;

  function toWorld(e: React.PointerEvent): Pt {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const w = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.round(w.x * 10) / 10, Math.round(w.y * 10) / 10];
  }

  function erase(p: Pt) {
    for (const s of strokes) if (distToPolyline(s.points, p) < 16) onEraseStroke?.(s.id);
  }

  function down(e: React.PointerEvent) {
    if (!editable || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    if (tool === "eraser") return erase(p);
    draftRef.current = [p];
    setDraft([p]);
  }

  function move(e: React.PointerEvent) {
    if (!editable || e.buttons === 0) return;
    const p = toWorld(e);
    if (tool === "eraser") return erase(p);
    const d = draftRef.current;
    if (!d) return;
    const last = d[d.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
    d.push(p);
    setDraft([...d]);
  }

  function up() {
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (d && d.length) onAddStroke?.(simplify(d));
  }

  return (
    <svg
      ref={svgRef}
      className={`board ${editable ? `tool-${tool}` : "pointer-events-none"}`}
      data-slate-page={editable ? "focus" : "preview"}
      viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <defs>
        <pattern id={patternId} width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="1.6" className="dot" />
        </pattern>
      </defs>
      <rect width={PAGE.width} height={PAGE.height} className="paper" />
      <rect width={PAGE.width} height={PAGE.height} fill={`url(#${patternId})`} />
      {pastes.map((item) => (
        <PastedItem key={item.id} item={item} editable={editable} onMove={onMovePaste} />
      ))}
      <g>
        {strokes.map((s) => (
          <StrokeView key={s.id} s={s} />
        ))}
        {draft && <path className="ink" d={strokePath(draft)} />}
      </g>
      <AiLayer objects={objects} />
    </svg>
  );
}
