import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { docParts, initDoc } from "../../shared/schema.js";

/** Opens the project's document. The IndexedDB copy makes reopening instant. M2 adds the network. */
export function useProjectDoc(projectId: string): Y.Doc | null {
  const [ready, setReady] = useState<Y.Doc | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(`noree:${projectId}`, doc);
    let cancelled = false;
    void local.whenSynced.then(() => {
      if (cancelled) return;
      if (!docParts(doc).meta.has("title")) initDoc(doc, "Untitled project");
      setReady(doc);
    });
    return () => {
      cancelled = true;
      setReady(null);
      void local.destroy();
      doc.destroy();
    };
  }, [projectId]);

  return ready;
}
