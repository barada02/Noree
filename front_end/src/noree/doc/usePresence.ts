import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActorRef, Point } from "../../shared/schema.js";
import { renameLocalActor } from "./actor";

export type Peer = {
  clientId: number;
  id: string;
  name: string;
  color: string;
  cursor: Point | null;
  selected: string[];
};

const COLORS = ["#c2410c", "#0f766e", "#7c3aed", "#be123c", "#1d4ed8", "#a16207", "#15803d", "#a21caf"];
const CURSOR_INTERVAL_MS = 40;

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** Who else is here. Sent through Yjs awareness, so it's live but never saved in the document. */
export function usePresence(provider: HocuspocusProvider, actor: ActorRef) {
  const awareness = provider.awareness;
  const [name, setName] = useState(actor.name);
  const [peers, setPeers] = useState<Peer[]>([]);
  const color = useMemo(() => colorFor(actor.id), [actor.id]);
  const lastCursorAt = useRef(0);

  useEffect(() => {
    awareness?.setLocalStateField("user", { id: actor.id, name, color });
  }, [awareness, actor.id, name, color]);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const next: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as { id: string; name: string; color: string } | undefined;
        if (clientId === awareness.clientID || !user) return;
        next.push({
          clientId,
          id: user.id,
          name: user.name,
          color: user.color,
          cursor: (state.cursor as Point | null | undefined) ?? null,
          selected: (state.selected as string[] | undefined) ?? [],
        });
      });
      setPeers(next);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);

  const setCursor = useCallback(
    (cursor: Point | null) => {
      const now = Date.now();
      if (cursor && now - lastCursorAt.current < CURSOR_INTERVAL_MS) return;
      lastCursorAt.current = now;
      awareness?.setLocalStateField("cursor", cursor);
    },
    [awareness],
  );

  const setSelected = useCallback(
    (selected: string[]) => {
      awareness?.setLocalStateField("selected", selected);
    },
    [awareness],
  );

  const rename = useCallback((next: string) => {
    const trimmed = next.trim().slice(0, 40);
    if (!trimmed) return;
    renameLocalActor(trimmed);
    setName(trimmed);
  }, []);

  return { name, color, peers, setCursor, setSelected, rename };
}
