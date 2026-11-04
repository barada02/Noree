import { useState } from "react";
import { createProject, projectHref } from "../lib/projects";
import { PlusIcon } from "../ui/icons";

export function NewProjectButton({ label, className = "n-btn n-btn--primary", showPlus = true }: { label: string; className?: string; showPlus?: boolean }) {
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
      <button type="button" disabled={busy} onClick={() => void create()} className={className}>
        {showPlus && <PlusIcon />}
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-n-danger">
          {error} Check your connection and try again.
        </p>
      )}
    </>
  );
}
