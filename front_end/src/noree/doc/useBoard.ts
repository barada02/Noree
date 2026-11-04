import {
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { ActionError, applyAction, connectionProblem } from "../../shared/actions.js";
import {
  docParts,
  newId,
  readEdge,
  readLayout,
  type ActorRef,
  type BlockLayout,
  type BlockType,
  type Point,
} from "../../shared/schema.js";
import { LOCAL_ORIGIN } from "./actor";

export type BlockData = { blockType: BlockType; title: string; color?: string };
export type BoardNode = Node<BlockData, "block" | "frame">;

const WRITE_INTERVAL_MS = 50;

function toNode(layout: BlockLayout, previous: BoardNode | undefined, keepLocal: boolean): BoardNode {
  const local = keepLocal && previous;
  const position = local ? previous.position : { x: layout.x, y: layout.y };
  const width = local ? previous.width : layout.w;
  const height = local ? previous.height : layout.h;
  const parentId = layout.parentId ?? undefined;
  const nodeType = layout.type === "frame" ? "frame" : "block";

  // Reusing unchanged objects keeps React Flow from re-rendering every block on each update.
  if (
    previous &&
    previous.type === nodeType &&
    previous.position.x === position.x &&
    previous.position.y === position.y &&
    previous.width === width &&
    previous.height === height &&
    previous.parentId === parentId &&
    previous.data.title === layout.title &&
    previous.data.color === layout.color
  ) {
    return previous;
  }
  return {
    id: layout.id,
    type: nodeType,
    position,
    width,
    height,
    parentId,
    // Frames sit behind loose blocks, so a block dragged over a frame stays visible.
    zIndex: layout.type === "frame" ? 0 : 1,
    data: { blockType: layout.type, title: layout.title, color: layout.color },
    selected: previous?.selected,
    dragging: previous?.dragging,
    measured: previous?.measured,
  };
}

/**
 * The one bridge between the document and React Flow. Written by hand because React Flow's own Yjs
 * example is Pro-licensed. The document is the truth. `nodes` is a view of it, plus the per-person
 * state React Flow needs (selection, and the live position of whatever this person is dragging).
 */
export function useBoard(doc: Y.Doc, actor: ActorRef) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  /** Blocks this person is dragging or resizing. The document must not overwrite their position. */
  const active = useRef(new Set<string>());
  const pendingMoves = useRef(new Map<string, Point>());
  const pendingSizes = useRef(new Map<string, { w: number; h: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    const layouts = [...parts.blocks.values()].map(readLayout);
    // React Flow needs parents before their children.
    layouts.sort((a, b) => Number(b.type === "frame") - Number(a.type === "frame"));
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return layouts.map((l) => toNode(l, byId.get(l.id), active.current.has(l.id)));
    });
    setEdges((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      return [...parts.edges.values()].map(readEdge).map(
        (e): Edge =>
          byId.get(e.id) ?? {
            id: e.id,
            source: e.source,
            target: e.target,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
      );
    });
  }, [parts]);

  useEffect(() => {
    refresh();
    parts.blocks.observeDeep(refresh);
    parts.edges.observeDeep(refresh);
    return () => {
      parts.blocks.unobserveDeep(refresh);
      parts.edges.unobserveDeep(refresh);
    };
  }, [parts, refresh]);

  const act = useCallback(
    (action: unknown) => {
      try {
        return applyAction(doc, action, actor, LOCAL_ORIGIN);
      } catch (error) {
        // Someone else may have just deleted this block. Anything else is a real bug.
        if (error instanceof ActionError) {
          console.warn(error.message);
          return {};
        }
        throw error;
      }
    },
    [doc, actor],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!pendingMoves.current.size && !pendingSizes.current.size) return;
    doc.transact(() => {
      for (const [id, to] of pendingMoves.current) act({ type: "block.move", id, to });
      for (const [id, size] of pendingSizes.current) act({ type: "block.resize", id, size });
    }, LOCAL_ORIGIN);
    pendingMoves.current.clear();
    pendingSizes.current.clear();
  }, [doc, act]);

  useEffect(() => () => flush(), [flush]);

  const scheduleWrite = useCallback(() => {
    if (!timer.current) timer.current = setTimeout(flush, WRITE_INTERVAL_MS);
  }, [flush]);

  const onNodesChange = useCallback(
    (changes: NodeChange<BoardNode>[]) => {
      // Deletion goes through deleteSelected, so frames can keep their children.
      const visible = changes.filter((c) => c.type !== "remove");
      setNodes((prev) => applyNodeChanges(visible, prev));

      let finished = false;
      for (const change of changes) {
        if (change.type === "position") {
          if (change.dragging) active.current.add(change.id);
          if (change.position && (change.dragging || active.current.has(change.id))) {
            pendingMoves.current.set(change.id, change.position);
          }
          if (change.dragging === false) finished = true;
        } else if (change.type === "dimensions" && change.resizing !== undefined) {
          if (change.resizing) active.current.add(change.id);
          if (change.dimensions && change.setAttributes) {
            pendingSizes.current.set(change.id, {
              w: Math.round(change.dimensions.width),
              h: Math.round(change.dimensions.height),
            });
          }
          if (!change.resizing) {
            flush();
            active.current.delete(change.id);
          }
        }
      }
      if (finished) flush();
      else scheduleWrite();
    },
    [flush, scheduleWrite],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes.filter((c) => c.type !== "remove"), prev));
  }, []);

  /** Where a block is dropped decides its frame. Uses its center, so a slight overlap doesn't count. */
  const frameAt = useCallback(
    (center: Point): string | null => {
      for (const block of parts.blocks.values()) {
        const l = readLayout(block);
        if (l.type !== "frame") continue;
        if (center.x >= l.x && center.x <= l.x + l.w && center.y >= l.y && center.y <= l.y + l.h) return l.id;
      }
      return null;
    },
    [parts],
  );

  const finishDrag = useCallback(
    (dragged: { id: string; center: Point; isFrame: boolean; parentId?: string }[]) => {
      flush();
      const ids = new Set(dragged.map((d) => d.id));
      doc.transact(() => {
        for (const item of dragged) {
          active.current.delete(item.id);
          // A child moving along with its selected frame stays where it is.
          if (item.isFrame || (item.parentId && ids.has(item.parentId))) continue;
          const frameId = frameAt(item.center);
          // Re-assigning to the same frame still grows it to fit.
          if (frameId || item.parentId) act({ type: "frame.assign", blockId: item.id, frameId });
        }
      }, LOCAL_ORIGIN);
      refresh();
    },
    [doc, act, flush, frameAt, refresh],
  );

  const addBlock = useCallback(
    (blockType: BlockType, at: Point) => {
      const id = newId();
      act({ type: "block.add", blockType, at, id });
      setNodes((prev) => prev.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })));
      return id;
    },
    [act],
  );

  const deleteSelected = useCallback(
    (selectedNodes: { id: string }[], selectedEdges: { id: string }[]) => {
      doc.transact(() => {
        for (const e of selectedEdges) act({ type: "edge.delete", id: e.id });
        for (const n of selectedNodes) act({ type: "block.delete", id: n.id });
      }, LOCAL_ORIGIN);
    },
    [doc, act],
  );

  const connect = useCallback(
    (source: string, target: string) => {
      act({ type: "edge.add", source, target });
    },
    [act],
  );

  const canConnect = useCallback((source: string, target: string) => connectionProblem(doc, source, target) === null, [doc]);

  return { nodes, edges, onNodesChange, onEdgesChange, frameAt, finishDrag, addBlock, deleteSelected, connect, canConnect, act };
}
