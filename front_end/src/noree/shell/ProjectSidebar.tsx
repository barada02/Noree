import { useEffect, useState, type ReactNode } from "react";
import { forgetProject, onProjectsChanged, projectHref, recentProjects } from "../lib/projects";
import { NewProjectButton } from "./NewProjectButton";

type Props = {
  activeId: string | null;
  /** Frames of the open project, shown under it. */
  children?: ReactNode;
};

export function ProjectSidebar({ activeId, children }: Props) {
  const [projects, setProjects] = useState(recentProjects);
  useEffect(() => onProjectsChanged(() => setProjects(recentProjects())), []);

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col md:flex border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center justify-between px-4 py-3">
        <a href="#/" className="text-base font-semibold tracking-tight">
          Noree
        </a>
        <a href="#/app" className="font-mono text-[10px] tracking-widest text-stone-500 uppercase hover:underline">
          Projects
        </a>
      </div>
      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && <p className="px-2 py-2 text-sm text-stone-500">No projects yet.</p>}
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <div
                className={`group flex items-center rounded-md ${
                  p.id === activeId ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-50 dark:hover:bg-stone-900"
                }`}
              >
                <a href={projectHref(p.id)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm">
                  {p.title}
                </a>
                <button
                  type="button"
                  aria-label={`Remove ${p.title} from this list`}
                  title="Remove from this list. The project and its link keep working."
                  onClick={() => forgetProject(p.id)}
                  className="px-2 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-900 focus:opacity-100 dark:hover:text-stone-100"
                >
                  ×
                </button>
              </div>
              {p.id === activeId && children}
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-stone-200 p-2 dark:border-stone-800">
        <NewProjectButton
          label="+ New project"
          className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"
        />
      </div>
    </aside>
  );
}
