import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
  ViewportPortal,
  type IsValidConnection,
  type OnBeforeDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { useTheme } from "../../useTheme";
import type { ActorRef, BlockType } from "../../shared/schema.js";
import type { BoardNode, useBoard } from "../doc/useBoard";
import type { usePresence } from "../doc/usePresence";
import { BoardContext } from "./context";
import { nodeTypes } from "./nodeTypes";

type Props = {
  doc: Y.Doc;
  projectId: string;
  actor: ActorRef;
  board: ReturnType<typeof useBoard>;
  presence: ReturnType<typeof usePresence>;
  onDragStart: () => void;
  /** Set while a block is open full screen, so keys go there and not to the board. */
  paused: boolean;
  onOpenBlock: (id: string, type: BlockType) => void;
};

/** Other people's cursors, positioned in board coordinates and kept a constant size on screen. */
function PeerCursors({ peers }: { peers: ReturnType<typeof usePresence>["peers"] }) {
  const { zoom } = useViewport();
  return (
    <ViewportPortal>
      {peers
        .filter((p) => p.cursor)
        .map((p) => (
          <div
            key={p.clientId}
            data-peer-cursor={p.name}
            className="pointer-events-none absolute top-0 left-0 z-[1000] origin-top-left"
            style={{ transform: `translate(${p.cursor!.x}px, ${p.cursor!.y}px) scale(${1 / zoom})` }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
              <path d="M1 1l5 17 3-7 6-1z" fill={p.color} stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="ml-3 block rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white" style={{ backgroundColor: p.color }}>
              {p.name}
            </span>
          </div>
        ))}
    </ViewportPortal>
  );
}

export function BoardCanvas({ doc, projectId, actor, board, presence, onDragStart, paused, onOpenBlock }: Props) {
  const { theme } = useTheme();
  const flow = useReactFlow<BoardNode>();
  const [hoverFrameId, setHoverFrameId] = useState<string | null>(null);
  const { nodes, edges, onNodesChange, onEdgesChange, frameAt, finishDrag, deleteSelected, connect, canConnect, act } = board;
  const { peers, setCursor, setSelected } = presence;

  const centerOf = useCallback(
    (node: BoardNode) => {
      const internal = flow.getInternalNode(node.id);
      const at = internal?.internals.positionAbsolute ?? node.position;
      return {
        x: at.x + (internal?.measured.width ?? node.width ?? 0) / 2,
        y: at.y + (internal?.measured.height ?? node.height ?? 0) / 2,
      };
    },
    [flow],
  );

  const onNodeDrag = useCallback(
    (_: unknown, node: BoardNode) => {
      setHoverFrameId(node.type === "frame" ? null : frameAt(centerOf(node)));
    },
    [frameAt, centerOf],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: BoardNode, dragged: BoardNode[]) => {
      setHoverFrameId(null);
      finishDrag(
        dragged.map((n) => ({
          id: n.id,
          center: centerOf(n),
          isFrame: n.type === "frame",
          parentId: n.parentId,
        })),
      );
    },
    [finishDrag, centerOf],
  );

  // React Flow would also delete a frame's children. We apply the delete ourselves and cancel its own.
  const onBeforeDelete = useCallback<OnBeforeDelete<BoardNode>>(
    async () => {
      deleteSelected(
        nodes.filter((n) => n.selected),
        edges.filter((e) => e.selected),
      );
      return false;
    },
    [deleteSelected, nodes, edges],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (c) => canConnect(c.source, c.target),
    [canConnect],
  );

  const selectedKey = nodes.filter((n) => n.selected).map((n) => n.id).join(",");
  useEffect(() => {
    setSelected(selectedKey ? selectedKey.split(",") : []);
  }, [selectedKey, setSelected]);

  const peerSelections = useMemo(() => {
    const result: Record<string, string> = {};
    for (const peer of peers) for (const id of peer.selected) result[id] = peer.color;
    return result;
  }, [peers]);

  const sourceCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const edge of edges) result[edge.target] = (result[edge.target] ?? 0) + 1;
    return result;
  }, [edges]);

  const personName = presence.name;
  const context = useMemo(
    () => ({ doc, projectId, actor, personName, act, hoverFrameId, peerSelections, sourceCounts, onOpenBlock }),
    [doc, projectId, actor, personName, act, hoverFrameId, peerSelections, sourceCounts, onOpenBlock],
  );

  return (
    <BoardContext.Provider value={context}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onDragStart}
        onNodeDoubleClick={(_, node) => onOpenBlock(node.id, node.data.blockType)}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onBeforeDelete={onBeforeDelete}
        onConnect={(c) => connect(c.source, c.target)}
        isValidConnection={isValidConnection}
        onPointerMove={(e) => setCursor(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
        onPointerLeave={() => setCursor(null)}
        colorMode={theme}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        zoomOnDoubleClick={false}
        deleteKeyCode={paused ? null : ["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.6} />
        <Controls />
        <MiniMap pannable zoomable />
        <PeerCursors peers={peers} />
      </ReactFlow>
    </BoardContext.Provider>
  );
}
