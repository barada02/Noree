import { newId } from "../../shared/schema.js";

/**
 * Each browser remembers its own projects. There is deliberately no server-side list: with no
 * login, a list would hand every project link to anyone who asked.
 */
export type RecentProject = { id: string; title: string; openedAt: number };

const KEY = "noree-projects";
const EVENT = "noree-projects-changed";

export function recentProjects(): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentProject[]) : [];
  } catch {
    return [];
  }
}

function save(projects: RecentProject[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    // Private windows can refuse storage. The project still works through its link.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function rememberProject(id: string, title: string) {
  const others = recentProjects().filter((p) => p.id !== id);
  save([{ id, title, openedAt: Date.now() }, ...others]);
}

export function forgetProject(id: string) {
  save(recentProjects().filter((p) => p.id !== id));
}

export function onProjectsChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** M2 replaces this with POST /api/projects, which also registers the project on the server. */
export async function createProject(): Promise<string> {
  return newId() + newId();
}

export function projectHref(id: string) {
  return `#/p/${id}`;
}
