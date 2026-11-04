import type { ComponentType, ReactNode } from "react";
import * as Y from "yjs";
import { docParts, type BlockType } from "../../shared/schema.js";
import { YTextArea } from "../doc/YTextArea";
import { SlatePreview } from "./slate/SlatePreview";

export type BlockProps = { doc: Y.Doc; id: string };

export type BlockDefinition = {
  type: BlockType;
  label: string;
  icon: ReactNode;
  Preview: ComponentType<BlockProps>;
  /** Opens full screen on double-click. */
  hasFocus?: boolean;
};

function TextContent({ doc, id, placeholder, className }: BlockProps & { placeholder: string; className: string }) {
  const text = docParts(doc).content.get(id)?.get("text");
  if (!(text instanceof Y.Text)) return null;
  return <YTextArea text={text} placeholder={placeholder} className={className} />;
}

function TextPreview(props: BlockProps) {
  return <TextContent {...props} placeholder="Write something" className="px-3 py-2 text-sm leading-6" />;
}

function StickyPreview(props: BlockProps) {
  return <TextContent {...props} placeholder="Quick note" className="px-3 py-2 text-[15px] leading-6" />;
}

/** Replaced by the real Slate at M3 and the real 3D block at M5. */
function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center font-mono text-[11px] tracking-widest text-stone-400 uppercase">
      {label}
    </div>
  );
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

export const BLOCKS: BlockDefinition[] = [
  {
    type: "slate",
    label: "Slate",
    icon: icon(<path d="M4 20c3-1 4-5 7-9s5-6 7-5-1 5-3 8-3 5-1 5 3-1 6-3" />),
    Preview: SlatePreview,
    hasFocus: true,
  },
  {
    type: "text",
    label: "Text",
    icon: icon(<path d="M5 6h14M12 6v13M9 19h6" />),
    Preview: TextPreview,
  },
  {
    type: "sticky",
    label: "Sticky",
    icon: icon(<path d="M5 5h14v9l-5 5H5zM14 19v-5h5" />),
    Preview: StickyPreview,
  },
  {
    type: "model3d",
    label: "3D model",
    icon: icon(<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />),
    Preview: () => <Placeholder label="3D model" />,
  },
  {
    type: "frame",
    label: "Frame",
    icon: icon(<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" />),
    Preview: () => null,
  },
];

export const BLOCK_BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b])) as Record<BlockType, BlockDefinition>;
