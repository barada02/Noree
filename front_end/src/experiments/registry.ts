export type ExperimentStatus = "live" | "soon";

export interface ExperimentMeta {
  id: string;
  title: string;
  tagline: string;
  route: string;
  tags: string[];
  status: ExperimentStatus;
}

export const EXPERIMENTS: ExperimentMeta[] = [
  {
    id: "blocknote",
    title: "BlockNote editor",
    tagline:
      "Notion-style block editing on ProseMirror, plus a hand-built custom callout block.",
    route: "#/blocknote",
    tags: ["BlockNote 0.57", "custom blocks", "export"],
    status: "live",
  },
  {
    id: "reactflow",
    title: "React Flow",
    tagline:
      "Node graphs with a hand-built stage node, live selection inspector and persisted layout.",
    route: "#/reactflow",
    tags: ["XYFlow 12", "custom nodes", "inspector"],
    status: "live",
  },
  {
    id: "own-block-editor",
    title: "Mini block editor from scratch",
    tagline:
      "Our own contentEditable block model to compare against BlockNote's architecture.",
    route: "#/own-block-editor",
    tags: ["contentEditable", "build our own"],
    status: "soon",
  },
  {
    id: "virtual-list",
    title: "Virtualized 100k rows",
    tagline:
      "Windowing a huge list by hand, then against a library, with scroll benchmarks.",
    route: "#/virtual-list",
    tags: ["perf", "build our own"],
    status: "soon",
  },
  {
    id: "suspense-data",
    title: "Suspense data fetching",
    tagline: "Comparing use() + cache patterns with plain useEffect fetching.",
    route: "#/suspense-data",
    tags: ["React 19", "use()"],
    status: "soon",
  },
];
