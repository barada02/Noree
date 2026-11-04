import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { AiObject, Stroke } from "../../../shared/protocol.js";
import { docParts, type JobStep, type PageItem } from "../../../shared/schema.js";

export type SlateHandles = {
  content: Y.Map<unknown>;
  pages: Y.Array<Y.Map<unknown>>;
};

export function slateHandles(doc: Y.Doc, blockId: string): SlateHandles | null {
  const content = docParts(doc).content.get(blockId);
  const pages = content?.get("pages");
  return content && pages instanceof Y.Array ? { content, pages: pages as Y.Array<Y.Map<unknown>> } : null;
}

/** Which page is showing, shared by everyone on the board, and how many pages there are. */
export function useCurrentPage(handles: SlateHandles | null) {
  const read = () => {
    if (!handles) return { page: null as Y.Map<unknown> | null, index: 0, count: 0 };
    const pages = handles.pages.toArray();
    const currentId = handles.content.get("currentPageId");
    const index = Math.max(0, pages.findIndex((p) => p.get("id") === currentId));
    return { page: pages[index] ?? null, index, count: pages.length };
  };
  const [state, setState] = useState(read);

  useEffect(() => {
    if (!handles) return;
    const update = () => setState(read());
    update();
    handles.content.observe(update);
    handles.pages.observe(update);
    return () => {
      handles.content.unobserve(update);
      handles.pages.unobserve(update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles]);

  return state;
}

/** The live contents of one page. */
export function usePageContents(page: Y.Map<unknown> | null) {
  const types = useMemo(
    () =>
      page
        ? {
            strokes: page.get("strokes") as Y.Array<Stroke>,
            objects: page.get("objects") as Y.Map<AiObject>,
            pastes: page.get("pastes") as Y.Array<PageItem>,
            widgetValues: page.get("widgetValues") as Y.Map<unknown>,
          }
        : null,
    [page],
  );
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [objects, setObjects] = useState<AiObject[]>([]);
  const [pastes, setPastes] = useState<PageItem[]>([]);

  useEffect(() => {
    if (!types) {
      setStrokes([]);
      setObjects([]);
      setPastes([]);
      return;
    }
    const onStrokes = () => setStrokes(types.strokes.toArray());
    const onObjects = () => setObjects([...types.objects.values()]);
    const onPastes = () => setPastes(types.pastes.toArray());
    onStrokes();
    onObjects();
    onPastes();
    types.strokes.observe(onStrokes);
    types.objects.observe(onObjects);
    types.pastes.observe(onPastes);
    return () => {
      types.strokes.unobserve(onStrokes);
      types.objects.unobserve(onObjects);
      types.pastes.unobserve(onPastes);
    };
  }, [types]);

  return { types, strokes, objects, pastes };
}

export type JobView = {
  id: string;
  status: "running" | "done" | "failed" | "cancelled";
  steps: JobStep[];
  error?: string;
  pageId?: string;
  startedAt: number;
  heartbeatAt: number;
  startedBy?: { name: string };
};

const STALE_AFTER_MS = 60_000;

/** A run with no heartbeat for a minute has died, so nobody waits on it forever. */
export function isStale(job: JobView, now: number) {
  return job.status === "running" && now - job.heartbeatAt > STALE_AFTER_MS;
}

/** This block's runs, newest first. */
export function useBlockJobs(doc: Y.Doc, blockId: string): JobView[] {
  const { jobs } = useMemo(() => docParts(doc), [doc]);
  const [list, setList] = useState<JobView[]>([]);

  useEffect(() => {
    const update = () => {
      const next: JobView[] = [];
      jobs.forEach((job) => {
        if (job.get("blockId") === blockId) next.push(job.toJSON() as JobView);
      });
      next.sort((a, b) => b.startedAt - a.startedAt);
      setList(next);
    };
    update();
    jobs.observeDeep(update);
    return () => jobs.unobserveDeep(update);
  }, [jobs, blockId]);

  return list;
}
