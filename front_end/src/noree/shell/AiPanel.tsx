import { useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { docParts, readEdge, readLayout, type ActorRef, type Message } from "../../shared/schema.js";
import { isStale, useBlockJobs, useThreadJobs, type JobView } from "../doc/useJobs";
import { useYValue } from "../doc/useY";
import { cancelJob, startAgent, undoAgentRun } from "../lib/api";
import { renderRich } from "../lib/rich";
import { CloseIcon, SendIcon, SparkIcon } from "../ui/icons";
import { Mark } from "../ui/Mark";

type Props = {
  doc: Y.Doc;
  projectId: string;
  /** Ids of the selected blocks. With exactly one, it's the starting context and holds the conversation. */
  selectedIds: string[];
  actor: ActorRef;
  personName: string;
  onClose?: () => void;
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

const BOARD_STARTERS = ["Plan a launch for a coffee shop app", "Set up a study board on complex numbers", "Plan a three day trip", "Summarize what's on the board"];
const BLOCK_STARTERS = ["Summarize this", "What's missing here?", "Suggest next steps", "Turn this into a checklist"];

function Conversation({ messages, activity }: { messages: Message[]; activity: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activity]);

  if (!messages.length && !activity) return null;
  return (
    <ol className="space-y-4" aria-live="polite">
      {messages.map((m) => (
        <li key={m.id} data-message={m.role} className={m.role === "assistant" ? "" : "flex flex-col items-end"}>
          <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-n-ink-3">
            {m.role === "assistant" && <Mark size={14} />}
            {m.author.name}
          </p>
          {m.role === "assistant" ? (
            // renderRich escapes its input, so model text can't inject markup.
            <div className="rounded-2xl rounded-tl-md bg-n-sunken px-3.5 py-2.5 text-[14px] leading-6 break-words" dangerouslySetInnerHTML={{ __html: renderRich(m.text) }} />
          ) : (
            <p className="max-w-[92%] rounded-2xl rounded-tr-md bg-n-moss px-3.5 py-2.5 text-[14px] leading-6 break-words whitespace-pre-wrap text-n-on-moss">{m.text}</p>
          )}
        </li>
      ))}
      {activity && (
        <li data-agent-activity className="n-breathe flex items-center gap-2 text-[13px] text-n-ink-3">
          <Mark size={14} />
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
    <details className="mt-3 text-xs text-n-ink-3">
      <summary className="cursor-pointer select-none font-medium">What it did ({job.steps.length})</summary>
      <ol className="mt-2 space-y-1.5 border-l border-n-line pl-3">
        {job.steps.map((step, i) => (
          <li key={i} className={step.status === "fail" ? "text-n-danger" : ""}>
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
  const input = useRef<HTMLTextAreaElement>(null);

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
  const starters = focusBlockId ? BLOCK_STARTERS : BOARD_STARTERS;

  return (
    <>
      {focusBlockId && (
        <div className="border-b border-n-line-soft px-4 py-2.5 text-xs" data-sources={sources.length}>
          {sources.length ? (
            <p>
              <span className="text-n-ink-3">Reads from </span>
              <span className="font-semibold">{sources.join(", ")}</span>
            </p>
          ) : (
            <p className="text-n-ink-3">Draw a line from another block to give the AI more context.</p>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty && (
          <div className="n-rise">
            <p className="text-[14.5px] leading-6 text-n-ink-2">
              {focusBlockId
                ? "Ask about this block, or tell the AI what to do with it. Everyone on the board sees this conversation."
                : "Ask about the board, or tell the AI what to do. It can add and connect blocks, and use its Slate and 3D specialists."}
            </p>
            <p className="n-eyebrow mt-5 mb-2">Try</p>
            <ul className="flex flex-wrap gap-2">
              {starters.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(text);
                      input.current?.focus();
                    }}
                    className="rounded-2xl border border-n-line bg-n-surface px-3 py-1.5 text-left text-[13px] leading-5 text-n-ink-2 transition-colors hover:border-n-leaf hover:bg-n-leaf-soft hover:text-n-moss"
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Conversation messages={messages} activity={running ? (lastStep ? label(lastStep) : "Thinking") : null} />
        {failed && (
          <p role="alert" className="mt-3 rounded-xl bg-n-danger-soft px-3 py-2 text-xs leading-5 text-n-danger">
            {failed}
          </p>
        )}
        {busyElsewhere && (
          <p data-agent-busy className="mt-3 text-xs leading-5 text-n-ink-3">
            The AI is working on another request on this board. You can ask here when it finishes.
          </p>
        )}
        {undoable && (
          <button type="button" disabled={undoing} onClick={() => void undo(undoable.id)} className="n-btn n-btn--outline n-btn--sm mt-3">
            {undoing ? "Undoing" : "Undo these changes"}
          </button>
        )}
        {mainJob && <RunDetails job={mainJob} />}
      </div>
      <form
        className="border-t border-n-line-soft p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && (
          <p role="alert" className="mb-2 text-xs text-n-danger">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-n-line bg-n-surface p-2 pl-3.5 transition-shadow focus-within:border-n-leaf focus-within:shadow-[0_0_0_3px_var(--n-leaf-ring)]">
          <textarea
            id="n-ai-input"
            ref={input}
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
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-5 outline-none placeholder:text-n-ink-3"
          />
          {running && current && (
            <button type="button" onClick={() => void cancelJob(projectId, (active.find((job) => job.kind === "main") ?? current).id)} className="n-btn n-btn--soft n-btn--sm">
              Stop
            </button>
          )}
          <button type="submit" aria-label="Ask" title={busyElsewhere ? "Wait for the current AI run to finish" : running ? "The AI is working — Stop it or wait" : !draft.trim() ? "Type a message first" : "Send (Enter)"} disabled={!draft.trim() || sending || running || busyElsewhere} className="n-btn n-btn--primary n-btn--icon shrink-0">
            <SendIcon />
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

function PanelContent({ doc, projectId, actor, personName, only, onClose }: Props & { only: string | null }) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const selected = useYValue([parts.blocks as never], () => {
    const found = only ? parts.blocks.get(only) : undefined;
    return found ? readLayout(found) : null;
  });

  return (
    <>
      {onClose && <button type="button" aria-label="Close AI panel" onClick={onClose} className="absolute inset-0 top-14 z-10 cursor-default bg-black/25 lg:hidden" />}
      <aside aria-label="AI panel" className="absolute top-14 right-0 bottom-0 z-20 flex w-[22rem] max-w-full shrink-0 flex-col border-l border-n-line-soft bg-n-surface shadow-[var(--n-shadow-2)] lg:static lg:shadow-none">
      <div className="flex items-center gap-2.5 border-b border-n-line-soft px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-n-leaf-soft text-n-moss">
          <SparkIcon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] leading-tight font-semibold">{selected ? selected.title : "AI"}</h2>
          <p className="text-xs text-n-ink-3">{selected ? "Starting from this block" : "Working with the whole board"}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close AI panel" title="Close AI panel" className="n-btn n-btn--ghost n-btn--icon n-btn--sm ml-auto shrink-0">
            <CloseIcon />
          </button>
        )}
        {null}
      </div>
      {/* The key gives each conversation its own draft and scroll position. */}
      <Chat key={selected?.id ?? BOARD_THREAD} doc={doc} projectId={projectId} threadId={selected?.id ?? BOARD_THREAD} focusBlockId={selected?.id ?? null} actor={actor} personName={personName} />
    </aside>
    </>
  );
}
