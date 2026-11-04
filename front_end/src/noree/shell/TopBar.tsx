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
    if (title) rememberProject(projectId, title);
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
      className="w-64 max-w-full rounded bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800"
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
    <span data-connection={status} className="flex items-center gap-1.5 text-xs text-stone-500">
      <span className={`h-1.5 w-1.5 rounded-full ${view.dot}`} />
      {view.label}
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

type Props = {
  doc: Y.Doc;
  projectId: string;
  status: WebSocketStatus;
  presence: ReturnType<typeof usePresence>;
  undo: ReturnType<typeof useUndo>;
};

const ICON_BUTTON = "rounded px-1.5 py-0.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-30 dark:text-stone-300 dark:hover:bg-stone-800";

export function TopBar({ doc, projectId, status, presence, undo }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-3 dark:border-stone-800 dark:bg-stone-950">
      <ProjectTitle doc={doc} projectId={projectId} />
      <span className="flex gap-0.5">
        <button type="button" aria-label="Undo" title="Undo your last change (Ctrl+Z)" disabled={!undo.canUndo} onClick={undo.undo} className={ICON_BUTTON}>
          ↶
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!undo.canRedo} onClick={undo.redo} className={ICON_BUTTON}>
          ↷
        </button>
      </span>
      <span className="ml-auto flex items-center gap-3">
        <ConnectionStatus status={status} />
        <span className="flex items-center gap-1" aria-label="People on this board">
          {presence.peers.map((p) => (
            <span key={p.clientId} title={p.name} data-peer={p.name} className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: p.color }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        <label className="flex items-center gap-1.5">
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
        <ShareButton />
      </span>
    </header>
  );
}
