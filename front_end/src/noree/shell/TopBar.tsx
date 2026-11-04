import { WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { docParts } from "../../shared/schema.js";
import { LOCAL_ORIGIN } from "../doc/actor";
import type { usePresence } from "../doc/usePresence";
import type { useUndo } from "../doc/useUndo";
import { useYValue } from "../doc/useY";
import { rememberProject } from "../lib/projects";

function ProjectTitle({ doc, projectId }: { doc: Y.Doc; projectId: string }) {
  const { meta } = useMemo(() => docParts(doc), [doc]);
  const title = useYValue([meta as never], () => String(meta.get("title") ?? ""));
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!title) return;
    rememberProject(projectId, title);
    document.title = `${title} · Noree`;
    return () => {
      document.title = "Noree";
    };
  }, [title, projectId]);

  const commit = () => {
    const next = draft?.trim();
    if (next && next !== title) doc.transact(() => meta.set("title", next.slice(0, 200)), LOCAL_ORIGIN);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? title}
      aria-label="Project name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-64 min-w-16 shrink rounded bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800"
    />
  );
}

function ConnectionStatus({ status }: { status: WebSocketStatus }) {
  const view = {
    [WebSocketStatus.Connected]: { label: "Live", dot: "bg-emerald-600" },
    [WebSocketStatus.Connecting]: { label: "Connecting", dot: "bg-amber-500" },
    [WebSocketStatus.Disconnected]: { label: "Offline, saving here", dot: "bg-red-600" },
  }[status];
  return (
    <span data-connection={status} title={view.label} className="flex items-center gap-1.5 text-xs text-stone-500">
      <span className={`h-1.5 w-1.5 rounded-full ${view.dot}`} />
      <span className="hidden xl:inline">{view.label}</span>
    </span>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link to share the board:", window.location.href);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      title="Anyone with this link can view and edit this board"
      className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-900"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

export type BoardMode = "board" | "read";

type Props = {
  doc: Y.Doc;
  mode: BoardMode;
  onModeChange: (mode: BoardMode) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  projectId: string;
  status: WebSocketStatus;
  presence: ReturnType<typeof usePresence>;
  undo: ReturnType<typeof useUndo>;
};

const ICON_BUTTON = "rounded px-1.5 py-0.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-30 dark:text-stone-300 dark:hover:bg-stone-800";

export function TopBar({ doc, mode, onModeChange, panelOpen, onTogglePanel, projectId, status, presence, undo }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 lg:gap-3 dark:border-stone-800 dark:bg-stone-950">
      <a href="#/app" aria-label="All projects" className="text-sm text-stone-500 md:hidden">
        ←
      </a>
      <ProjectTitle doc={doc} projectId={projectId} />
      <span className="flex gap-0.5">
        <button type="button" aria-label="Undo" title="Undo your last change (Ctrl+Z)" disabled={!undo.canUndo} onClick={undo.undo} className={ICON_BUTTON}>
          ↶
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!undo.canRedo} onClick={undo.redo} className={ICON_BUTTON}>
          ↷
        </button>
      </span>
      <span role="group" aria-label="View" className="flex overflow-hidden rounded-md border border-stone-300 text-xs dark:border-stone-700">
        {(["board", "read"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={`px-2.5 py-1 capitalize ${mode === m ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
          >
            {m}
          </button>
        ))}
      </span>
      <a href={`/api/projects/${projectId}/export.md`} download className="rounded-md border border-stone-300 px-2.5 py-1 text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
        Export
      </a>
      <span className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
        <ConnectionStatus status={status} />
        <span className="flex items-center gap-1" aria-label="People on this board">
          {presence.peers.map((p) => (
            <span key={p.clientId} title={p.name} data-peer={p.name} className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: p.color }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        <label className="hidden items-center gap-1.5 xl:flex">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: presence.color }} />
          <span className="sr-only">Your display name</span>
          <input
            defaultValue={presence.name}
            maxLength={40}
            onBlur={(e) => presence.rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            title="Your name, shown to others on this board"
            className="w-28 rounded bg-transparent px-1 py-0.5 text-xs outline-none hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800"
          />
        </label>
        {mode === "board" && (
          <button
            type="button"
            aria-pressed={panelOpen}
            onClick={onTogglePanel}
            className={`rounded-md border border-stone-300 px-2.5 py-1 text-xs dark:border-stone-700 ${panelOpen ? "bg-stone-100 dark:bg-stone-800" : ""}`}
          >
            AI
          </button>
        )}
        <ShareButton />
      </span>
    </header>
  );
}
