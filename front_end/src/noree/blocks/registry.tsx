import type { ComponentType, ReactNode } from "react";
import * as Y from "yjs";
import type { BlockType } from "../../shared/schema.js";
import { Model3dPreview } from "./model3d/Model3dPreview";
import { SlatePreview } from "./slate/SlatePreview";
import { StickyPreview, TextPreview } from "./text/TextBlocks";

export type BlockProps = { doc: Y.Doc; id: string };

export type BlockDefinition = {
  type: BlockType;
  label: string;
  icon: ReactNode;
  Preview: ComponentType<BlockProps>;
  /** Opens full screen on double-click. */
  hasFocus?: boolean;
};

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

/** Adding a block type means one component folder and one entry here. */
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
    Preview: Model3dPreview,
    hasFocus: true,
  },
  {
    type: "frame",
    label: "Frame",
    icon: icon(<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" />),
    Preview: () => null,
  },
];

export const BLOCK_BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b])) as Record<BlockType, BlockDefinition>;
