import { useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { docParts, readEdge, readLayout, type ActorRef, type Message } from "../../shared/schema.js";
import { isStale, useBlockJobs, useThreadJobs, type JobView } from "../doc/useJobs";
import { useYValue } from "../doc/useY";
import { cancelJob, startAgent, undoAgentRun } from "../lib/api";
import { renderRich } from "../lib/rich";

type Props = {
  doc: Y.Doc;
  projectId: string;
  /** Ids of the selected blocks. With exactly one, it's the starting context and holds the conversation. */
  selectedIds: string[];
  actor: ActorRef;
  personName: string;
};

const BOARD_THREAD = "board";

/** Tool names, as people should read them. */
const STEP_LABELS: Record<string, string> = {
  read_board: "Reading the board",
  read_block: "Reading a block",
  add_frame: "Adding a frame",
  add_block: "Adding a block",
  update_block: "Updating a block",
  connect: "Connecting blocks",
  disconnect: "Disconnecting blocks",
  move_to_frame: "Moving a block",
  run_slate_agent: "Slate agent",
  generate_3d_model: "3D agent",
};
const label = (title: string) => STEP_LABELS[title] ?? title;
/** What these return is for the model. People only need to know they happened. */
const READS = new Set(["read_board", "read_block"]);
/** Block ids help the model and mean nothing to people. */
const withoutIds = (note: string) => note.replace(/\s*\[[a-f0-9]{16,}\]/g, "");

function Conversation({ messages, activity }: { messages: Message[]; activity: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activity]);

  if (!messages.length && !activity) return null;
  return (
    <ol className="space-y-3" aria-live="polite">
      {messages.map((m) => (
        <li key={m.id} data-message={m.role}>
          <p className="mb-0.5 text-[11px] font-medium text-stone-500">{m.author.name}</p>
          {m.role === "assistant" ? (
            // renderRich escapes its input, so model text can't inject markup.
            <div className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-[13px] leading-5 break-words dark:bg-stone-800" dangerouslySetInnerHTML={{ __html: renderRich(m.text) }} />
          ) : (
            <p className="text-[13px] leading-5 break-words whitespace-pre-wrap">{m.text}</p>
          )}
        </li>
      ))}
      {activity && (
        <li data-agent-activity className="animate-pulse text-xs text-stone-500">
          {activity}…
        </li>
      )}
      <div ref={end} />
    </ol>
  );
}

