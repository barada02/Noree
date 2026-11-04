import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { BLOCK_BY_TYPE } from "../blocks/registry";
import type { BlockData } from "../doc/useBoard";
import { useBoardContext } from "./context";

type Props = NodeProps<Node<BlockData>>;

/** Shows the title, and turns into an input on double-click. */
function EditableTitle({ id, title, className }: { id: string; title: string; className: string }) {
  const { act } = useBoardContext();
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <span className={`truncate ${className}`} onDoubleClick={() => setDraft(title)} title="Double-click to rename">
        {title}
      </span>
    );
  }
  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) act({ type: "block.update", id, patch: { title: next } });
    setDraft(null);
  };
  return (
    <input
      autoFocus
      value={draft}
      maxLength={200}
      aria-label="Block title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className={`nodrag min-w-0 flex-1 bg-transparent outline-none ${className}`}
    />
  );
}

const HANDLE = "!h-2.5 !w-2.5 !border-2 !border-white !bg-stone-500 dark:!border-stone-900";

export function BlockNode({ id, data, selected }: Props) {
  const { doc, peerSelections } = useBoardContext();
  const { Preview, label } = BLOCK_BY_TYPE[data.blockType];
  const sticky = data.blockType === "sticky";
  const peerColor = peerSelections[id];
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={90} color="#78716c" />
      <Handle type="target" position={Position.Left} className={HANDLE} />
      <div
        data-block-type={data.blockType}
        style={peerColor ? { boxShadow: `0 0 0 2px ${peerColor}` } : undefined}
        className={`flex h-full w-full flex-col overflow-hidden rounded-lg border ${
          selected ? "border-stone-900 dark:border-stone-100" : "border-stone-300 dark:border-stone-700"
        } ${sticky ? "bg-amber-100 text-stone-900 dark:bg-amber-200" : "bg-white dark:bg-stone-900"}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/10 px-3 py-1.5 dark:border-white/10">
          <EditableTitle id={id} title={data.title} className="text-xs font-medium" />
          <span className="ml-auto font-mono text-[10px] tracking-wider uppercase opacity-50">{label}</span>
        </header>
        <div className="min-h-0 flex-1">
          <Preview doc={doc} id={id} />
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={HANDLE} />
    </>
  );
}

export function FrameNode({ id, data, selected }: Props) {
  const { hoverFrameId } = useBoardContext();
  const hovered = hoverFrameId === id;
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={140} color="#78716c" />
      <div
        data-block-type="frame"
        className={`h-full w-full rounded-xl border-2 ${
          hovered
            ? "border-stone-900 bg-stone-900/10 dark:border-stone-100 dark:bg-stone-100/10"
            : selected
              ? "border-stone-700 bg-stone-500/5 dark:border-stone-300"
              : "border-dashed border-stone-300 bg-stone-500/5 dark:border-stone-700"
        }`}
      >
        <div className="absolute -top-6 left-1 flex max-w-full">
          <EditableTitle id={id} title={data.title} className="font-mono text-xs tracking-wide text-stone-600 dark:text-stone-300" />
        </div>
      </div>
    </>
  );
}

export const nodeTypes = { block: BlockNode, frame: FrameNode };
