from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from app import registry, runs
from app.agent import generate_code, review_screenshot
from app.modal_tester import ARTIFACTS, test_snippet
from app.schemas import ContextPayload

MAX_ATTEMPTS = 3

app = FastAPI(title="agent-sandbox")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _shot_url(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    return f"/artifacts/{p.parent.name}/{p.name}"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "frontend": "nolan"}


@app.post("/generate")
def generate(context: ContextPayload) -> dict:
    run = runs.create(context.prompt)
    steps = run["steps"]
    steps.append({"key": "prompt", "title": "Prompt + context", "status": "pass",
                  "note": context.prompt})
    feedback = None
    last_error = ""
    last_screenshot = None
    code = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        code = generate_code(context, feedback)
        runs.save_attempt_code(run["id"], attempt, code)
        steps.append({"key": "code", "attempt": attempt, "title": f"Agent writes code (attempt {attempt})",
                      "status": "pass", "note": f"{len(code)} chars of Three.js",
                      "codeUrl": f"/runs/{run['id']}/attempts/{attempt}/code"})
        runs.save(run)

        result = test_snippet(code, context)
        last_screenshot = result.screenshot or last_screenshot
        steps.append({"key": "test", "attempt": attempt, "title": f"Modal Sandbox test (attempt {attempt})",
                      "status": "pass" if result.passed else "fail",
                      "note": result.error or ("Rendered, non-blank, no console errors" if result.passed else "; ".join(result.console[:3])),
                      "screenshot": _shot_url(result.screenshot),
                      "console": result.console[:10]})
        runs.save(run)
        if not result.passed:
            last_error = result.error or "; ".join(result.console[:5])
            feedback = f"Sandbox test failed. Console: {last_error}"
            steps.append({"key": "review", "attempt": attempt, "title": f"Multimodal review (attempt {attempt})",
                          "status": "skipped", "note": "Skipped: sandbox test failed"})
            runs.save(run)
            continue

        ok, notes = review_screenshot(result.screenshot, context.prompt)
        steps.append({"key": "review", "attempt": attempt, "title": f"Multimodal review (attempt {attempt})",
                      "status": "pass" if ok else "fail", "note": notes,
                      "screenshot": _shot_url(result.screenshot)})
        runs.save(run)
        if ok:
            entry = registry.add(code, context, result.screenshot, "approved")
            run["status"] = "approved"
            steps.append({"key": "registry", "title": "Registry", "status": "pass",
                          "note": f"Approved as v{entry.version} ({entry.id})"})
            steps.append({"key": "display", "title": "Final display", "status": "pass",
                          "note": "Rendered live below from the registry code",
                          "entryId": entry.id, "codeUrl": f"/registry/{entry.id}/code"})
            runs.save(run)
            return {"run": run, "entry": _meta(entry), "attempts": attempt, "review": notes}
        feedback = notes
        last_error = notes

    entry = registry.add(code, context, last_screenshot, "draft")
    run["status"] = "draft"
    steps.append({"key": "registry", "title": "Registry", "status": "fail",
                  "note": f"Not approved after {MAX_ATTEMPTS} attempts. Saved as draft v{entry.version} ({entry.id})"})
    steps.append({"key": "display", "title": "Final display (draft)", "status": "fail",
                  "note": "Shown for development only — it failed review",
                  "entryId": entry.id, "codeUrl": f"/registry/{entry.id}/code"})
    runs.save(run)
    return {"run": run, "entry": _meta(entry), "attempts": MAX_ATTEMPTS, "review": last_error}


@app.get("/runs")
def list_runs() -> list[dict]:
    return runs.list_runs()


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    return run


@app.get("/runs/{run_id}/attempts/{attempt}/code", response_class=PlainTextResponse)
def get_attempt_code(run_id: str, attempt: int) -> str:
    if not runs.get(run_id):
        raise HTTPException(404, "run not found")
    path = runs.attempt_code_path(run_id, attempt)
    if not path.exists():
        raise HTTPException(404, "attempt code not found")
    return path.read_text()


@app.get("/artifacts/{folder}/{name}")
def get_artifact(folder: str, name: str) -> FileResponse:
    path = (ARTIFACTS / folder / name).resolve()
    if ARTIFACTS.resolve() not in path.parents or not path.exists():
        raise HTTPException(404, "artifact not found")
    return FileResponse(path, media_type="image/png")


@app.get("/registry")
def list_registry() -> list[dict]:
    return [_meta(e) for e in registry.list_entries()]


@app.get("/registry/{entry_id}")
def get_entry(entry_id: str) -> dict:
    entry = registry.get(entry_id)
    if not entry:
        raise HTTPException(404, "entry not found")
    return {**_meta(entry), "code": entry.code}


@app.get("/registry/{entry_id}/code", response_class=PlainTextResponse)
def get_code(entry_id: str) -> str:
    path = registry.code_path(entry_id)
    if not registry.get(entry_id) or not path.exists():
        raise HTTPException(404, "code not found")
    return path.read_text()


@app.get("/registry/{entry_id}/preview")
def get_preview(entry_id: str) -> FileResponse:
    path = registry.preview_path(entry_id)
    if not registry.get(entry_id) or not path.exists():
        raise HTTPException(404, "preview not found")
    return FileResponse(path, media_type="image/png")


def _meta(entry) -> dict:
    data = entry.model_dump()
    data.pop("code", None)
    data["preview"] = f"/registry/{entry.id}/preview" if entry.preview else None
    data["codeUrl"] = f"/registry/{entry.id}/code"
    return data
