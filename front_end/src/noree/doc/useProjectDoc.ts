import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { projectExists } from "../lib/projects";

export type ProjectSession =
  | { state: "opening" }
  | { state: "missing" }
  | { state: "ready"; doc: Y.Doc; provider: HocuspocusProvider };

/** How long a first open waits for the server before showing whatever it has. */
const FIRST_SYNC_WAIT_MS = 2500;

function collabUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/collab`;
}

/** Opens a project: the local IndexedDB copy for instant reopening, plus the live connection. */
export function useProjectDoc(projectId: string) {
  const [session, setSession] = useState<ProjectSession>({ state: "opening" });
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Connecting);

  useEffect(() => {
    let cancelled = false;
    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(`noree:${projectId}`, doc);
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: `project:${projectId}`,
      document: doc,
      onStatus: ({ status: next }) => {
        if (!cancelled) setStatus(next);
      },
    });

    const firstSync = new Promise<void>((resolve) => {
      if (provider.isSynced) resolve();
      provider.on("synced", () => resolve());
      setTimeout(resolve, FIRST_SYNC_WAIT_MS);
    });

    void (async () => {
      const exists = await projectExists(projectId);
      if (cancelled) return;
      if (!exists) {
        setSession({ state: "missing" });
        return;
      }
      await Promise.all([local.whenSynced, firstSync]);
      if (!cancelled) setSession({ state: "ready", doc, provider });
    })();

    return () => {
      cancelled = true;
      setSession({ state: "opening" });
      provider.destroy();
      void local.destroy();
      doc.destroy();
    };
  }, [projectId]);

  return { session, status };
}
