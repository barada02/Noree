import type { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import * as Y from "yjs";
import { docParts, readLayout, type BlockType } from "../shared/schema.js";
import { BLOCKS } from "./blocks/registry";
import { BoardCanvas } from "./board/BoardCanvas";
import { localActor } from "./doc/actor";
import { useBoard, type BoardNode } from "./doc/useBoard";
import { usePresence } from "./doc/usePresence";
import { useProjectDoc } from "./doc/useProjectDoc";
import { useUndo } from "./doc/useUndo";
import { useYValue } from "./doc/useY";
import { Notice } from "./shell/Notice";
import { ProjectSidebar } from "./shell/ProjectSidebar";
import { TopBar } from "./shell/TopBar";

function BlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div role="toolbar" aria-label="Add a block" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-white py-3 dark:border-stone-800 dark:bg-stone-950">
      {BLOCKS.map((b) => (
        <button
          key={b.type}
          type="button"
          onClick={() => onAdd(b.type)}
          aria-label={`Add ${b.label}`}
          className="flex w-14 flex-col items-center gap-1 rounded-md py-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        >
          {b.icon}
          <span className="text-[10px] leading-none">{b.label}</span>
        </button>
      ))}
    </div>
  );
}

function FrameList({ doc, act }: { doc: Y.Doc; act: (action: unknown) => unknown }) {
  const flow = useReactFlow<BoardNode>();
  const parts = useMemo(() => docParts(doc), [doc]);
  const frames = useYValue([parts.order as never, parts.blocks as never], () =>
    parts.order
      .toArray()
      .map((id) => parts.blocks.get(id))
      .filter((b): b is Y.Map<unknown> => !!b)
      .map(readLayout)
      .map(({ id, title }) => ({ id, title })),
  );
  if (!frames.length) return null;
  const move = (frameId: string, index: number) => act({ type: "frame.reorder", frameId, index });
  return (
    <ul className="mb-1 ml-3 border-l border-stone-200 pl-1 dark:border-stone-800">
      {frames.map((f, i) => (
        <li key={f.id} className="group flex items-center text-[13px]">
          <button
            type="button"
            onClick={() => void flow.fitView({ nodes: [{ id: f.id }], duration: 400, padding: 0.2, maxZoom: 1 })}
            className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-900"
          >
            {f.title}
          </button>
          <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" aria-label={`Move ${f.title} up`} disabled={i === 0} onClick={() => move(f.id, i - 1)} className="px-1 text-stone-500 disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label={`Move ${f.title} down`} disabled={i === frames.length - 1} onClick={() => move(f.id, i + 1)} className="px-1 text-stone-500 disabled:opacity-30">
              ↓
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

type WorkspaceProps = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  status: WebSocketStatus;
  projectId: string;
};

function Workspace({ doc, provider, status, projectId }: WorkspaceProps) {
  const [actor] = useState(localActor);
  const board = useBoard(doc, actor);
  const presence = usePresence(provider, actor);
  const undo = useUndo(doc);
  const flow = useReactFlow<BoardNode>();
  const empty = board.nodes.length === 0;

  const add = (type: BlockType) => {
    // New blocks land near the middle of the visible board, offset so they don't stack exactly.
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: (pane?.left ?? 0) + (pane?.width ?? 800) / 2,
      y: (pane?.top ?? 0) + (pane?.height ?? 600) / 2,
    });
    const offset = (board.nodes.length % 6) * 24;
    undo.newStep();
    board.addBlock(type, { x: Math.round(center.x - 120 + offset), y: Math.round(center.y - 80 + offset) });
    undo.newStep();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900 dark:bg-black dark:text-stone-100">
      <ProjectSidebar activeId={projectId}>
        <FrameList doc={doc} act={board.act} />
      </ProjectSidebar>
      <BlockMenu onAdd={add} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar doc={doc} projectId={projectId} status={status} presence={presence} undo={undo} />
        <main className="relative min-h-0 flex-1">
          <BoardCanvas doc={doc} board={board} presence={presence} onDragStart={undo.newStep} />
          {empty && (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-stone-500">
              Add a block from the menu on the left to start.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ProjectBoard({ projectId }: { projectId: string }) {
  const { session, status } = useProjectDoc(projectId);
  if (session.state === "missing") {
    return <Notice title="Project not found" body="This link doesn't match a project. Check it with whoever shared it, or start a new one." />;
  }
  if (session.state === "opening") {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-xs tracking-widest text-stone-500 uppercase">
        Opening project
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Workspace doc={session.doc} provider={session.provider} status={status} projectId={projectId} />
    </ReactFlowProvider>
  );
}
