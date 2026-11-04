import { newId, type ActorRef } from "../../shared/schema.js";

const KEY = "noree-person";
const ADJECTIVES = ["Swift", "Quiet", "Bright", "Calm", "Bold", "Keen", "Warm", "Sharp"];
const ANIMALS = ["Otter", "Heron", "Fox", "Lynx", "Wren", "Seal", "Hare", "Crane"];

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

function store(id: string, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, name }));
  } catch {
    // Storage can be refused. The identity then lasts for this page load.
  }
}

/** There are no accounts, so a person is a random id and an editable name kept in this browser. */
export function localActor(): ActorRef {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { id?: string; name?: string } | null;
    if (stored?.id && stored.name) return { kind: "person", id: stored.id, name: stored.name };
  } catch {
    // Fall through and make a new identity.
  }
  const actor: ActorRef = { kind: "person", id: newId(), name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}` };
  store(actor.id, actor.name);
  return actor;
}

export function renameLocalActor(name: string) {
  store(localActor().id, name);
}

/** Marks this browser's own edits, so undo tracks them and not edits from others or from agents. */
export const LOCAL_ORIGIN = "noree-local";
