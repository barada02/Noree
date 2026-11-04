/** Reads the server's message, so people see why something failed. */
async function failure(res: Response, fallback: string): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") return new Error(body.message);
  } catch {
    // Not JSON, such as a proxy error page.
  }
  return new Error(res.status === 413 ? "That file is too large. The limit is 10 MB." : fallback);
}

export async function uploadAsset(projectId: string, file: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", file, "upload");
  const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
  if (!res.ok) throw await failure(res, "The upload failed. Check your connection and try again.");
  return ((await res.json()) as { url: string }).url;
}

export type SlateRunRequest = {
  pageId: string;
  snapshotUrl: string;
  instruction?: string;
  provider: "baseten" | "meta";
  person: { id: string; name: string };
};

export async function startSlateRun(projectId: string, blockId: string, body: SlateRunRequest): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/blocks/${blockId}/slate-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res, "The run couldn't start. Try again.");
  return ((await res.json()) as { jobId: string }).jobId;
}

export async function cancelJob(projectId: string, jobId: string): Promise<void> {
  await fetch(`/api/projects/${projectId}/jobs/${jobId}/cancel`, { method: "POST" });
}
