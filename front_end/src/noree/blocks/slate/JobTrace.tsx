import { isStale, type JobView } from "../../doc/useJobs";

const STATUS_COLOR: Record<string, string> = {
  pass: "text-n-leaf",
  fail: "text-n-danger",
  warn: "text-n-butter-ink",
};

/** What the agent is doing, live and the same for everyone. M4 moves this into the AI panel. */
export function JobTrace({ job, running, now }: { job: JobView | undefined; running: boolean; now: number }) {
  const stale = job ? isStale(job, now) : false;
  return (
    <aside aria-label="AI activity" className="flex max-h-44 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-n-line bg-n-surface md:max-h-none md:w-80">
      <h2 className="border-b border-n-line-soft px-3 py-2 font-mono text-[11px] tracking-widest text-n-ink-3 uppercase">AI activity</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[13px]">
        {!job && <p className="text-n-ink-3">Each step the agent takes shows up here, for everyone on the board.</p>}
        {job && (
          <>
            {job.startedBy?.name && <p className="mb-2 text-xs text-n-ink-3">Started by {job.startedBy.name}</p>}
            <ol className="space-y-2" data-job-status={stale ? "failed" : job.status}>
              {job.steps.map((step, i) => (
                <li key={i} className="break-words">
                  <span className={`font-medium ${STATUS_COLOR[step.status] ?? ""}`}>{step.title}</span>
                  {step.note && <p className="mt-0.5 text-xs text-n-ink-2">{step.note}</p>}
                </li>
              ))}
            </ol>
            {running && <p className="mt-3 animate-pulse text-xs text-n-ink-3">Working…</p>}
            {job.status === "cancelled" && <p className="mt-3 text-xs text-n-ink-3">Stopped.</p>}
            {job.status === "failed" && job.error && (
              <p role="alert" className="mt-3 text-xs text-n-danger">
                {job.error}
              </p>
            )}
            {stale && (
              <p role="alert" className="mt-3 text-xs text-n-danger">
                This run stopped responding. Try again.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
