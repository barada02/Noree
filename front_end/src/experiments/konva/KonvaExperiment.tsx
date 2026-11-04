import type Konva from "konva";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  Layer,
  Line,
  Rect,
  Stage,
  Star,
  Text,
  Transformer,
} from "react-konva";
import { useTheme } from "../../useTheme";
import {
  FILL_SWATCHES,
  STARTER_SHAPES,
  createShape,
  type CanvasShape,
  type ShapeKind,
} from "./shapes";

const STORAGE_KEY = "noree:konva-scene";
const STAGE_HEIGHT = 560;

type Tool = "select" | "pan";

function loadScene(): CanvasShape[] | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const valid = parsed.filter(
      (s): s is CanvasShape =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as CanvasShape).id === "string" &&
        typeof (s as CanvasShape).kind === "string" &&
        typeof (s as CanvasShape).x === "number" &&
        typeof (s as CanvasShape).y === "number",
    );
    return valid.length > 0 ? valid : undefined;
  } catch {
    return undefined;
  }
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

export default function KonvaExperiment() {
  const { theme } = useTheme();
  const [persisted] = useState(loadScene);
  const [shapes, setShapes] = useState<CanvasShape[]>(
    persisted ?? STARTER_SHAPES,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [past, setPast] = useState<CanvasShape[][]>([]);
  const [future, setFuture] = useState<CanvasShape[][]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(
    persisted ? "restored session" : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [stageWidth, setStageWidth] = useState(800);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const editSnapshotRef = useRef<CanvasShape[] | null>(null);

  const selected = shapes.find((s) => s.id === selectedId) ?? null;
  const editingShape = shapes.find((s) => s.id === editingId) ?? null;

  /* ---- persistence + notice ------------------------------------------- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shapes));
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setSavedAt("save failed");
    }
  }, [shapes]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---- responsive stage width ----------------------------------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageWidth(el.clientWidth));
    ro.observe(el);
    setStageWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  /* ---- transformer follows selection ----------------------------------- */
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current.get(selectedId) : undefined;
    tr.nodes(node && tool === "select" ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, shapes, tool, scale]);

  /* ---- history ---------------------------------------------------------- */
  const commit = useCallback(
    (next: CanvasShape[]) => {
      setPast((p) => [...p.slice(-49), shapes]);
      setFuture([]);
      setShapes(next);
    },
    [shapes],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      const prev = p[p.length - 1];
      if (!prev) return p;
      setFuture((f) => [shapes, ...f].slice(0, 50));
      setShapes(prev);
      setSelectedId(null);
      return p.slice(0, -1);
    });
  }, [shapes]);

  const redo = useCallback(() => {
    setFuture((f) => {
      const next = f[0];
      if (!next) return f;
      setPast((p) => [...p.slice(-49), shapes]);
      setShapes(next);
      setSelectedId(null);
      return f.slice(1);
    });
  }, [shapes]);

  function updateSelected(patch: Partial<CanvasShape>, withHistory = true) {
    if (!selected) return;
    const next = shapes.map((s) =>
      s.id === selected.id ? { ...s, ...patch } : s,
    );
    if (withHistory) commit(next);
    else setShapes(next);
  }

  function beginEdit() {
    if (!editSnapshotRef.current) editSnapshotRef.current = shapes;
  }

  function endEdit() {
    const snap = editSnapshotRef.current;
    editSnapshotRef.current = null;
    if (snap && snap !== shapes) {
      setPast((p) => [...p.slice(-49), snap]);
      setFuture([]);
    }
  }

  /* ---- shape operations ------------------------------------------------- */
  function addShape(kind: ShapeKind) {
    const shape = createShape(kind, shapes.length);
    commit([...shapes, shape]);
    setSelectedId(shape.id);
    setTool("select");
    setNotice(`${kind} added`);
  }

  function deleteSelected() {
    if (!selected) return;
    commit(shapes.filter((s) => s.id !== selected.id));
    setSelectedId(null);
    setNotice("Shape deleted");
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: CanvasShape = {
      ...selected,
      id: `shape-${Date.now().toString(36)}-copy`,
      x: selected.x + 18,
      y: selected.y + 18,
    };
    commit([...shapes, copy]);
    setSelectedId(copy.id);
    setNotice("Shape duplicated");
  }

  function reorderSelected(dir: 1 | -1) {
    if (!selected) return;
    const i = shapes.findIndex((s) => s.id === selected.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shapes.length) return;
    const next = [...shapes];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  function resetScene() {
    commit(STARTER_SHAPES);
    setSelectedId(null);
    resetView();
    setNotice("Starter scene restored");
  }

  function clearScene() {
    commit([]);
    setSelectedId(null);
    setNotice("Canvas cleared");
  }

  function resetView() {
    setScale(1);
    setStagePos({ x: 0, y: 0 });
  }

  /* ---- export ------------------------------------------------------------ */
  function exportPng() {
    const stage = stageRef.current;
    if (!stage) return;
    const prevSelection = selectedId;
    setSelectedId(null);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const uri = stage.toDataURL({ pixelRatio: 2 });
        download(uri, "noree-konva.png");
        setSelectedId(prevSelection);
        setNotice("PNG exported");
      }, 30);
    });
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(shapes, null, 2));
      setNotice("Scene JSON copied");
    } catch {
      setNotice("Copy failed");
    }
  }

  /* ---- keyboard ------------------------------------------------------------ */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        editingId !== null;
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key.startsWith("Arrow") && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateSelected({ x: selected.x + dx, y: selected.y + dy }, false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, shapes, editingId, undo, redo]);

  /* ---- stage interactions -------------------------------------------------- */
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const next = Math.min(3, Math.max(0.2, oldScale * (direction > 0 ? 1.06 : 0.94)));
    setScale(next);
    setStagePos({
      x: pointer.x - mousePointTo.x * next,
      y: pointer.y - mousePointTo.y * next,
    });
  }

  function handleDragEnd(shape: CanvasShape, e: Konva.KonvaEventObject<DragEvent>) {
    commit(
      shapes.map((s) =>
        s.id === shape.id ? { ...s, x: e.target.x(), y: e.target.y() } : s,
      ),
    );
  }

  function handleTransformEnd(shape: CanvasShape, e: Konva.KonvaEventObject<Event>) {
    const node = e.target;
    const sx = node.scaleX();
    const sy = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const patch: Partial<CanvasShape> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
    };
    if (shape.kind === "rect" || shape.kind === "text") {
      patch.width = Math.max(20, (shape.width ?? 100) * sx);
      if (shape.kind === "rect") patch.height = Math.max(16, (shape.height ?? 80) * sy);
      if (shape.kind === "text") patch.fontSize = Math.max(8, (shape.fontSize ?? 16) * sy);
    } else if (shape.kind === "circle") {
      patch.radius = Math.max(8, (shape.radius ?? 40) * Math.max(sx, sy));
    } else if (shape.kind === "star") {
      patch.outerRadius = Math.max(10, (shape.outerRadius ?? 50) * Math.max(sx, sy));
      patch.innerRadius = Math.max(5, (shape.innerRadius ?? 24) * Math.max(sx, sy));
    }
    commit(shapes.map((s) => (s.id === shape.id ? { ...s, ...patch } : s)));
  }

  function startTextEdit(shape: CanvasShape) {
    setSelectedId(shape.id);
    setEditingId(shape.id);
    setEditingText(shape.text ?? "");
  }

  function finishTextEdit() {
    if (!editingShape) return;
    commit(
      shapes.map((s) =>
        s.id === editingShape.id ? { ...s, text: editingText } : s,
      ),
    );
    setEditingId(null);
  }

  const gridLines = useMemo(() => {
    const step = 24;
    const w = stageWidth / scale + Math.abs(stagePos.x) / scale + step * 2;
    const h = STAGE_HEIGHT / scale + Math.abs(stagePos.y) / scale + step * 2;
    const startX = Math.floor(-stagePos.x / scale / step) * step - step;
    const startY = Math.floor(-stagePos.y / scale / step) * step - step;
    const lines: { points: number[]; key: string }[] = [];
    for (let x = startX; x < startX + w; x += step) {
      lines.push({ key: `v${x}`, points: [x, startY, x, startY + h] });
    }
    for (let y = startY; y < startY + h; y += step) {
      lines.push({ key: `h${y}`, points: [startX, y, startX + w, y] });
    }
    return lines;
  }, [stageWidth, scale, stagePos]);

  const sceneJson = useMemo(() => JSON.stringify(shapes, null, 2), [shapes]);

  function renderShape(shape: CanvasShape) {
    const common = {
      key: shape.id,
      id: shape.id,
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      opacity: shape.opacity,
      rotation: shape.rotation,
      draggable: tool === "select",
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (tool !== "select") return;
        e.cancelBubble = true;
        setSelectedId(shape.id);
      },
      onTap: (e: Konva.KonvaEventObject<Event>) => {
        if (tool !== "select") return;
        e.cancelBubble = true;
        setSelectedId(shape.id);
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(shape, e),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(shape, e),
      ref: (node: Konva.Node | null) => {
        if (node) nodeRefs.current.set(shape.id, node);
        else nodeRefs.current.delete(shape.id);
      },
    };
    switch (shape.kind) {
      case "rect":
        return (
          <Rect
            {...common}
            width={shape.width ?? 120}
            height={shape.height ?? 80}
            cornerRadius={shape.cornerRadius ?? 6}
          />
        );
      case "circle":
        return <Circle {...common} radius={shape.radius ?? 48} />;
      case "star":
        return (
          <Star
            {...common}
            numPoints={shape.numPoints ?? 5}
            innerRadius={shape.innerRadius ?? 24}
            outerRadius={shape.outerRadius ?? 52}
          />
        );
      case "text":
        return (
          <Text
            {...common}
            text={shape.text ?? ""}
            fontSize={shape.fontSize ?? 18}
            fontStyle={shape.fontStyle ?? "normal"}
            width={shape.width ?? 240}
            onDblClick={() => startTextEdit(shape)}
            onDblTap={() => startTextEdit(shape)}
          />
        );
    }
  }

  const btn =
    "rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800";
  const btnPrimary =
    "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white";
  const labelCls =
    "block font-mono text-[11px] tracking-widest text-stone-500 uppercase dark:text-stone-400";
  const inputCls =
    "mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <p className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
        experiment — 03 / canvas
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Konva</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-stone-600 dark:text-stone-400">
        2D canvas scene graph via{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] dark:bg-stone-800">
          react-konva
        </code>
        . Konva owns rendering, hit-testing and transforms on{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] dark:bg-stone-800">
          &lt;canvas&gt;
        </code>{" "}
        — React owns the shape list, selection and inspector.
        {theme === "dark" ? " The paper stays light so fills export true." : ""}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => addShape("rect")} className={btnPrimary}>
          + Rect
        </button>
        <button type="button" onClick={() => addShape("circle")} className={btn}>
          + Circle
        </button>
        <button type="button" onClick={() => addShape("star")} className={btn}>
          + Star
        </button>
        <button type="button" onClick={() => addShape("text")} className={btn}>
          + Text
        </button>
        <span className="mx-1 hidden h-5 w-px bg-stone-200 sm:block dark:bg-stone-800" />
        <div className="flex overflow-hidden rounded-md border border-stone-300 dark:border-stone-700">
          {(["select", "pan"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={`px-3 py-1.5 text-sm capitalize ${
                tool === t
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" onClick={undo} disabled={past.length === 0} className={`${btn} disabled:opacity-40`}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={future.length === 0} className={`${btn} disabled:opacity-40`}>
          Redo
        </button>
        <button type="button" onClick={exportPng} className={btn}>
          Export PNG
        </button>
        <button type="button" onClick={resetScene} className={btn}>
          Reset scene
        </button>
        <button type="button" onClick={clearScene} className={btn}>
          Clear
        </button>
        <span className="ml-auto flex items-center gap-2 font-mono text-xs text-stone-500 dark:text-stone-400">
          {notice ? (
            <span className="text-emerald-700 dark:text-emerald-400">{notice}</span>
          ) : savedAt ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
              saved {savedAt}
            </>
          ) : (
            "unsaved"
          )}
        </span>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div
            ref={containerRef}
            className="relative h-[560px] min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800"
            style={{ touchAction: "none" }}
          >
            <Stage
              ref={stageRef}
              width={stageWidth}
              height={STAGE_HEIGHT}
              scaleX={scale}
              scaleY={scale}
              x={stagePos.x}
              y={stagePos.y}
              draggable={tool === "pan"}
              onDragEnd={(e) => {
                if (e.target === stageRef.current) {
                  setStagePos({ x: e.target.x(), y: e.target.y() });
                }
              }}
              onWheel={handleWheel}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
              onTouchStart={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
            >
              <Layer listening={false}>
                {gridLines.map((l) => (
                  <Line key={l.key} points={l.points} stroke="#e7e5e4" strokeWidth={1 / scale} />
                ))}
              </Layer>
              <Layer>
                {shapes.map(renderShape)}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  enabledAnchors={[
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                    "top-center",
                    "bottom-center",
                    "middle-left",
                    "middle-right",
                  ]}
                  boundBoxFunc={(_oldBox, newBox) => ({
                    ...newBox,
                    width: Math.max(16, newBox.width),
                    height: Math.max(12, newBox.height),
                  })}
                />
              </Layer>
            </Stage>

            {editingShape?.kind === "text" && (
              <textarea
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={finishTextEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    finishTextEdit();
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="absolute z-10 resize-none rounded border border-emerald-700 bg-white/95 px-1 py-0.5 text-stone-900 outline-none"
                style={{
                  left: stagePos.x + editingShape.x * scale,
                  top: stagePos.y + editingShape.y * scale,
                  width: Math.max(120, (editingShape.width ?? 240) * scale),
                  fontSize: (editingShape.fontSize ?? 18) * scale,
                  lineHeight: 1.2,
                }}
              />
            )}

            {shapes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-stone-400">
                  Empty canvas — add a rect, circle, star or text above.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setScale((s) => Math.max(0.2, s * 0.9))} className={btn} aria-label="Zoom out">
              −
            </button>
            <span className="min-w-14 text-center font-mono text-xs text-stone-500 dark:text-stone-400">
              {Math.round(scale * 100)}%
            </span>
            <button type="button" onClick={() => setScale((s) => Math.min(3, s * 1.1))} className={btn} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={resetView} className={btn}>
              Reset view
            </button>
            <p className="ml-auto font-mono text-[11px] text-stone-500 dark:text-stone-400">
              drag to move · handles resize · scroll zooms · double-click text edits · del removes
            </p>
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-stone-200 dark:border-stone-800">
          <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
              Inspector
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "shapes", value: shapes.length },
                { label: "selected", value: selected ? selected.kind : "—" },
                { label: "zoom", value: `${Math.round(scale * 100)}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-stone-100 px-2 py-2 dark:bg-stone-900">
                  <dt className="font-mono text-[11px] text-stone-500 uppercase dark:text-stone-400">{s.label}</dt>
                  <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="px-4 py-3">
            {selected ? (
              <div className="space-y-4">
                <p className="font-mono text-xs text-stone-500 dark:text-stone-400">
                  {selected.id} · {selected.kind}
                </p>

                {selected.kind === "text" && (
                  <label className={labelCls}>
                    Text
                    <textarea
                      value={selected.text ?? ""}
                      onFocus={beginEdit}
                      onBlur={endEdit}
                      onChange={(e) => updateSelected({ text: e.target.value }, false)}
                      rows={2}
                      className={`${inputCls} font-sans normal-case`}
                    />
                  </label>
                )}

                <div>
                  <p className={labelCls}>Fill</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {FILL_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Fill ${c}`}
                        onClick={() => updateSelected({ fill: c })}
                        className={`h-7 w-7 rounded-md border ${
                          selected.fill === c
                            ? "border-emerald-700 ring-2 ring-emerald-700/30"
                            : "border-stone-300 dark:border-stone-700"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={selected.fill}
                      onFocus={beginEdit}
                      onBlur={endEdit}
                      onChange={(e) => updateSelected({ fill: e.target.value }, false)}
                      className="h-7 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5 dark:border-stone-700 dark:bg-stone-900"
                      aria-label="Custom fill colour"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    X
                    <input
                      type="number"
                      value={Math.round(selected.x)}
                      onFocus={beginEdit}
                      onBlur={endEdit}
                      onChange={(e) => updateSelected({ x: Number(e.target.value) }, false)}
                      className={inputCls}
                    />
                  </label>
                  <label className={labelCls}>
                    Y
                    <input
                      type="number"
                      value={Math.round(selected.y)}
                      onFocus={beginEdit}
                      onBlur={endEdit}
                      onChange={(e) => updateSelected({ y: Number(e.target.value) }, false)}
                      className={inputCls}
                    />
                  </label>
                </div>

                {(selected.kind === "rect" || selected.kind === "text") && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className={labelCls}>
                      Width
                      <input
                        type="number"
                        min={20}
                        value={Math.round(selected.width ?? 120)}
                        onFocus={beginEdit}
                        onBlur={endEdit}
                        onChange={(e) => updateSelected({ width: Number(e.target.value) }, false)}
                        className={inputCls}
                      />
                    </label>
                    {selected.kind === "rect" && (
                      <label className={labelCls}>
                        Height
                        <input
                          type="number"
                          min={16}
                          value={Math.round(selected.height ?? 80)}
                          onFocus={beginEdit}
                          onBlur={endEdit}
                          onChange={(e) => updateSelected({ height: Number(e.target.value) }, false)}
                          className={inputCls}
                        />
                      </label>
                    )}
                    {selected.kind === "text" && (
                      <label className={labelCls}>
                        Font size
                        <input
                          type="number"
                          min={8}
                          value={selected.fontSize ?? 18}
                          onFocus={beginEdit}
                          onBlur={endEdit}
                          onChange={(e) => updateSelected({ fontSize: Number(e.target.value) }, false)}
                          className={inputCls}
                        />
                      </label>
                    )}
                  </div>
                )}

                {selected.kind === "circle" && (
                  <label className={labelCls}>
                    Radius — {Math.round(selected.radius ?? 48)}
                    <input
                      type="range"
                      min={8}
                      max={160}
                      value={selected.radius ?? 48}
                      onPointerDown={beginEdit}
                      onPointerUp={endEdit}
                      onChange={(e) => updateSelected({ radius: Number(e.target.value) }, false)}
                      className="mt-2 w-full accent-emerald-700"
                    />
                  </label>
                )}

                {selected.kind === "star" && (
                  <div className="space-y-3">
                    <label className={labelCls}>
                      Points — {selected.numPoints ?? 5}
                      <input
                        type="range"
                        min={3}
                        max={10}
                        step={1}
                        value={selected.numPoints ?? 5}
                        onPointerDown={beginEdit}
                        onPointerUp={endEdit}
                        onChange={(e) => updateSelected({ numPoints: Number(e.target.value) }, false)}
                        className="mt-2 w-full accent-emerald-700"
                      />
                    </label>
                    <label className={labelCls}>
                      Outer radius — {Math.round(selected.outerRadius ?? 52)}
                      <input
                        type="range"
                        min={10}
                        max={160}
                        value={selected.outerRadius ?? 52}
                        onPointerDown={beginEdit}
                        onPointerUp={endEdit}
                        onChange={(e) => updateSelected({ outerRadius: Number(e.target.value) }, false)}
                        className="mt-2 w-full accent-emerald-700"
                      />
                    </label>
                  </div>
                )}

                <label className={labelCls}>
                  Opacity — {Math.round(selected.opacity * 100)}%
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selected.opacity}
                    onPointerDown={beginEdit}
                    onPointerUp={endEdit}
                    onChange={(e) => updateSelected({ opacity: Number(e.target.value) }, false)}
                    className="mt-2 w-full accent-emerald-700"
                  />
                </label>

                <label className={labelCls}>
                  Rotation — {Math.round(selected.rotation)}°
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={selected.rotation}
                    onPointerDown={beginEdit}
                    onPointerUp={endEdit}
                    onChange={(e) => updateSelected({ rotation: Number(e.target.value) }, false)}
                    className="mt-2 w-full accent-emerald-700"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={duplicateSelected} className={btn}>
                    Duplicate
                  </button>
                  <button type="button" onClick={() => reorderSelected(1)} className={btn}>
                    Bring forward
                  </button>
                  <button type="button" onClick={() => reorderSelected(-1)} className={btn}>
                    Send backward
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                <p>Click a shape to inspect it. Drag to move, use the handles to resize and rotate.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
                  <li>Double-click text to edit it inline</li>
                  <li>Scroll to zoom, Pan tool to move the view</li>
                  <li>Delete, Ctrl/Cmd+Z, Ctrl/Cmd+D supported</li>
                  <li>Arrow keys nudge the selected shape</li>
                </ul>
              </div>
            )}

            <div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-800">
              <div className="flex items-center justify-between">
                <p className={labelCls}>Scene JSON</p>
                <button type="button" onClick={copyJson} className="font-mono text-xs text-emerald-700 hover:underline dark:text-emerald-400">
                  copy
                </button>
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-stone-100 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap dark:bg-stone-900">
                {sceneJson}
              </pre>
              <p className="mt-3 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                Scene state is a plain shape array in React; every change
                serializes to localStorage and reloads on start. Export PNG
                renders the Konva stage at 2×.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
