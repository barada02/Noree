import { useCallback, useMemo, useState } from "react";
import * as Y from "yjs";
import { inputHash } from "../../../shared/fingerprint.js";
import { docParts, type ActorRef, type Model3dVersion } from "../../../shared/schema.js";
import { LOCAL_ORIGIN } from "../../doc/actor";
import { useLatestJob } from "../../doc/useJobs";
import { useYValue } from "../../doc/useY";
import { generateModel } from "../../lib/api";

type Options = { doc: Y.Doc; id: string; projectId: string; actor: ActorRef; personName: string };

export function useModel3d({ doc, id, projectId, actor, personName }: Options) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const content = parts.content.get(id);
  const { latest, running, stale, now } = useLatestJob(doc, id);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Everything the out-of-date badge depends on: this block, connections, and connected content.
  const state = useYValue([parts.content as never, parts.edges as never, parts.blocks as never], () => {
    const versions = (content?.get("versions") as Y.Array<Model3dVersion> | undefined)?.toArray() ?? [];
    const prompt = String(content?.get("prompt") ?? "");
    const currentId = content?.get("currentVersionId") as string | null | undefined;
    const index = versions.findIndex((v) => v.id === currentId);
    return {
      prompt,
      versions,
      index,
      current: index >= 0 ? versions[index] : null,
      hash: inputHash(doc, id, prompt),
      connected: [...parts.edges.values()].some((edge) => edge.get("target") === id),
    };
  });

  const setPrompt = useCallback(
    (prompt: string) => {
      doc.transact(() => content?.set("prompt", prompt.slice(0, 2000)), LOCAL_ORIGIN);
    },
    [doc, content],
  );

  const showVersion = useCallback(
    (versionId: string) => {
      // Not an undo step: it only changes which result is showing.
      doc.transact(() => content?.set("currentVersionId", versionId));
    },
    [doc, content],
  );

  const generate = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      await generateModel(projectId, id, { person: { id: actor.id, name: personName } });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Generation couldn't start. Try again.");
    } finally {
      setStarting(false);
    }
  }, [projectId, id, actor.id, personName]);

  const failure = latest?.status === "failed" ? (latest.error ?? "The run failed. Try again.") : stale ? "This run stopped responding. Try again." : null;

  return {
    ...state,
    outOfDate: !!state.current && state.current.inputHash !== state.hash,
    canGenerate: !running && !starting && (state.prompt.trim().length > 0 || state.connected),
    job: latest,
    running,
    starting,
    now,
    /** The most recent problem to show: a refused start, or a failed run. */
    error: startError ?? failure,
    progress: running ? (latest?.steps.at(-1)?.title ?? "Starting") : null,
    setPrompt,
    showVersion,
    generate,
  };
}
