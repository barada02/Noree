import "../brand-fonts";
import "./noree.css";
import Home from "./home/Home";
import ProjectBoard from "./ProjectBoard";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { Notice } from "./shell/Notice";

type Props = {
  /** The open project, or null on the home screen at #/app. */
  projectId: string | null;
};

const PROJECT_ID = /^[a-f0-9]{48}$/;

export default function NoreeApp({ projectId }: Props) {
  if (projectId === null) return <Home />;
  if (!PROJECT_ID.test(projectId)) {
    return <Notice title="Project not found" body="This link isn't valid. Check it, or start a new project." />;
  }
  // The key gives each project a fresh document and board state.
  return (
    <ErrorBoundary
      key={projectId}
      fallback={() => (
        <div role="alert" className="noree-app flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="n-display text-2xl">Something went wrong showing this board.</p>
          <p className="max-w-md text-[15px] text-n-ink-2">Your work is saved. Reloading usually fixes this.</p>
          <button type="button" onClick={() => window.location.reload()} className="n-btn n-btn--primary mt-2">
            Reload
          </button>
        </div>
      )}
    >
      <ProjectBoard projectId={projectId} />
    </ErrorBoundary>
  );
}
