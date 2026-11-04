import { useEffect, useMemo } from "react";
import * as Y from "yjs";
import { docParts, readLayout, type ActorRef } from "../../../shared/schema.js";
import { cancelJob } from "../../lib/api";
import { JobTrace } from "../slate/JobTrace";
import { ModelViewer } from "./ModelViewer";
import { PromptInput, StatusBadge } from "./Model3dPreview";
import { useModel3d } from "./useModel3d";

type Props = { doc: Y.Doc; id: string; projectId: string; actor: ActorRef; personName: string; onClose: () => void };

const BUTTON = "n-btn n-btn--outline n-btn--sm";

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
    <div role="dialog" aria-label={`${title}, focus mode`} className="fixed inset-0 z-50 flex flex-col bg-n-bg text-n-ink">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-n-line-soft bg-n-surface/90 px-4 py-2.5 backdrop-blur">
        <span className="n-display mr-2 max-w-56 truncate text-[19px]">{title}</span>
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
        {model.outOfDate && !running && <span className="n-chip n-chip--warn">Out of date</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <PromptInput
            value={model.prompt}
            onCommit={model.setPrompt}
            className="n-field !w-72 !rounded-full !px-3.5 !py-1.5 !text-[13px]"
          />
          {running && job ? (
            <button type="button" onClick={() => void cancelJob(projectId, job.id)} className="n-btn n-btn--soft n-btn--sm">
              Stop
            </button>
          ) : (
            <button type="button" disabled={!model.canGenerate} onClick={() => void model.generate()} className="n-btn n-btn--primary n-btn--sm">
              {model.starting ? "Starting" : current ? "Regenerate" : "Generate"}
            </button>
          )}
          <button type="button" className={BUTTON} onClick={onClose} title="Close (Esc)">
            Close
          </button>
        </span>
      </header>
      {model.error && !running && (
        <p role="alert" className="shrink-0 bg-n-danger-soft px-3 py-1.5 text-xs text-n-danger">
          {model.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-n-line-soft bg-stone-950">
          {current ? (
            <ModelViewer codeAsset={current.codeAsset} />
          ) : (
            <p className="flex h-full items-center justify-center px-6 text-center text-sm text-n-ink-3">
              {running ? "Generating. This can take a few minutes, and you can close this and keep working." : "Describe a model and press Generate."}
            </p>
          )}
        </main>
        <JobTrace job={job} running={running} now={now} />
      </div>
    </div>
  );
}
