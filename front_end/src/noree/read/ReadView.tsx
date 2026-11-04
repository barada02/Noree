import { useMemo } from "react";
import * as Y from "yjs";
import { boardOutline, type OutlineSection } from "../../shared/outline.js";
import { docParts, type BlockLayout, type Model3dVersion } from "../../shared/schema.js";
import { SlatePageCanvas } from "../blocks/slate/SlatePageCanvas";
import { usePageContents } from "../blocks/slate/useSlate";
import { WidgetStateProvider } from "../blocks/slate/widgetState";
import { useYValue } from "../doc/useY";
import { renderRich } from "../lib/rich";

function SlatePage({ page, label }: { page: Y.Map<unknown>; label: string | null }) {
  const { types, strokes, objects, pastes } = usePageContents(page);
  const transcript = useYValue([page as never], () => (page.get("transcript") as { text: string } | null)?.text ?? null);
  if (!types) return null;
  const empty = !strokes.length && !objects.length && !pastes.length;
  return (
    <figure className="m-0">
      {label && <figcaption className="mb-1 text-xs text-n-ink-3">{label}</figcaption>}
      {empty ? (
        <p className="text-sm text-n-ink-3 italic">This page is empty.</p>
      ) : (
        <div className="slate-scope aspect-[8/5] w-full overflow-hidden rounded-lg border border-n-line-soft bg-n-surface">
          <WidgetStateProvider map={types.widgetValues}>
            <SlatePageCanvas strokes={strokes} objects={objects} pastes={pastes} />
          </WidgetStateProvider>
        </div>
      )}
      {transcript && <div className="mt-2 text-sm leading-6" dangerouslySetInnerHTML={{ __html: renderRich(transcript) }} />}
    </figure>
  );
}

function ReadBlock({ doc, block }: { doc: Y.Doc; block: BlockLayout }) {
  const content = docParts(doc).content.get(block.id);
  const text = useYValue([(content ?? new Y.Map()) as never], () => String(content?.get("text") ?? ""));
  const model = useYValue([(content ?? new Y.Map()) as never], () => {
    if (block.type !== "model3d") return null;
    const versions = (content?.get("versions") as Y.Array<Model3dVersion> | undefined)?.toArray() ?? [];
    return {
      prompt: String(content?.get("prompt") ?? ""),
      current: versions.find((v) => v.id === content?.get("currentVersionId")) ?? null,
    };
  });

  let body;
  if (block.type === "text") {
    body = text ? <p className="whitespace-pre-wrap leading-7">{text}</p> : <p className="text-sm text-n-ink-3 italic">Empty.</p>;
  } else if (block.type === "sticky") {
    body = text ? <p className="rounded-xl bg-n-butter px-4 py-3 whitespace-pre-wrap text-n-butter-ink">{text}</p> : <p className="text-sm text-n-ink-3 italic">Empty.</p>;
  } else if (block.type === "slate") {
    const pages = (content?.get("pages") as Y.Array<Y.Map<unknown>> | undefined)?.toArray() ?? [];
    body = (
      <div className="space-y-4">
        {pages.map((page, i) => (
          <SlatePage key={String(page.get("id"))} page={page} label={pages.length > 1 ? `Page ${i + 1}` : null} />
        ))}
      </div>
    );
  } else if (model) {
    const preview = model.current?.previewAsset?.startsWith("/api/assets/") ? model.current.previewAsset : null;
    body = (
      <div className="space-y-2">
        {preview && <img src={preview} alt={model.current?.brief ?? "Generated 3D model"} className="w-full rounded-lg bg-stone-950" />}
        {model.prompt && <p className="text-sm"><span className="text-n-ink-3">Prompt: </span>{model.prompt}</p>}
        {model.current?.brief && <p className="text-sm"><span className="text-n-ink-3">Brief: </span>{model.current.brief}</p>}
        {model.current?.status === "draft" && <p className="text-sm text-n-butter-ink">Draft: this model did not pass review.</p>}
        {!model.current && <p className="text-sm text-n-ink-3 italic">Not generated yet.</p>}
      </div>
    );
  }
  return (
    <article data-read-block={block.title}>
      <h3 className="mb-2 text-[17px] font-semibold">{block.title}</h3>
      {body}
    </article>
  );
}

function Section({ doc, section }: { doc: Y.Doc; section: OutlineSection }) {
  return (
    <section data-read-section={section.frame?.title ?? ""} className="space-y-6">
      {section.frame && <h2 className="border-b border-n-line-soft pb-1 n-display text-[27px]">{section.frame.title}</h2>}
      {section.frame && !section.blocks.length && <p className="text-sm text-n-ink-3 italic">This frame is empty.</p>}
      {section.blocks.map((block) => (
        <ReadBlock key={block.id} doc={doc} block={block} />
      ))}
    </section>
  );
}

/** The board as a document: frames in order, then blocks by position. Live, like the board. */
export function ReadView({ doc }: { doc: Y.Doc }) {
  const parts = useMemo(() => docParts(doc), [doc]);
  const sections = useYValue([parts.blocks as never, parts.order as never], () => boardOutline(doc));
  const title = useYValue([parts.meta as never], () => String(parts.meta.get("title") ?? ""));
  return (
    <div data-read-view className="absolute inset-0 z-10 overflow-y-auto bg-n-bg">
      <div className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <h1 className="n-display text-[42px] leading-tight">{title}</h1>
        {sections.length === 0 && <p className="text-n-ink-3">This board is empty. Switch to Board and add a block.</p>}
        {sections.map((section) => (
          <Section key={section.frame?.id ?? "loose"} doc={doc} section={section} />
        ))}
      </div>
    </div>
  );
}
