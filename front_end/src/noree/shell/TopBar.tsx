import { WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { BRAND } from "../../brand";
import { docParts } from "../../shared/schema.js";
import { LOCAL_ORIGIN } from "../doc/actor";
import type { usePresence } from "../doc/usePresence";
import type { useUndo } from "../doc/useUndo";
import { useYValue } from "../doc/useY";
import { rememberProject } from "../lib/projects";
import { DownloadIcon, RedoIcon, ShareIcon, SparkIcon, UndoIcon } from "../ui/icons";
import { Mark } from "../ui/Mark";
import { initialOf, ProfileMenu } from "../ui/ProfileMenu";

function ProjectTitle({ doc, projectId }: { doc: Y.Doc; projectId: string }) {
  const { meta } = useMemo(() => docParts(doc), [doc]);
  const title = useYValue([meta as never], () => String(meta.get("title") ?? ""));
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!title) return;
    rememberProject(projectId, title);
    document.title = `${title} · ${BRAND.name}`;
    return () => {
      document.title = BRAND.name;
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
      className="n-display min-w-0 max-w-[22rem] flex-1 rounded-lg bg-transparent px-2 py-1 text-[19px] outline-none hover:bg-n-sunken focus:bg-n-sunken"
    />
  );
}

function ConnectionStatus({ status }: { status: WebSocketStatus }) {
  const view = {
    [WebSocketStatus.Connected]: { label: "Live", dot: "bg-n-leaf" },
    [WebSocketStatus.Connecting]: { label: "Connecting", dot: "bg-[#d9b84a]" },
    [WebSocketStatus.Disconnected]: { label: "Offline, saving here", dot: "bg-n-danger" },
  }[status];
  return (
    <span data-connection={status} title={view.label} className="flex items-center gap-1.5 text-xs font-medium text-n-ink-3">
      <span className={`h-2 w-2 rounded-full ${view.dot} ${status === WebSocketStatus.Connected ? "" : "n-breathe"}`} />
      <span className="hidden 2xl:inline">{view.label}</span>
    </span>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
    <button type="button" onClick={() => void share()} title="Anyone with this link can view and edit this board" className="n-btn n-btn--primary n-btn--sm shrink-0">
      <ShareIcon />
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

export function TopBar({ doc, mode, onModeChange, panelOpen, onTogglePanel, projectId, status, presence, undo }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-n-line-soft bg-n-bg/85 px-3 backdrop-blur lg:gap-3 lg:px-4">
      <a href="#/app" aria-label="All projects" className="n-btn n-btn--ghost n-btn--icon n-btn--sm shrink-0 md:hidden">
        <Mark size={22} />
      </a>
      <ProjectTitle doc={doc} projectId={projectId} />
      <span className="flex shrink-0 items-center">
        <button type="button" aria-label="Undo" title="Undo your last change (Ctrl+Z)" disabled={!undo.canUndo} onClick={undo.undo} className="n-btn n-btn--ghost n-btn--icon n-btn--sm text-n-ink-2">
          <UndoIcon />
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!undo.canRedo} onClick={undo.redo} className="n-btn n-btn--ghost n-btn--icon n-btn--sm text-n-ink-2">
          <RedoIcon />
        </button>
      </span>
      <span role="group" aria-label="View" className="n-seg shrink-0">
        {(["board", "read"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => onModeChange(m)}>
            {m}
          </button>
        ))}
      </span>
      <a href={`/api/projects/${projectId}/export.md`} download aria-label="Export" title="Download this board as Markdown" className="n-btn n-btn--outline n-btn--sm shrink-0">
        <DownloadIcon />
        <span className="hidden 2xl:inline">Export</span>
      </a>
      <span className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
        <ConnectionStatus status={status} />
        <span className="flex -space-x-2" aria-label="People on this board">
          {presence.peers.map((p) => (
            <span key={p.clientId} title={p.name} data-peer={p.name} className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white ring-2 ring-n-bg" style={{ backgroundColor: p.color }}>
              {initialOf(p.name)}
            </span>
          ))}
        </span>
        {mode === "board" && (
          <button type="button" aria-label="AI" aria-pressed={panelOpen} onClick={onTogglePanel} title="Show or hide the AI panel" className="n-btn n-btn--outline n-btn--sm shrink-0">
            <SparkIcon />
            <span className="hidden 2xl:inline">AI</span>
          </button>
        )}
        <ProfileMenu name={presence.name} color={presence.color} onRename={presence.rename} />
        <ShareButton />
      </span>
    </header>
  );
}
