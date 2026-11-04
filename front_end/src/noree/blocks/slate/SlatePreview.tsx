import { useMemo } from "react";
import * as Y from "yjs";
import { SlatePageCanvas } from "./SlatePageCanvas";
import { slateHandles, useCurrentPage, usePageContents } from "./useSlate";
import { WidgetStateProvider } from "./widgetState";

/** The current page on the board: read-only, so dragging it moves the block. */
export function SlatePreview({ doc, id }: { doc: Y.Doc; id: string }) {
  const handles = useMemo(() => slateHandles(doc, id), [doc, id]);
  const { page, index, count } = useCurrentPage(handles);
  const { types, strokes, objects, pastes } = usePageContents(page);
  if (!types) return null;
  const empty = strokes.length === 0 && objects.length === 0 && pastes.length === 0;
  return (
    <div className="slate-scope relative h-full w-full bg-white">
      <WidgetStateProvider map={types.widgetValues}>
        <SlatePageCanvas strokes={strokes} objects={objects} pastes={pastes} />
      </WidgetStateProvider>
      {empty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-500">
          Double-click to write
        </p>
      )}
      {count > 1 && (
        <span className="pointer-events-none absolute right-2 bottom-1 font-mono text-[10px] text-stone-500">
          {index + 1} / {count}
        </span>
      )}
    </div>
  );
}
