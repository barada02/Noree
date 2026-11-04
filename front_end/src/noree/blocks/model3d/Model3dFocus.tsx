import { useEffect, useMemo } from "react";
import * as Y from "yjs";
import { docParts, readLayout, type ActorRef } from "../../../shared/schema.js";
import { cancelJob } from "../../lib/api";
import { JobTrace } from "../slate/JobTrace";
import { ModelViewer } from "./ModelViewer";
import { PromptInput, StatusBadge } from "./Model3dPreview";
import { useModel3d } from "./useModel3d";

type Props = { doc: Y.Doc; id: string; projectId: string; actor: ActorRef; personName: string; onClose: () => void };

const BUTTON = "rounded-md border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800";

/** Full screen, with the one live 3D view at a time. */
export function Model3dFocus({ doc, id, projectId, actor, personName, onClose }: Props) {
  const model = useModel3d({ doc, id, projectId, actor, personName });
  const { current, versions, index, running, job, now } = model;

  const title = useMemo(() => {
    const block = docParts(doc).blocks.get(id);
    return block ? readLayout(block).title : "3D model";
  }, [doc, id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={`${title}, focus mode`} className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
        <span className="mr-1 max-w-48 truncate text-sm font-medium">{title}</span>
        {versions.length > 0 && (
          <span className="flex items-center gap-1" aria-label="Versions">
            <button type="button" className={BUTTON} aria-label="Previous version" disabled={index <= 0} onClick={() => model.showVersion(versions[index - 1].id)}>
              ←
            </button>
            <span data-version-indicator className="font-mono text-xs tabular-nums">
              {index + 1} / {versions.length}
            </span>
            <button type="button" className={BUTTON} aria-label="Next version" disabled={index >= versions.length - 1} onClick={() => model.showVersion(versions[index + 1].id)}>
              →
            </button>
          </span>
        )}
        {current && <StatusBadge status={current.status} />}
        {model.outOfDate && !running && <span className="rounded bg-orange-200 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-orange-950 uppercase">Out of date</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <PromptInput
            value={model.prompt}
            onCommit={model.setPrompt}
            className="w-72 rounded-md border border-stone-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-stone-500 dark:border-stone-700"
          />
          {running && job ? (
            <button type="button" onClick={() => void cancelJob(projectId, job.id)} className="rounded-md bg-stone-600 px-3 py-1 text-xs font-medium text-white">
              Stop
            </button>
          ) : (
            <button type="button" disabled={!model.canGenerate} onClick={() => void model.generate()} className="rounded-md bg-orange-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">
              {model.starting ? "Starting" : current ? "Regenerate" : "Generate"}
            </button>
          )}
          <button type="button" className={BUTTON} onClick={onClose} title="Close (Esc)">
            Close
          </button>
        </span>
      </header>
      {model.error && !running && (
        <p role="alert" className="shrink-0 bg-red-50 px-3 py-1.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
          {model.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-stone-300 bg-stone-950 dark:border-stone-700">
          {current ? (
            <ModelViewer codeAsset={current.codeAsset} />
          ) : (
            <p className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-400">
              {running ? "Generating. This can take a few minutes, and you can close this and keep working." : "Describe a model and press Generate."}
            </p>
          )}
        </main>
        <JobTrace job={job} running={running} now={now} />
      </div>
    </div>
  );
}
