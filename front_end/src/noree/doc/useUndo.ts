import { useEffect, useState } from "react";
import * as Y from "yjs";
import { docParts } from "../../shared/schema.js";
import { LOCAL_ORIGIN } from "./actor";

/** Undo covers this person's own changes only, never another person's or an agent's. */
export function useUndo(doc: Y.Doc) {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  // Created in the effect and not in render, because the cleanup destroys it.
  useEffect(() => {
    const { blocks, edges, order, content, meta } = docParts(doc);
    const created = new Y.UndoManager([blocks, edges, order, content, meta], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 400,
    });
    const update = () => setState({ canUndo: created.canUndo(), canRedo: created.canRedo() });
    created.on("stack-item-added", update);
    created.on("stack-item-popped", update);
    created.on("stack-cleared", update);
    setManager(created);
    return () => {
      created.destroy();
      setManager(null);
    };
  }, [doc]);

  useEffect(() => {
    if (!manager) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement;
      // Text fields keep their own undo.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        manager.undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        manager.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manager]);

  return {
    ...state,
    undo: () => manager?.undo(),
    redo: () => manager?.redo(),
    /** Starts a new undo step, so quick separate actions aren't undone together. */
    newStep: () => manager?.stopCapturing(),
  };
}
