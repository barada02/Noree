import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type StageStatus = "idle" | "active" | "done";

export type StageData = {
  title: string;
  kind: string;
  detail: string;
  status: StageStatus;
};

export type StageNodeType = Node<StageData, "stage">;

const STATUS_DOT: Record<StageStatus, string> = {
  idle: "bg-stone-400",
  active: "bg-amber-500",
  done: "bg-emerald-600",
};

/**
 * A hand-built node: the "build our own" part of this experiment.
 * React Flow owns position/selection/handles plumbing; we own the look.
 */
export function StageNode({ data, selected }: NodeProps<StageNodeType>) {
  return (
    <div
      className={`w-52 rounded-md border bg-white px-3 py-2.5 text-left shadow-none dark:bg-stone-900 ${
        selected
          ? "border-emerald-700 dark:border-emerald-500"
          : "border-stone-300 dark:border-stone-700"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-stone-400 !bg-stone-400"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-widest text-stone-500 uppercase dark:text-stone-400">
          {data.kind}
        </span>
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[data.status]}`}
        />
      </div>
      <p className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">
        {data.title}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-stone-500 dark:text-stone-400">
        {data.detail}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-stone-400 !bg-stone-400"
      />
    </div>
  );
}


