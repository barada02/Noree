import type { ComponentType, SVGProps } from "react";
import * as Y from "yjs";
import type { BlockType } from "../../shared/schema.js";
import { CubeIcon, FrameIcon, PenIcon, StickyIcon, TextIcon } from "../ui/icons";
import { Model3dPreview } from "./model3d/Model3dPreview";
import { SlatePreview } from "./slate/SlatePreview";
import { StickyPreview, TextPreview } from "./text/TextBlocks";

export type BlockProps = { doc: Y.Doc; id: string };

export type BlockDefinition = {
  type: BlockType;
  label: string;
  /** One line shown in the dock's tooltip. */
  hint: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  Preview: ComponentType<BlockProps>;
  /** Opens full screen on double-click. */
  hasFocus?: boolean;
};

/** Adding a block type means one component folder and one entry here. */
export const BLOCKS: BlockDefinition[] = [
  { type: "slate", label: "Slate", hint: "Write or sketch by hand, and let the AI annotate it", Icon: PenIcon, Preview: SlatePreview, hasFocus: true },
  { type: "text", label: "Text", hint: "A note you can write in", Icon: TextIcon, Preview: TextPreview },
  { type: "sticky", label: "Sticky", hint: "A quick coloured note", Icon: StickyIcon, Preview: StickyPreview },
  { type: "model3d", label: "3D model", hint: "Generate a 3D model from a prompt or from connected blocks", Icon: CubeIcon, Preview: Model3dPreview, hasFocus: true },
  { type: "frame", label: "Frame", hint: "Group blocks together", Icon: FrameIcon, Preview: () => null },
];

export const BLOCK_BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b])) as Record<BlockType, BlockDefinition>;
