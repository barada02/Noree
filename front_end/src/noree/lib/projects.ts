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

export async function createProject(title?: string): Promise<string> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "Too many new projects right now. Try again later." : "Couldn't create the project.");
  return ((await res.json()) as { id: string }).id;
}

/** False only when the server says it doesn't exist. A network failure still opens the local copy. */
export async function projectExists(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${id}`);
    return res.status !== 404;
  } catch {
    return true;
  }
}

export function projectHref(id: string) {
  return `#/p/${id}`;
}
