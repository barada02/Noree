import { isStale, type JobView } from "./useSlate";

const STATUS_COLOR: Record<string, string> = {
  pass: "text-emerald-700 dark:text-emerald-400",
  fail: "text-red-700 dark:text-red-400",
  warn: "text-amber-700 dark:text-amber-400",
};

/** What the agent is doing, live and the same for everyone. M4 moves this into the AI panel. */
export function JobTrace({ job, running, now }: { job: JobView | undefined; running: boolean; now: number }) {
  const stale = job ? isStale(job, now) : false;
  return (
    <aside aria-label="AI activity" className="hidden w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-stone-300 bg-white md:flex dark:border-stone-700 dark:bg-stone-900">
      <h2 className="border-b border-stone-200 px-3 py-2 font-mono text-[11px] tracking-widest text-stone-500 uppercase dark:border-stone-800">AI activity</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[13px]">
        {!job && <p className="text-stone-500">Each step the agent takes shows up here, for everyone on the board.</p>}
        {job && (
          <>
            {job.startedBy?.name && <p className="mb-2 text-xs text-stone-500">Started by {job.startedBy.name}</p>}
            <ol className="space-y-2" data-job-status={stale ? "failed" : job.status}>
              {job.steps.map((step, i) => (
                <li key={i} className="break-words">
                  <span className={`font-medium ${STATUS_COLOR[step.status] ?? ""}`}>{step.title}</span>
                  {step.note && <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">{step.note}</p>}
                </li>
              ))}
            </ol>
            {running && <p className="mt-3 animate-pulse text-xs text-stone-500">Working…</p>}
            {job.status === "cancelled" && <p className="mt-3 text-xs text-stone-500">Stopped.</p>}
            {job.status === "failed" && job.error && (
              <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">
                {job.error}
              </p>
            )}
            {stale && (
              <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-400">
                This run stopped responding. Try again.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
