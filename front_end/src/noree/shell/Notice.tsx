import heroImage from "../../assets/brand/hero.png";
import { NewProjectButton } from "./NewProjectButton";
import { ProjectSidebar } from "./ProjectSidebar";

/** The full page shown when there's no board to open. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="noree-app flex h-screen w-screen overflow-hidden">
      <ProjectSidebar activeId={null} />
      <main className="relative isolate flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <img src={heroImage} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 dark:opacity-15" />
        <div className="n-panel n-rise max-w-md p-8">
          <h1 className="n-display text-[28px] leading-tight">{title}</h1>
          <p className="mt-3 text-[15px] leading-6 text-n-ink-2">{body}</p>
          <div className="mt-6 flex justify-center">
            <NewProjectButton label="New project" className="n-btn n-btn--primary" />
          </div>
        </div>
      </main>
    </div>
  );
}
