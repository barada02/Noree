import { useEffect, useState, type ReactNode } from "react";
import { BRAND } from "../../brand";
import { coverFor } from "../lib/covers";
import { forgetProject, onProjectsChanged, projectHref, recentProjects } from "../lib/projects";
import { ChevronIcon, CloseIcon } from "../ui/icons";
import { Mark, Wordmark } from "../ui/Mark";
import { NewProjectButton } from "./NewProjectButton";

type Props = {
  activeId: string | null;
  /** Frames of the open project, shown under it. */
  children?: ReactNode;
};

const COLLAPSED_KEY = "noree-sidebar-collapsed";

export function ProjectSidebar({ activeId, children }: Props) {
  const [projects, setProjects] = useState(recentProjects);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => onProjectsChanged(() => setProjects(recentProjects())), []);

  const toggle = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        // Private windows can refuse storage; collapsing for this session still works.
      }
      return !prev;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "[") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // toggle reads and writes the previous state, so it stays stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className={`hidden h-full ${collapsed ? "w-[4.25rem]" : "w-64"} shrink-0 flex-col border-r border-n-line-soft bg-n-rail transition-[width] duration-200 md:flex`}>
      <div className={`flex ${collapsed ? "flex-col items-center gap-2 px-2" : "items-center gap-2.5 px-5"} pt-5 pb-4`}>
        <a href="#/app" aria-label={`${BRAND.name} home`} title={collapsed ? BRAND.name : undefined} className="flex items-center gap-2.5">
          <Mark tile size={32} />
          {!collapsed && <Wordmark />}
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
          className={`n-btn n-btn--ghost n-btn--icon n-btn--sm shrink-0 text-n-ink-2 ${collapsed ? "" : "ml-auto"}`}
        >
          <ChevronIcon className={collapsed ? "" : "rotate-180"} />
        </button>
      </div>
      <div className={`${collapsed ? "px-2" : "px-3"} pb-4`}>
        <NewProjectButton label={collapsed ? "" : "New project"} className={`n-btn n-btn--primary w-full ${collapsed ? "!px-0" : ""}`} />
      </div>
      {!collapsed && <p className="n-eyebrow px-5 pb-1.5">Your boards</p>}
      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && !collapsed && <p className="px-3 py-2 text-sm leading-5 text-n-ink-3">Boards you open will show up here.</p>}
        <ul className="space-y-0.5">
          {projects.map((p) => (
            <li key={p.id}>
              <div className={`group flex items-center rounded-xl ${collapsed ? "justify-center" : "pr-1"} ${p.id === activeId ? "bg-n-surface shadow-[var(--n-shadow-1)]" : "hover:bg-n-sunken"}`}>
                <a
                  href={projectHref(p.id)}
                  title={collapsed ? p.title : undefined}
                  aria-label={collapsed ? p.title : undefined}
                  className={`flex min-w-0 items-center gap-2.5 text-[14px] font-medium ${collapsed ? "justify-center px-2 py-2" : "flex-1 px-2 py-1.5"}`}
                >
                  <img src={coverFor(p.id)} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                  {!collapsed && <span className="truncate">{p.title}</span>}
                </a>
                {!collapsed && (
                  <button
                    type="button"
                    aria-label={`Remove ${p.title} from this list`}
                    title="Remove from this list. The project and its link keep working."
                    onClick={() => forgetProject(p.id)}
                    className="n-btn n-btn--ghost n-btn--sm n-btn--icon text-n-ink-3 opacity-70 group-hover:opacity-100 focus:opacity-100 lg:opacity-0"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              {!collapsed && p.id === activeId && children}
            </li>
          ))}
        </ul>
      </nav>
      <div className={`border-t border-n-line-soft py-3 text-xs text-n-ink-3 ${collapsed ? "px-2 text-center" : "px-5"}`}>
        <a href="#/" className="hover:text-n-ink" title={collapsed ? `About ${BRAND.name}` : undefined}>
          {collapsed ? "?" : `About ${BRAND.name}`}
        </a>
      </div>
    </aside>
  );
}
