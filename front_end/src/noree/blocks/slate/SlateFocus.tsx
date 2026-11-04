import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { Pt, Stroke } from "../../../shared/protocol.js";
import { applyAction } from "../../../shared/actions.js";
import { docParts, newId, PAGE, readLayout, type ActorRef, type PageItem } from "../../../shared/schema.js";
import { LOCAL_ORIGIN } from "../../doc/actor";
import { uploadAsset, startSlateRun, cancelJob } from "../../lib/api";
import { makeSnapshot } from "../../lib/snapshot";
import { JobTrace } from "./JobTrace";
import { SlatePageCanvas, type Tool } from "./SlatePageCanvas";
import { isStale, useBlockJobs } from "../../doc/useJobs";
import { slateHandles, useCurrentPage, usePageContents } from "./useSlate";
import { WidgetStateProvider } from "./widgetState";

const MAX_PASTE_WIDTH = 640;
const MAX_TEXT_LENGTH = 4000;
/** How long after the last change a fresh page snapshot is saved. */
const SNAPSHOT_IDLE_MS = 3000;

type NewPaste =
  | Omit<Extract<PageItem, { kind: "text" }>, "x" | "y">
  | Omit<Extract<PageItem, { kind: "image" }>, "x" | "y">;

type Props = {
  doc: Y.Doc;
  id: string;
  projectId: string;
  actor: ActorRef;
  /** Called with the person's own name, which they can change while the board is open. */
  personName: string;
  undo: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; newStep: () => void };
  onClose: () => void;
};

function imageSize(file: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PASTE_WIDTH / img.naturalWidth);
      resolve({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be read."));
    };
    img.src = url;
  });
}

