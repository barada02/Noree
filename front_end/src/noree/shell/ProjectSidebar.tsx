import { useEffect, useState, type ReactNode } from "react";
import { BRAND } from "../../brand";
import { coverFor } from "../lib/covers";
import { forgetProject, onProjectsChanged, projectHref, recentProjects } from "../lib/projects";
import { CloseIcon } from "../ui/icons";
import { Mark, Wordmark } from "../ui/Mark";
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
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-n-line-soft bg-n-rail md:flex">
      <a href="#/app" aria-label={`${BRAND.name} home`} className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Mark tile size={32} />
        <Wordmark />
      </a>
      <div className="px-3 pb-4">
        <NewProjectButton label="New project" className="n-btn n-btn--primary w-full" />
      </div>
      <p className="n-eyebrow px-5 pb-1.5">Your boards</p>
      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && <p className="px-3 py-2 text-sm leading-5 text-n-ink-3">Boards you open will show up here.</p>}
        <ul className="space-y-0.5">
          {projects.map((p) => (
            <li key={p.id}>
              <div className={`group flex items-center rounded-xl pr-1 ${p.id === activeId ? "bg-n-surface shadow-[var(--n-shadow-1)]" : "hover:bg-n-sunken"}`}>
                <a href={projectHref(p.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-[14px] font-medium">
                  <img src={coverFor(p.id)} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                  <span className="truncate">{p.title}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Remove ${p.title} from this list`}
                  title="Remove from this list. The project and its link keep working."
                  onClick={() => forgetProject(p.id)}
                  className="n-btn n-btn--ghost n-btn--sm n-btn--icon text-n-ink-3 opacity-70 group-hover:opacity-100 focus:opacity-100 lg:opacity-0"
                >
                  <CloseIcon />
                </button>
              </div>
              {p.id === activeId && children}
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-n-line-soft px-5 py-3 text-xs text-n-ink-3">
        <a href="#/" className="hover:text-n-ink">
          About {BRAND.name}
        </a>
      </div>
    </aside>
  );
}
