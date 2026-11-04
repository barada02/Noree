import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { docParts, readEdge, readLayout, type ActorRef, type Message } from "../../shared/schema.js";
import { isStale, useBlockJobs } from "../doc/useJobs";
import { useYValue } from "../doc/useY";
import { cancelJob, startChat } from "../lib/api";
import { renderRich } from "../lib/rich";

type Props = {
  doc: Y.Doc;
  projectId: string;
  /** Ids of the selected blocks. The panel follows when exactly one is selected. */
  selectedIds: string[];
  actor: ActorRef;
  personName: string;
};

function Conversation({ messages, activity }: { messages: Message[]; activity: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activity]);

  if (!messages.length && !activity) {
    return <p className="text-sm text-stone-500">Ask about this block. Everyone on the board sees this conversation.</p>;
  }
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
      {activity && <li className="animate-pulse text-xs text-stone-500">{activity}</li>}
      <div ref={end} />
    </ol>
  );
}

function BlockChat({ doc, projectId, blockId, actor, personName }: { doc: Y.Doc; projectId: string; blockId: string; actor: ActorRef; personName: string }) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const jobs = useBlockJobs(doc, blockId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const messages = useYValue([parts.threads as never], () => parts.threads.get(blockId)?.toArray() ?? []);
  const sources = useYValue([parts.edges as never, parts.blocks as never], () => {
    const titles: string[] = [];
    parts.edges.forEach((edge) => {
      const { source, target } = readEdge(edge);
      const block = target === blockId ? parts.blocks.get(source) : undefined;
      if (block) titles.push(readLayout(block).title);
    });
    return titles;
  });

  const latest = jobs[0];
  const running = !!latest && latest.status === "running" && !isStale(latest, now);
  const lastStep = latest?.steps.at(-1)?.title;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [running]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || running) return;
    setSending(true);
    setError(null);
    try {
      await startChat(projectId, blockId, { text, person: { id: actor.id, name: personName } });
      setDraft("");
      setNow(Date.now());
    } catch (e) {
      // The draft stays, so nothing typed is lost.
      setError(e instanceof Error ? e.message : "The question couldn't be sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  const failed = latest?.status === "failed" ? latest.error : latest && isStale(latest, now) ? "This run stopped responding. Try again." : null;

  return (
    <>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Conversation messages={messages} activity={running ? (lastStep ? `${lastStep}…` : "Starting…") : null} />
        {failed && (
          <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">
            {failed}
          </p>
        )}
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
          aria-label="Ask about this block"
          placeholder="Ask about this block"
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
          {running && (
            <button type="button" onClick={() => void cancelJob(projectId, latest.id)} className="rounded-md border border-stone-300 px-2.5 py-1 text-xs dark:border-stone-700">
              Stop
            </button>
          )}
          <button type="submit" disabled={!draft.trim() || sending || running} className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900">
            Ask
          </button>
        </div>
      </form>
    </>
  );
}

/** One chat that follows the selected block. Each block keeps its own thread, shared by everyone. */
export function AiPanel(props: Props) {
  const { selectedIds } = props;
  const only = selectedIds.length === 1 ? selectedIds[0] : null;
  // The key makes a new selection read fresh, instead of showing the previous block's values.
  return <PanelContent key={only ?? `none-${selectedIds.length}`} only={only} {...props} />;
}

function PanelContent({ doc, projectId, selectedIds, actor, personName, only }: Props & { only: string | null }) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const selected = useYValue([parts.blocks as never], () => {
    const found = only ? parts.blocks.get(only) : undefined;
    return found ? readLayout(found) : null;
  });
  const chatBlock = selected && selected.type !== "frame" ? selected : null;

  return (
    <aside aria-label="AI panel" className="absolute top-11 right-0 bottom-0 z-20 flex w-80 max-w-full shrink-0 flex-col border-l border-stone-200 bg-white lg:static dark:border-stone-800 dark:bg-stone-950">
      <h2 className="truncate border-b border-stone-200 px-3 py-2 text-sm font-medium dark:border-stone-800">{chatBlock ? chatBlock.title : "AI"}</h2>
      {chatBlock ? (
        // The key gives each block its own draft and scroll position.
        <BlockChat key={chatBlock.id} doc={doc} projectId={projectId} blockId={chatBlock.id} actor={actor} personName={personName} />
      ) : (
        <p className="px-3 py-3 text-sm text-stone-500">
          {selectedIds.length > 1 ? "Select one block to ask about it." : selected ? "Frames group blocks. Select a block inside to ask about it." : "Select a block to ask about it."}
        </p>
      )}
    </aside>
  );
}
