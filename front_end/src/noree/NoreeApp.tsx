import ProjectBoard from "./ProjectBoard";
import { openNewProject, ProjectSidebar } from "./shell/ProjectSidebar";

type Props = {
  /** The open project, or null on the project list at #/app. */
  projectId: string | null;
};

const PROJECT_ID = /^[a-f0-9]{24,64}$/;

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900 dark:bg-black dark:text-stone-100">
      <ProjectSidebar activeId={null} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-stone-600 dark:text-stone-400">{body}</p>
        <button
          type="button"
          onClick={() => void openNewProject()}
          className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
        >
          New project
        </button>
      </main>
    </div>
  );
}

export default function NoreeApp({ projectId }: Props) {
  if (projectId === null) {
    return (
      <Message
        title="Plan together with AI"
        body="Each project is one shared board. Add blocks, connect them to give the AI context, and share the link to work together."
      />
    );
  }
  if (!PROJECT_ID.test(projectId)) {
    return <Message title="Project not found" body="This link isn't valid. Check it, or start a new project." />;
  }
  // The key gives each project a fresh document and board state.
  return <ProjectBoard key={projectId} projectId={projectId} />;
}
