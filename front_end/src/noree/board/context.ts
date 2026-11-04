import { createContext, useContext } from "react";
import * as Y from "yjs";

export type BoardContextValue = {
  doc: Y.Doc;
  act: (action: unknown) => { id?: string };
  /** The frame a dragged block would land in, so it can be highlighted. */
  hoverFrameId: string | null;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoardContext used outside the board");
  return value;
}
