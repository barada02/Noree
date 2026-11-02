import type { LabPartialBlock } from "./schema";

export const STARTER_DOC: LabPartialBlock[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: "BlockNote, inside Noree",
  },
  {
    type: "paragraph",
    content:
      "This is experiment 01: a Notion-style block editor powered by BlockNote. Everything below is editable — try the slash menu (/), select text for the formatting toolbar, or drag blocks by their side handle.",
  },
  {
    type: "alert",
    props: { kind: "tip" },
    content:
      "This callout is not from BlockNote's library — it's a custom block built for this lab. Hit “cycle kind” to flip it between note, tip and warn.",
  },
  {
    type: "heading",
    props: { level: 3 },
    content: "Things to try",
  },
  {
    type: "bulletListItem",
    content: "Type / to insert tables, code blocks, dividers and more.",
  },
  {
    type: "bulletListItem",
    content: "Use the toolbar above to insert another callout at your cursor.",
  },
  {
    type: "bulletListItem",
    content: [
      {
        type: "text",
        text: "Edits auto-save to localStorage",
        styles: { bold: true },
      },
      {
        type: "text",
        text: " — reload the page and your doc survives.",
        styles: {},
      },
    ],
  },
  {
    type: "codeBlock",
    props: { language: "typescript" },
    content:
      'const editor = useCreateBlockNote({ schema });\neditor.blocksToMarkdownLossy(); // live in the inspector →',
  },
  {
    type: "divider",
  },
  {
    type: "paragraph",
    content:
      "The inspector panel shows live document stats plus Markdown, HTML and JSON exports. Dark mode follows the theme toggle in the sidebar.",
  },
];
