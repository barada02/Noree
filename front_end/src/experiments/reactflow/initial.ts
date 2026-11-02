import { MarkerType, type Edge } from "@xyflow/react";
import { StageNode, type StageNodeType } from "./nodes";

export const nodeTypes = { stage: StageNode };

const arrow = { type: MarkerType.ArrowClosed as const };

export const INITIAL_NODES: StageNodeType[] = [
  {
    id: "fetch",
    type: "stage",
    position: { x: 0, y: 190 },
    data: {
      title: "Fetch rows",
      kind: "source",
      detail: "2.4k rows/s",
      status: "done",
    },
  },
  {
    id: "parse",
    type: "stage",
    position: { x: 280, y: 60 },
    data: {
      title: "Parse",
      kind: "process",
      detail: "json → blocks",
      status: "done",
    },
  },
  {
    id: "enrich",
    type: "stage",
    position: { x: 280, y: 310 },
    data: {
      title: "Enrich",
      kind: "process",
      detail: "+ metadata",
      status: "active",
    },
  },
  {
    id: "validate",
    type: "stage",
    position: { x: 560, y: 185 },
    data: {
      title: "Validate",
      kind: "process",
      detail: "schema check",
      status: "idle",
    },
  },
  {
    id: "publish",
    type: "stage",
    position: { x: 840, y: 185 },
    data: {
      title: "Publish",
      kind: "sink",
      detail: "to inspector",
      status: "idle",
    },
  },
];

export const INITIAL_EDGES: Edge[] = [
  { id: "fetch-parse", source: "fetch", target: "parse", markerEnd: arrow },
  { id: "fetch-enrich", source: "fetch", target: "enrich", markerEnd: arrow },
  {
    id: "parse-validate",
    source: "parse",
    target: "validate",
    type: "smoothstep",
    markerEnd: arrow,
  },
  {
    id: "enrich-validate",
    source: "enrich",
    target: "validate",
    type: "smoothstep",
    markerEnd: arrow,
  },
  {
    id: "validate-publish",
    source: "validate",
    target: "publish",
    animated: true,
    markerEnd: arrow,
  },
];
