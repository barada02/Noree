import { useState } from "react";
import { createProject, projectHref } from "../lib/projects";

export function NewProjectButton({ label, className }: { label: string; className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      window.location.hash = projectHref(await createProject());
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void create()} className={`disabled:opacity-60 ${className}`}>
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
          {error} Check your connection and try again.
        </p>
      )}
    </>
  );
}