/** The full-screen Slate: writing, pasting, pages, and running the AI on the current page. */
export function SlateFocus({ doc, id, projectId, actor, personName, undo, onClose }: Props) {
  const handles = useMemo(() => slateHandles(doc, id), [doc, id]);
  const { page, index, count } = useCurrentPage(handles);
  const { types, strokes, objects, pastes } = usePageContents(page);
  const jobs = useBlockJobs(doc, id);
  const [tool, setTool] = useState<Tool>("pen");
  const [instruction, setInstruction] = useState("");
  const [provider, setProvider] = useState<"baseten" | "meta">("baseten");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const blockTitle = useMemo(() => {
    const block = docParts(doc).blocks.get(id);
    return block ? readLayout(block).title : "Slate";
  }, [doc, id]);
  const pageId = page ? (page.get("id") as string) : null;

  const latestJob = jobs[0];
  const running = !!latestJob && latestJob.status === "running" && !isStale(latestJob, now);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [running]);

  const saveSnapshot = useCallback(async () => {
    if (!types || !page) return null;
    const dataUrl = await makeSnapshot(PAGE, types.strokes.toArray(), [...types.objects.values()], types.pastes.toArray());
    const blob = await (await fetch(dataUrl)).blob();
    const url = await uploadAsset(projectId, blob);
    doc.transact(() => page.set("snapshotAsset", url));
    return url;
  }, [doc, page, types, projectId]);

  /** Other blocks read this image as context, so it's kept current during a session too. */
  useEffect(() => {
    if (!strokes.length && !pastes.length) return;
    const timer = setTimeout(() => void saveSnapshot().catch(() => {}), SNAPSHOT_IDLE_MS);
    return () => clearTimeout(timer);
  }, [strokes, pastes, objects, saveSnapshot]);

  /** And when leaving a page. */
  const saveSnapshotQuietly = useCallback(() => {
    if (strokes.length || pastes.length) void saveSnapshot().catch(() => {});
  }, [saveSnapshot, strokes.length, pastes.length]);

  const close = useCallback(() => {
    saveSnapshotQuietly();
    onClose();
  }, [saveSnapshotQuietly, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const addStroke = useCallback(
    (points: Pt[]) => {
      undo.newStep();
      doc.transact(() => types?.strokes.push([{ id: newId(), points }]), LOCAL_ORIGIN);
      undo.newStep();
    },
    [doc, types, undo],
  );

  const eraseStroke = useCallback(
    (strokeId: string) => {
      if (!types) return;
      const index = types.strokes.toArray().findIndex((s: Stroke) => s.id === strokeId);
      if (index >= 0) doc.transact(() => types.strokes.delete(index), LOCAL_ORIGIN);
    },
    [doc, types],
  );

  const movePaste = useCallback(
    (itemId: string, x: number, y: number) => {
      if (!types) return;
      const list = types.pastes.toArray();
      const at = list.findIndex((p) => p.id === itemId);
      if (at < 0) return;
      const clamped = { ...list[at], x: Math.max(0, Math.min(PAGE.width - list[at].w, x)), y: Math.max(0, Math.min(PAGE.height - list[at].h, y)) };
      doc.transact(() => {
        types.pastes.delete(at);
        types.pastes.insert(at, [clamped]);
      }, LOCAL_ORIGIN);
    },
    [doc, types],
  );

  const addPaste = useCallback(
    (item: NewPaste) => {
      if (!types) return;
      const offset = types.pastes.length % 6;
      const placed = { ...item, x: 80 + offset * 30, y: 80 + offset * 30 } as PageItem;
      undo.newStep();
      doc.transact(() => types.pastes.push([placed]), LOCAL_ORIGIN);
      undo.newStep();
    },
    [doc, types, undo],
  );

  const addImage = useCallback(
    async (file: Blob) => {
      setError(null);
      try {
        const size = await imageSize(file);
        const url = await uploadAsset(projectId, file);
        addPaste({ id: newId(), kind: "image", url, ...size });
      } catch (e) {
        setError(e instanceof Error ? e.message : "That image couldn't be added.");
      }
    },
    [projectId, addPaste],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const image = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (image) {
        e.preventDefault();
        void addImage(image);
        return;
      }
      const text = e.clipboardData?.getData("text/plain").trim();
      if (text) {
        e.preventDefault();
        const clipped = text.slice(0, MAX_TEXT_LENGTH);
        // Roughly fits the text at the size it's drawn.
        const lines = clipped.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 42)), 0);
        addPaste({ id: newId(), kind: "text", text: clipped, w: 560, h: Math.min(PAGE.height - 100, 40 + lines * 28) });
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImage, addPaste]);

  const ask = useCallback(async () => {
    if (!pageId) return;
    setStarting(true);
    setError(null);
    try {
      const snapshotUrl = await saveSnapshot();
      if (!snapshotUrl) return;
      await startSlateRun(projectId, id, {
        pageId,
        snapshotUrl,
        instruction: instruction.trim() || undefined,
        provider,
        person: { id: actor.id, name: personName },
      });
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run couldn't start. Try again.");
    } finally {
      setStarting(false);
    }
  }, [pageId, saveSnapshot, projectId, id, instruction, provider, actor.id, personName]);

  const undoAi = useCallback(() => {
    const present = new Set(objects.map((o) => o.runId));
    const run = jobs.find((j) => j.pageId === pageId && present.has(j.id));
    if (run && pageId) applyAction(doc, { type: "slate.undoRun", blockId: id, pageId, runId: run.id }, actor, LOCAL_ORIGIN);
  }, [objects, jobs, pageId, doc, id, actor]);

  const goToPage = useCallback(
    (delta: number) => {
      if (!handles) return;
      const target = handles.pages.get(index + delta);
      if (!target) return;
      saveSnapshotQuietly();
      doc.transact(() => handles.content.set("currentPageId", target.get("id")));
    },
    [doc, handles, index, saveSnapshotQuietly],
  );

  const addPage = useCallback(() => {
    if (!handles) return;
    saveSnapshotQuietly();
    const { id: newPageId } = applyAction(doc, { type: "slate.page.add", blockId: id }, actor, LOCAL_ORIGIN);
    if (newPageId) doc.transact(() => handles.content.set("currentPageId", newPageId));
  }, [doc, handles, id, actor, saveSnapshotQuietly]);

  if (!types || !page) return null;

  const hasContent = strokes.length > 0 || pastes.length > 0;
  const hasAi = objects.length > 0;
  const buttonBase = "n-btn n-btn--outline n-btn--sm";
  const toolButton = (value: Tool) => (tool === value ? `${buttonBase} !border-n-moss` : buttonBase);

  return (
    <div role="dialog" aria-label={`${blockTitle}, focus mode`} className="fixed inset-0 z-50 flex flex-col bg-n-bg text-n-ink">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-n-line-soft bg-n-surface/90 px-4 py-2.5 backdrop-blur">
        <span className="n-display mr-2 max-w-56 truncate text-[19px]">{blockTitle}</span>
        <button type="button" className={toolButton("pen")} aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>
          Pen
        </button>
        <button type="button" className={toolButton("eraser")} aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}>
          Eraser
        </button>
        <button type="button" className={buttonBase} disabled={!undo.canUndo} onClick={undo.undo}>
          Undo
        </button>
        <button type="button" className={buttonBase} disabled={!undo.canRedo} onClick={undo.redo}>
          Redo
        </button>
        <button type="button" className={buttonBase} disabled={!hasAi || running} onClick={undoAi}>
          Undo AI
        </button>
        <span className="mx-1 flex items-center gap-1" aria-label="Pages">
          <button type="button" className={buttonBase} aria-label="Previous page" disabled={index === 0} onClick={() => goToPage(-1)}>
            ←
          </button>
          <span data-page-indicator className="text-[13px] font-semibold tabular-nums">
            {index + 1} / {count}
          </span>
          <button type="button" className={buttonBase} aria-label="Next page" disabled={index >= count - 1} onClick={() => goToPage(1)}>
            →
          </button>
          <button type="button" className={buttonBase} onClick={addPage}>
            Add page
          </button>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label="Model"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "baseten" | "meta")}
            className="n-field !w-auto !rounded-full !px-3 !py-1.5 !text-[13px]"
          >
            <option value="baseten">Open weights, Baseten</option>
            <option value="meta">Meta API</option>
          </select>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasContent && !running && !starting) void ask();
            }}
            maxLength={2000}
            aria-label="Instruction for the AI"
            placeholder="Optional: tell the AI what to do"
            className="n-field !w-64 !rounded-full !px-3.5 !py-1.5 !text-[13px]"
          />
          {running ? (
            <button type="button" onClick={() => void cancelJob(projectId, latestJob.id)} className="n-btn n-btn--soft n-btn--sm">
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={!hasContent || starting}
              onClick={() => void ask()}
              className="n-btn n-btn--primary n-btn--sm"
            >
              {starting ? "Starting" : "Ask AI"}
            </button>
          )}
          <button type="button" className={buttonBase} onClick={close} title="Close (Esc)">
            Close
          </button>
        </span>
      </header>
      {error && (
        <p role="alert" className="shrink-0 bg-n-danger-soft px-3 py-1.5 text-xs text-n-danger">
          {error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className="slate-scope relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-n-line-soft bg-n-surface shadow-[var(--n-shadow-1)]">
          <WidgetStateProvider map={types.widgetValues}>
            <SlatePageCanvas strokes={strokes} objects={objects} pastes={pastes} tool={tool} onAddStroke={addStroke} onEraseStroke={eraseStroke} onMovePaste={movePaste} />
          </WidgetStateProvider>
          {!hasContent && !hasAi && (
            <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm text-n-ink-3">
              Write something, or paste text or an image, then press Ask AI.
            </p>
          )}
        </main>
        <JobTrace job={latestJob} running={running} now={now} />
      </div>
    </div>
  );
}
