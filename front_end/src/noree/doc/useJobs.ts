import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { docParts, type JobStep } from "../../shared/schema.js";

export type JobView = {
  id: string;
  kind: "slate-run" | "generate-3d" | "chat";
  status: "running" | "done" | "failed" | "cancelled";
  steps: JobStep[];
  error?: string;
  pageId?: string;
  startedAt: number;
  heartbeatAt: number;
  startedBy?: { name: string };
};

const STALE_AFTER_MS = 60_000;

/** A run with no heartbeat for a minute has died, so nobody waits on it forever. */
export function isStale(job: JobView, now: number) {
  return job.status === "running" && now - job.heartbeatAt > STALE_AFTER_MS;
}

/** This block's runs, newest first. */
export function useBlockJobs(doc: Y.Doc, blockId: string): JobView[] {
  const { jobs } = useMemo(() => docParts(doc), [doc]);
  const [list, setList] = useState<JobView[]>([]);

  useEffect(() => {
    const update = () => {
      const next: JobView[] = [];
      jobs.forEach((job) => {
        if (job.get("blockId") === blockId) next.push(job.toJSON() as JobView);
      });
      next.sort((a, b) => b.startedAt - a.startedAt);
      setList(next);
    };
    update();
    jobs.observeDeep(update);
    return () => jobs.unobserveDeep(update);
  }, [jobs, blockId]);

  return list;
}

/** The newest run and whether it's still going, re-checked while it runs. */
export function useLatestJob(doc: Y.Doc, blockId: string) {
  const jobs = useBlockJobs(doc, blockId);
  const [now, setNow] = useState(() => Date.now());
  const latest = jobs[0];
  const active = latest?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [active]);

  const stale = !!latest && isStale(latest, now);
  return { jobs, latest, running: active && !stale, stale, now };
}
