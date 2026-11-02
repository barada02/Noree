import type { ReactNode } from "react";
import { EXPERIMENTS } from "../experiments/registry";
import { useTheme } from "../useTheme";

function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  return theme === "light" ? (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function Shell({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const { theme, toggle } = useTheme();
  const live = EXPERIMENTS.filter((e) => e.status === "live");
  const soon = EXPERIMENTS.filter((e) => e.status === "soon");

  return (
    <div className="min-h-screen md:flex">
      {/* Top bar (mobile) */}
      <header className="border-b border-stone-200 md:hidden dark:border-stone-800">
        <div className="flex items-center justify-between px-4 py-3">
          <a href="#/" className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">Noree</span>
            <span className="font-mono text-xs text-stone-500 dark:text-stone-400">
              react·lab
            </span>
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="rounded-md border border-stone-300 p-2 dark:border-stone-700"
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
          <a
            href="#/"
            className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
              route === "" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : ""
            }`}
          >
            Overview
          </a>
          {live.map((e) => (
            <a
              key={e.id}
              href={e.route}
              className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                route === e.id
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : ""
              }`}
            >
              {e.title}
            </a>
          ))}
        </nav>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 md:flex dark:border-stone-800">
        <a href="#/" className="flex items-baseline gap-2 px-5 pt-6">
          <span className="text-xl font-semibold tracking-tight">Noree</span>
          <span className="font-mono text-xs text-stone-500 dark:text-stone-400">
            react·lab
          </span>
        </a>
        <p className="px-5 pt-2 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
          Small experiments with React tech. Prefer building our own.
        </p>
        <nav className="mt-6 flex-1 space-y-0.5 px-3">
          <a
            href="#/"
            className={`block rounded-md px-3 py-1.5 text-sm ${
              route === ""
                ? "bg-stone-100 font-medium dark:bg-stone-800"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            Overview
          </a>
          <p className="px-3 pt-4 pb-1 font-mono text-[11px] tracking-widest text-stone-400 uppercase dark:text-stone-500">
            Live
          </p>
          {live.map((e, i) => (
            <a
              key={e.id}
              href={e.route}
              className={`flex items-baseline gap-2 rounded-md px-3 py-1.5 text-sm ${
                route === e.id
                  ? "bg-stone-100 font-medium dark:bg-stone-800"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              <span className="font-mono text-[11px] text-stone-400 dark:text-stone-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              {e.title}
            </a>
          ))}
          <p className="px-3 pt-4 pb-1 font-mono text-[11px] tracking-widest text-stone-400 uppercase dark:text-stone-500">
            Up next
          </p>
          {soon.map((e) => (
            <span
              key={e.id}
              className="block cursor-default rounded-md px-3 py-1.5 text-sm text-stone-400 dark:text-stone-500"
            >
              {e.title}
            </span>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-3 dark:border-stone-800">
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <ThemeIcon theme={theme} />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
