import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { BLOCK_BY_TYPE } from "../blocks/registry";
import { ErrorBoundary } from "../shell/ErrorBoundary";
import type { BlockData } from "../doc/useBoard";
import { useBoardContext } from "./context";

type Props = NodeProps<Node<BlockData>>;

/** Shows the title, and turns into an input on double-click. */
function EditableTitle({ id, title, className }: { id: string; title: string; className: string }) {
  const { act } = useBoardContext();
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <span
        className={`truncate ${className}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(title);
        }}
        title="Double-click to rename"
      >
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

export function BlockNode({ id, data, selected }: Props) {
  const { doc, peerSelections, sourceCounts, onOpenBlock } = useBoardContext();
  const { Preview, Icon, label, hasFocus } = BLOCK_BY_TYPE[data.blockType];
  const peerColor = peerSelections[id];
  const sources = sourceCounts[id] ?? 0;
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={110} />
      <Handle type="target" position={Position.Left} />
      <div
        data-block-type={data.blockType}
        data-selected={selected ? "true" : "false"}
        style={peerColor ? { boxShadow: `0 0 0 2px ${peerColor}, var(--n-shadow-2)` } : undefined}
        className="n-block"
      >
        <header className="n-block__head">
          <span className="n-block__icon" title={label}>
            <Icon />
          </span>
          <EditableTitle id={id} title={data.title} className="n-block__title" />
          <span className="n-block__meta">
            {hasFocus && onOpenBlock && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenBlock(id, data.blockType); }} onDoubleClick={(e) => e.stopPropagation()} className="nodrag n-btn n-btn--soft n-btn--sm" aria-label={`Open ${data.title}`}>
                Open
              </button>
            )}
            {sources > 0 && (
              <span data-source-count={sources} className="n-chip">
                {sources === 1 ? "1 source" : `${sources} sources`}
              </span>
            )}
          </span>
        </header>
        <div className="min-h-0 flex-1">
          <ErrorBoundary
            fallback={(reset) => (
              <div role="alert" className="nodrag flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-n-ink-3">
                <p>This block couldn't be displayed.</p>
                <button type="button" onClick={reset} className="n-btn n-btn--outline n-btn--sm">
                  Try again
                </button>
              </div>
            )}
          >
            <Preview doc={doc} id={id} />
          </ErrorBoundary>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function FrameNode({ id, data, selected }: Props) {
  const { hoverFrameId } = useBoardContext();
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={140} />
      <div data-block-type="frame" data-selected={selected ? "true" : "false"} data-hover={hoverFrameId === id ? "true" : "false"} className="n-frame">
        <div className="n-frame__title">
          <EditableTitle id={id} title={data.title} className="n-display" />
        </div>
      </div>
    </>
  );
}
