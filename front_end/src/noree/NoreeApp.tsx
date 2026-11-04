type Props = {
  /** The open project, or null on the project list at #/app. */
  projectId: string | null;
};

/** Product shell. M1 replaces this with the sidebar, block menu, board and AI panel. */
export default function NoreeApp({ projectId }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-black dark:bg-black dark:text-white">
      <p className="font-mono text-xs tracking-widest uppercase opacity-60">
        {projectId ? `Project ${projectId}` : "Noree"}
      </p>
    </div>
  );
}
