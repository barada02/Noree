import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useEffect, useState } from "react";
import { useTheme } from "../../useTheme";
import { STARTER_DOC } from "./initialContent";
import {
  schema,
  type LabBlock,
  type LabEditor,
  type LabPartialBlock,
} from "./schema";

const STORAGE_KEY = "noree:blocknote-doc";

type OutputTab = "markdown" | "html" | "json";

type Snapshot = {
  blocks: number;
  words: number;
  chars: number;
  markdown: string;
  html: string;
  json: string;
};

function loadDoc(): LabPartialBlock[] | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as LabPartialBlock[])
      : undefined;
  } catch {
    return undefined;
  }
}

function countBlocks(blocks: LabBlock[]): number {
  return blocks.reduce((n, b) => n + 1 + countBlocks(b.children), 0);
}

function snapshot(editor: LabEditor): Snapshot {
  const markdown = editor.blocksToMarkdownLossy();
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return {
    blocks: countBlocks(editor.document),
    words,
    chars: markdown.length,
    markdown,
    html: editor.blocksToHTMLLossy(),
    json: JSON.stringify(editor.document, null, 2),
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch {
      return false;
    }
  }
}

const OUTPUT_TABS: { id: OutputTab; label: string }[] = [
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "json", label: "JSON" },
];

export default function BlockNoteExperiment() {
  const { theme } = useTheme();
  const [persisted] = useState(loadDoc);
  const [editable, setEditable] = useState(true);
  const [outputTab, setOutputTab] = useState<OutputTab>("markdown");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  const editor = useCreateBlockNote({
    schema,
    initialContent: persisted ?? STARTER_DOC,
  });

  useEffect(() => {
    setSnap(snapshot(editor));
    if (persisted) setSavedAt("restored session");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  function handleChange(next: LabEditor) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.document));
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setSavedAt("save failed");
    }
    setSnap(snapshot(next));
  }

  function insertCallout() {
    const pos = editor.getTextCursorPosition();
    const [inserted] = editor.insertBlocks(
      [
        {
          type: "alert",
          props: { kind: "note" },
          content: "Fresh callout — cycle its kind, or keep typing below.",
        },
      ],
      pos.block.id,
      "after",
    );
    editor.setTextCursorPosition(inserted.id, "end");
    editor.focus();
  }

  function resetDoc() {
    editor.replaceBlocks(
      editor.document.map((b) => b.id),
      STARTER_DOC,
    );
    handleChange(editor);
    setNotice("Starter doc restored");
  }

  async function copyCurrent() {
    if (!snap) return;
    const ok = await copyText(snap[outputTab]);
    setNotice(ok ? `Copied ${outputTab}` : "Copy failed");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <p className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
        experiment — 01 / editor
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">BlockNote</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-stone-600 dark:text-stone-400">
        A block-based rich text editor on ProseMirror and TipTap. Below it runs
        with a custom schema: every default block plus our own{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] dark:bg-stone-800">
          alert
        </code>{" "}
        callout.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={insertCallout}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          Insert callout
        </button>
        <button
          type="button"
          onClick={copyCurrent}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Copy {outputTab}
        </button>
        <button
          type="button"
          onClick={resetDoc}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Reset doc
        </button>
        <label className="ml-1 flex cursor-pointer items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
          <input
            type="checkbox"
            checked={editable}
            onChange={(e) => setEditable(e.target.checked)}
            className="h-4 w-4 accent-emerald-700"
          />
          Editable
        </label>
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
        <div className="min-w-0 rounded-lg border border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-950">
          <BlockNoteView
            editor={editor}
            theme={theme}
            editable={editable}
            onChange={handleChange}
          />
        </div>

        <aside className="h-fit rounded-lg border border-stone-200 dark:border-stone-800">
          <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
              Inspector
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "blocks", value: snap?.blocks ?? "—" },
                { label: "words", value: snap?.words ?? "—" },
                { label: "chars", value: snap?.chars ?? "—" },
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
            <div className="flex gap-1">
              {OUTPUT_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOutputTab(t.id)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs ${
                    outputTab === t.id
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-stone-100 p-3 font-mono text-xs leading-5 whitespace-pre-wrap dark:bg-stone-900">
              {snap ? snap[outputTab] : "Loading…"}
            </pre>
            <p className="mt-3 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              Exports update live via{" "}
              <code className="font-mono text-xs">blocksToMarkdownLossy</code>,{" "}
              <code className="font-mono text-xs">blocksToHTMLLossy</code> and{" "}
              <code className="font-mono text-xs">editor.document</code>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
