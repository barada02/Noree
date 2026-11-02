import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultProps,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

const KINDS = ["note", "tip", "warn"] as const;
type AlertKind = (typeof KINDS)[number];

function nextKind(kind: string): AlertKind {
  const idx = KINDS.indexOf(kind as AlertKind);
  return KINDS[(idx + 1) % KINDS.length];
}

/**
 * A hand-built callout block: the "build our own" part of this experiment.
 * Inline content stays editable; the header bar is inert chrome.
 */
export const Alert = createReactBlockSpec(
  {
    type: "alert",
    propSchema: {
      ...defaultProps,
      kind: { default: "note" as AlertKind, values: KINDS },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div
        className="bn-alert"
        data-kind={block.props.kind}
        style={{ textAlign: block.props.textAlignment }}
      >
        <div className="bn-alert-bar" contentEditable={false}>
          <span className="bn-alert-label">{block.props.kind}</span>
          <button
            type="button"
            className="bn-alert-cycle"
            contentEditable={false}
            onClick={() =>
              editor.updateBlock(block.id, {
                type: "alert",
                props: { kind: nextKind(block.props.kind) },
              })
            }
          >
            cycle kind
          </button>
        </div>
        <div ref={contentRef} />
      </div>
    ),
    toExternalHTML: ({ block, childrenRef }) => (
      <aside className="bn-alert" data-kind={block.props.kind}>
        <p ref={childrenRef} />
      </aside>
    ),
  },
);

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    alert: Alert(),
  },
});

export type LabEditor = typeof schema.BlockNoteEditor;
export type LabBlock = typeof schema.Block;
export type LabPartialBlock = typeof schema.PartialBlock;
