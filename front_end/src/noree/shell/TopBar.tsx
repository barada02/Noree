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

function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Help and shortcuts" title="Help and shortcuts" className="n-btn n-btn--ghost n-btn--icon n-btn--sm shrink-0 text-n-ink-2">
        <span aria-hidden="true" className="text-base font-bold">?</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="presentation" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Help and shortcuts" className="n-panel n-rise w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="n-display text-[22px]">Working on a board</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="n-btn n-btn--ghost n-btn--icon n-btn--sm shrink-0">✕</button>
            </div>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-6 text-n-ink-2">
              <li><strong className="text-n-ink">Open a block:</strong> double-click it, or use its Open button.</li>
              <li><strong className="text-n-ink">Connect blocks:</strong> drag from the dot on the right of one block to the dot on the left of another. The second block reads from the first.</li>
              <li><strong className="text-n-ink">Rename:</strong> double-click a block or frame title.</li>
              <li><strong className="text-n-ink">Group:</strong> drag a block into a frame.</li>
              <li><strong className="text-n-ink">Delete:</strong> select, then press Delete. Undo brings it back.</li>
            </ul>
            <h3 className="n-eyebrow mt-5 mb-2">Shortcuts</h3>
            <ul className="space-y-1.5 text-[14px] text-n-ink-2">
              <li><kbd>Ctrl/⌘ Z</kbd> undo · <kbd>Ctrl/⌘ Shift Z</kbd> redo</li>
              <li><kbd>Delete</kbd> remove selected · <kbd>Esc</kbd> close a block</li>
              <li><kbd>Enter</kbd> send to the AI · <kbd>Shift Enter</kbd> new line</li>
            </ul>
          </div>
        </div>
      )}
    </>
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
      <span className={status === WebSocketStatus.Connected ? "hidden 2xl:inline" : "inline"}>{view.label}</span>
      {status === WebSocketStatus.Disconnected && (
        <button type="button" onClick={() => window.location.reload()} className="font-semibold text-n-danger underline underline-offset-2">
          Retry
        </button>
      )}
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
      <span className="hidden shrink-0 items-center sm:flex">
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
        <span className="hidden sm:inline">Export</span>
      </a>
      <span className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
        <ConnectionStatus status={status} />
        <span className="flex -space-x-2" aria-label="People on this board">
          {presence.peers.slice(0, 4).map((p) => (
            <span key={p.clientId} title={p.name} data-peer={p.name} className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white ring-2 ring-n-bg" style={{ backgroundColor: p.color }}>
              {initialOf(p.name)}
            </span>
          ))}
        </span>
        {mode === "board" && (
          <button type="button" aria-label="AI" aria-pressed={panelOpen} onClick={onTogglePanel} title="Show or hide the AI panel" className="n-btn n-btn--outline n-btn--sm shrink-0">
            <SparkIcon />
            <span className="hidden sm:inline">AI</span>
          </button>
        )}
        {presence.peers.length > 4 && (
            <span title={presence.peers.slice(4).map((p) => p.name).join(", ")} className="grid h-8 min-w-8 place-items-center rounded-full bg-n-sunken px-1 text-[11px] font-bold text-n-ink-2 ring-2 ring-n-bg">
              +{presence.peers.length - 4}
            </span>
          )}
        <HelpButton />
        <ProfileMenu name={presence.name} color={presence.color} onRename={presence.rename} />
        <ShareButton />
      </span>
    </header>
  );
}
