import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../../useTheme";
import { INITIAL_EDGES, INITIAL_NODES, nodeTypes } from "./initial";
import type { StageNodeType, StageStatus } from "./nodes";

const STORAGE_KEY = "noree:reactflow-graph";
const STATUSES: StageStatus[] = ["idle", "active", "done"];

type PersistedGraph = { nodes: StageNodeType[]; edges: Edge[] };

function loadGraph(): PersistedGraph | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<PersistedGraph>;
    if (
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      parsed.nodes.length === 0
    ) {
      return undefined;
    }
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return undefined;
  }
}

let stageCounter = 0;

export default function FlowExperiment() {
  const { theme } = useTheme();
  const [persisted] = useState(loadGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    persisted?.nodes ?? INITIAL_NODES,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    persisted?.edges ?? INITIAL_EDGES,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(
    persisted ? "restored session" : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nodes: nodes.map(({ id, type, position, data }) => ({
            id,
            type,
            position,
            data,
          })),
          edges: edges.map(
            ({
              id,
              source,
              target,
              sourceHandle,
              targetHandle,
              type,
              animated,
              markerEnd,
            }) => ({
              id,
              source,
              target,
              sourceHandle,
              targetHandle,
              type,
              animated,
              markerEnd,
            }),
          ),
        }),
      );
    } catch {
      /* storage blocked or full: keep showing the last saved time */
    }
  }, [nodes, edges]);

  function touchSaved() {
    setSavedAt(new Date().toLocaleTimeString());
  }

  const handleNodesChange = useCallback(
    (changes: NodeChange<StageNodeType>[]) => {
      onNodesChange(changes);
      touchSaved();
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      touchSaved();
    },
    [onEdgesChange],
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  const onConnect = useCallback(
    (connection: Parameters<typeof addEdge>[0]) => {
      setEdges((eds) => addEdge(connection, eds));
      touchSaved();
    },
    [setEdges],
  );

  function addStage() {
    stageCounter += 1;
    const n = nodes.length + stageCounter;
    const id = `stage-${Date.now().toString(36)}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "stage",
        position: { x: 60 + (n % 4) * 240, y: 40 + (n % 3) * 160 },
        data: {
          title: "New stage",
          kind: "process",
          detail: "double-click title in inspector",
          status: "idle",
        },
      },
    ]);
    touchSaved();
    setNotice("Stage added — drag a handle to connect it");
  }

  function resetGraph() {
    setNodes(INITIAL_NODES);
    setEdges(INITIAL_EDGES);
    setSelectedId(null);
    touchSaved();
    setNotice("Starter graph restored");
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  function updateSelected(patch: Partial<StageNodeType["data"]>) {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  }

  function cycleStatus() {
    if (!selected) return;
    const next = STATUSES[(STATUSES.indexOf(selected.data.status) + 1) % STATUSES.length];
    updateSelected({ status: next });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <p className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
        experiment — 02 / graphs
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        React Flow
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-stone-600 dark:text-stone-400">
        Node-graph UI from the XYFlow project. The{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] dark:bg-stone-800">
          stage
        </code>{" "}
        node is our own component — React Flow owns dragging, selection and
        edge plumbing; we own the look and the data.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addStage}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          Add stage
        </button>
        <button
          type="button"
          onClick={resetGraph}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Reset graph
        </button>
        <span className="ml-auto flex items-center gap-2 font-mono text-xs text-stone-500 dark:text-stone-400">
          {notice ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              {notice}
            </span>
          ) : savedAt ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
              saved {savedAt}
            </>
          ) : (
            "unsaved"
          )}
        </span>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[560px] min-w-0 rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) =>
              setSelectedId(sel[0]?.id ?? null)
            }
            colorMode={theme}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            <MiniMap />
            <Panel position="top-right">
              <p className="rounded-md border border-stone-200 bg-white/90 px-2 py-1 font-mono text-[11px] text-stone-500 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-400">
                drag to pan · scroll to zoom · drag a handle to connect · del
                removes
              </p>
            </Panel>
          </ReactFlow>
        </div>

        <aside className="h-fit rounded-lg border border-stone-200 dark:border-stone-800">
          <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
              Inspector
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              {[
                { label: "nodes", value: nodes.length },
                { label: "edges", value: edges.length },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-md bg-stone-100 px-2 py-2 dark:bg-stone-900"
                >
                  <dt className="font-mono text-[11px] text-stone-500 uppercase dark:text-stone-400">
                    {s.label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="px-4 py-3">
            {selected ? (
              <div>
                <p className="font-mono text-xs text-stone-500 dark:text-stone-400">
                  {selected.id} · {selected.data.kind}
                </p>
                <label className="mt-2 block font-mono text-[11px] tracking-widest text-stone-500 uppercase dark:text-stone-400">
                  Title
                  <input
                    value={selected.data.title}
                    onChange={(e) => updateSelected({ title: e.target.value })}
                    className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 font-sans text-sm normal-case text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between">
                  <p className="font-mono text-xs text-stone-500 dark:text-stone-400">
                    x {Math.round(selected.position.x)} · y{" "}
                    {Math.round(selected.position.y)}
                  </p>
                  <button
                    type="button"
                    onClick={cycleStatus}
                    className="rounded-md border border-stone-300 px-2.5 py-1 font-mono text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                  >
                    status: {selected.data.status}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                Click a node to inspect it. Edit its title, cycle its status,
                drag it around — layout persists to localStorage.
              </p>
            )}
            <p className="mt-3 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              Graph state lives in{" "}
              <code className="font-mono text-xs">useNodesState</code> +{" "}
              <code className="font-mono text-xs">useEdgesState</code>; every
              change serializes to localStorage and reloads on start.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