function RunDetails({ job }: { job: JobView }) {
  if (!job.steps.length) return null;
  return (
    <details className="mt-2 text-xs text-stone-500">
      <summary className="cursor-pointer select-none">What it did ({job.steps.length})</summary>
      <ol className="mt-1 space-y-1">
        {job.steps.map((step, i) => (
          <li key={i} className={step.status === "fail" ? "text-red-700 dark:text-red-400" : ""}>
            {label(step.title)}
            {step.note && !READS.has(step.title) && <span className="block break-words opacity-80">{withoutIds(step.note)}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Chat({ doc, projectId, threadId, focusBlockId, actor, personName }: { doc: Y.Doc; projectId: string; threadId: string; focusBlockId: string | null; actor: ActorRef; personName: string }) {
  const flow = useReactFlow();
  const parts = useMemo(() => docParts(doc), [doc]);
  const jobs = useThreadJobs(doc, threadId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [undoing, setUndoing] = useState(false);

  const messages = useYValue([parts.threads as never], () => parts.threads.get(threadId)?.toArray() ?? []);
  const sources = useYValue([parts.edges as never, parts.blocks as never], () => {
    const titles: string[] = [];
    parts.edges.forEach((edge) => {
      const { source, target } = readEdge(edge);
      const block = target === focusBlockId ? parts.blocks.get(source) : undefined;
      if (block) titles.push(readLayout(block).title);
    });
    return titles;
  });

  const isActive = (job: JobView) => job.status === "running" && !isStale(job, now);
  // A specialist's job can start and end while the main agent's is still going, so check them all.
  const active = jobs.filter(isActive);
  const running = active.length > 0;
  const latest = jobs[0];
  const mainJob = jobs.find((job) => job.kind === "main");
  const current = active[0];
  const lastStep = current?.steps.at(-1)?.title;
  const mine = mainJob?.startedBy?.id === actor.id;
  // One main agent run per board, which may be in another conversation.
  const boardRun = useBlockJobs(doc, BOARD_THREAD)[0];
  const busyElsewhere = !running && !!boardRun && isActive(boardRun) && boardRun.threadId !== threadId;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [running]);

  // When your own request adds blocks, bring them into view as they appear, so a specialist working
  // on a new block can be watched. Other people's views stay where they are.
  const added = mainJob?.undo?.filter((step) => step.type === "delete-block").length ?? 0;
  const seenAdded = useRef(added);
  useEffect(() => {
    if (added <= seenAdded.current) {
      seenAdded.current = added;
      return;
    }
    seenAdded.current = added;
    if (!mine) return;
    // A short wait lets several additions in a row settle, and lets React Flow measure them.
    const timer = setTimeout(() => void flow.fitView({ duration: 400, maxZoom: 1, padding: 0.15 }), 250);
    return () => clearTimeout(timer);
  }, [added, mine, flow]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || running || busyElsewhere) return;
    setSending(true);
    setError(null);
    try {
      await startAgent(projectId, { text, focusBlockId: focusBlockId ?? undefined, person: { id: actor.id, name: personName } });
      setDraft("");
      setNow(Date.now());
    } catch (e) {
      // The draft stays, so nothing typed is lost.
      setError(e instanceof Error ? e.message : "That couldn't be sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function undo(jobId: string) {
    setUndoing(true);
    setError(null);
    try {
      await undoAgentRun(projectId, jobId, { person: { id: actor.id, name: personName } });
    } catch {
      setError("Those changes couldn't be undone. Try again.");
    } finally {
      setUndoing(false);
    }
  }

  const failed = running ? null : latest?.status === "failed" ? latest.error : latest && isStale(latest, now) ? "This run stopped responding. Try again." : null;
  const undoable = !running && mainJob?.undo?.length && !mainJob.undone ? mainJob : null;
  const empty = !messages.length && !running;

  return (
    <>
      {focusBlockId && (
        <div className="border-b border-stone-200 px-3 py-2 text-xs dark:border-stone-800" data-sources={sources.length}>
          {sources.length ? (
            <p>
              <span className="text-stone-500">Reads from </span>
              <span className="font-medium">{sources.join(", ")}</span>
            </p>
          ) : (
            <p className="text-stone-500">Draw a line from another block to give the AI more context.</p>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {empty && (
          <p className="text-sm text-stone-500">
            {focusBlockId
              ? "Ask about this block, or tell the AI what to do with it. Everyone on the board sees this conversation."
              : "Ask about the board, or tell the AI what to do. It can add and connect blocks, and use its Slate and 3D specialists. Try: plan a launch for a coffee shop app."}
          </p>
        )}
        <Conversation messages={messages} activity={running ? (lastStep ? label(lastStep) : "Thinking") : null} />
        {failed && (
          <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">
            {failed}
          </p>
        )}
        {busyElsewhere && (
          <p data-agent-busy className="mt-3 text-xs text-stone-500">
            The AI is working on another request on this board. You can ask here when it finishes.
          </p>
        )}
        {undoable && (
          <button type="button" disabled={undoing} onClick={() => void undo(undoable.id)} className="mt-2 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800">
            {undoing ? "Undoing" : "Undo these changes"}
          </button>
        )}
        {mainJob && <RunDetails job={mainJob} />}
      </div>
      <form
        className="border-t border-stone-200 p-2 dark:border-stone-800"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && (
          <p role="alert" className="mb-1.5 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <textarea
          value={draft}
          rows={2}
          maxLength={4000}
          aria-label="Ask the AI"
          placeholder={focusBlockId ? "Ask about this block" : "Ask, or tell it what to do"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="w-full resize-none rounded-md border border-stone-300 bg-transparent px-2 py-1.5 text-[13px] outline-none focus:border-stone-500 dark:border-stone-700"
        />
        <div className="mt-1.5 flex justify-end gap-2">
          {running && current && (
            <button type="button" onClick={() => void cancelJob(projectId, (active.find((job) => job.kind === "main") ?? current).id)} className="rounded-md border border-stone-300 px-2.5 py-1 text-xs dark:border-stone-700">
              Stop
            </button>
          )}
          <button type="submit" disabled={!draft.trim() || sending || running || busyElsewhere} className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900">
            Ask
          </button>
        </div>
      </form>
    </>
  );
}

/** The one place to talk to the AI. With nothing selected it's about the board, and with a block selected it starts from that block. */
export function AiPanel(props: Props) {
  const { selectedIds } = props;
  const only = selectedIds.length === 1 ? selectedIds[0] : null;
  // The key makes a new selection read fresh, instead of showing the previous block's values.
  return <PanelContent key={only ?? BOARD_THREAD} only={only} {...props} />;
}

function PanelContent({ doc, projectId, actor, personName, only }: Props & { only: string | null }) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const selected = useYValue([parts.blocks as never], () => {
    const found = only ? parts.blocks.get(only) : undefined;
    return found ? readLayout(found) : null;
  });

  return (
    <aside aria-label="AI panel" className="absolute top-11 right-0 bottom-0 z-20 flex w-80 max-w-full shrink-0 flex-col border-l border-stone-200 bg-white lg:static dark:border-stone-800 dark:bg-stone-950">
      <h2 className="truncate border-b border-stone-200 px-3 py-2 text-sm font-medium dark:border-stone-800">{selected ? selected.title : "AI"}</h2>
      {/* The key gives each conversation its own draft and scroll position. */}
      <Chat key={selected?.id ?? BOARD_THREAD} doc={doc} projectId={projectId} threadId={selected?.id ?? BOARD_THREAD} focusBlockId={selected?.id ?? null} actor={actor} personName={personName} />
    </aside>
  );
}
