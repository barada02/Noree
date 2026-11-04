import { createContext, useContext } from "react";
import * as Y from "yjs";

export type BoardContextValue = {
  doc: Y.Doc;
  act: (action: unknown) => { id?: string };
  /** The frame a dragged block would land in, so it can be highlighted. */
  hoverFrameId: string | null;
  /** Blocks selected by other people, with that person's color. */
  peerSelections: Record<string, string>;
  /** How many blocks each block reads from. */
  sourceCounts: Record<string, number>;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoardContext used outside the board");
  return value;
}
