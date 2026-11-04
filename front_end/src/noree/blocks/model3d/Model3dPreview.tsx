import { useState } from "react";
import * as Y from "yjs";
import { useBoardContext } from "../../board/context";
import { useModel3d } from "./useModel3d";

export function StatusBadge({ status }: { status: "approved" | "draft" }) {
  return (
    <span
      data-model-status={status}
      title={status === "draft" ? "This model did not pass review. It may look wrong." : "This model passed the sandbox test and review."}
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
    >
      {status === "approved" ? "Approved" : "Draft"}
    </span>
  );
}

/** A draft of the prompt while typing, so remote edits don't jump the cursor. Saved on leaving the field. */
export function PromptInput({ value, onCommit, onSubmit, className }: { value: string; onCommit: (text: string) => void; onSubmit?: () => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      maxLength={2000}
      aria-label="3D model prompt"
      placeholder="Describe the model"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          onSubmit?.();
        }
      }}
      className={className}
    />
  );
}

/** On the board: the preview image, never live 3D, because browsers limit active WebGL contexts. */
export function Model3dPreview({ doc, id }: { doc: Y.Doc; id: string }) {
  const { projectId, actor, personName } = useBoardContext();
  const model = useModel3d({ doc, id, projectId, actor, personName });
  const { current, running, progress, error, outOfDate } = model;
  const preview = current?.previewAsset?.startsWith("/api/assets/") ? current.previewAsset : null;

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 bg-stone-950">
        {preview ? (
          <img src={preview} alt={current?.brief ?? "Preview of the generated 3D model"} draggable={false} className="h-full w-full object-contain" />
        ) : (
          <p className="flex h-full items-center justify-center px-3 text-center text-xs text-stone-400">
            {current ? "No preview image. Double-click to view it in 3D." : model.connected ? "Press Generate to build this from what's connected." : "Describe a model, or draw a line from another block."}
          </p>
        )}
        {current && (
          <span className="absolute top-1.5 left-1.5 flex gap-1">
            <StatusBadge status={current.status} />
            {outOfDate && !running && (
              <span data-out-of-date title="What this was generated from has changed." className="rounded bg-orange-200 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-orange-950 uppercase">
                Out of date
              </span>
            )}
          </span>
        )}
        {running && (
          <p data-generating className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-2 py-1 text-xs text-white" aria-live="polite">
            {progress}…
          </p>
        )}
        {!running && error && (
          <p role="alert" className="absolute inset-x-0 bottom-0 bg-red-900/95 px-2 py-1 text-xs text-white">
            {error}
          </p>
        )}
      </div>
      <div className="nodrag flex shrink-0 items-center gap-1.5 p-1.5" onDoubleClick={(e) => e.stopPropagation()}>
        <PromptInput
          value={model.prompt}
          onCommit={model.setPrompt}
          className="nokey min-w-0 flex-1 rounded border border-stone-300 bg-transparent px-1.5 py-1 text-xs outline-none focus:border-stone-500 dark:border-stone-700"
        />
        <button
          type="button"
          disabled={!model.canGenerate}
          onClick={() => void model.generate()}
          className="shrink-0 rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
        >
          {running ? "Working" : current ? "Regenerate" : "Generate"}
        </button>
      </div>
    </div>
  );
}
