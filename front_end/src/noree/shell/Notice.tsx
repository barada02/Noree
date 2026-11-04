import { NewProjectButton } from "./NewProjectButton";
import { ProjectSidebar } from "./ProjectSidebar";

/** The full page shown when there's no board to open. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900 dark:bg-black dark:text-stone-100">
      <ProjectSidebar activeId={null} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-stone-600 dark:text-stone-400">{body}</p>
        <div className="max-w-sm">
          <NewProjectButton
            label="New project"
            className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
          />
        </div>
      </main>
    </div>
  );
}
