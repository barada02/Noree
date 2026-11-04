import ProjectBoard from "./ProjectBoard";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { Notice } from "./shell/Notice";

type Props = {
  /** The open project, or null on the project list at #/app. */
  projectId: string | null;
};

const PROJECT_ID = /^[a-f0-9]{48}$/;

export default function NoreeApp({ projectId }: Props) {
  if (projectId === null) {
    return (
      <Notice
        title="Plan together with AI"
        body="Each project is one shared board. Add blocks, connect them to give the AI context, and share the link to work together."
      />
    );
  }
  if (!PROJECT_ID.test(projectId)) {
    return <Notice title="Project not found" body="This link isn't valid. Check it, or start a new project." />;
  }
  // The key gives each project a fresh document and board state.
  return (
    <ErrorBoundary
      key={projectId}
      fallback={() => (
        <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-medium">Something went wrong showing this board.</p>
          <p className="max-w-md text-sm text-stone-600 dark:text-stone-400">Your work is saved. Reloading usually fixes this.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">
            Reload
          </button>
        </div>
      )}
    >
      <ProjectBoard projectId={projectId} />
    </ErrorBoundary>
  );
}
