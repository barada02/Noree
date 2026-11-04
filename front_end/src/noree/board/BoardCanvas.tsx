import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type IsValidConnection,
  type OnBeforeDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import * as Y from "yjs";
import { useTheme } from "../../useTheme";
import type { BoardNode, useBoard } from "../doc/useBoard";
import { BoardContext } from "./context";
import { nodeTypes } from "./nodes";

type Props = { doc: Y.Doc; board: ReturnType<typeof useBoard> };

export function BoardCanvas({ doc, board }: Props) {
  const { theme } = useTheme();
  const flow = useReactFlow<BoardNode>();
  const [hoverFrameId, setHoverFrameId] = useState<string | null>(null);
  const { nodes, edges, onNodesChange, onEdgesChange, frameAt, finishDrag, deleteSelected, connect, canConnect, act } = board;

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

  const context = useMemo(() => ({ doc, act, hoverFrameId }), [doc, act, hoverFrameId]);

  return (
    <BoardContext.Provider value={context}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onBeforeDelete={onBeforeDelete}
        onConnect={(c) => connect(c.source, c.target)}
        isValidConnection={isValidConnection}
        colorMode={theme}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        zoomOnDoubleClick={false}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </BoardContext.Provider>
  );
}
