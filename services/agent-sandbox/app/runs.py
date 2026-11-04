"""Run history: one record per /generate call, with per-attempt steps."""

import json
import uuid
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "registry"
STORE = BASE / "runs.json"
ATTEMPTS = BASE / "attempts"


def _load() -> list[dict]:
    BASE.mkdir(parents=True, exist_ok=True)
    if not STORE.exists():
        STORE.write_text("[]")
    return json.loads(STORE.read_text())


def create(prompt: str) -> dict:
    run = {"id": uuid.uuid4().hex[:10], "prompt": prompt, "status": "running", "steps": []}
    runs = _load()
    runs.append(run)
    STORE.write_text(json.dumps(runs, indent=2))
    return run


def save(run: dict) -> None:
    runs = _load()
    for i, r in enumerate(runs):
        if r["id"] == run["id"]:
            runs[i] = run
            break
    STORE.write_text(json.dumps(runs, indent=2))


def list_runs() -> list[dict]:
    return list(reversed(_load()))


def get(run_id: str) -> dict | None:
    for r in _load():
        if r["id"] == run_id:
            return r
    return None


def attempt_code_path(run_id: str, attempt: int) -> Path:
    return ATTEMPTS / f"{run_id}_{attempt}.js"


def save_attempt_code(run_id: str, attempt: int, code: str) -> None:
    ATTEMPTS.mkdir(parents=True, exist_ok=True)
    attempt_code_path(run_id, attempt).write_text(code)
