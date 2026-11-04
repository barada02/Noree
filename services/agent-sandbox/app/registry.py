"""File-backed registry: immutable code versions with preview + context."""

import hashlib
import json
import shutil
import uuid
from pathlib import Path

from app.schemas import ContextPayload, RegistryEntry

BASE = Path(__file__).resolve().parents[1] / "registry"
CODE_DIR = BASE / "code"
PREVIEW_DIR = BASE / "previews"
STORE = BASE / "entries.json"


def _ensure() -> None:
    CODE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE.exists():
        STORE.write_text("[]")


def _load() -> list[dict]:
    _ensure()
    return json.loads(STORE.read_text())


def _save(entries: list[dict]) -> None:
    STORE.write_text(json.dumps(entries, indent=2))


def add(code: str, context: ContextPayload, screenshot: str | None, status: str) -> RegistryEntry:
    entries = _load()
    entry_id = uuid.uuid4().hex[:10]
    version = len(entries) + 1
    (CODE_DIR / f"{entry_id}.js").write_text(code)
    preview = None
    if screenshot and Path(screenshot).exists():
        dest = PREVIEW_DIR / f"{entry_id}.png"
        shutil.copyfile(screenshot, dest)
        preview = str(dest)
    entry = RegistryEntry(
        id=entry_id,
        version=version,
        hash=hashlib.sha256(code.encode()).hexdigest()[:16],
        code=code,
        preview=preview,
        context=context,
        status=status,  # type: ignore[arg-type]
    )
    entries.append(entry.model_dump())
    _save(entries)
    return entry


def list_entries() -> list[RegistryEntry]:
    return [RegistryEntry(**e) for e in _load()]


def get(entry_id: str) -> RegistryEntry | None:
    for e in _load():
        if e["id"] == entry_id:
            return RegistryEntry(**e)
    return None


def code_path(entry_id: str) -> Path:
    return CODE_DIR / f"{entry_id}.js"


def preview_path(entry_id: str) -> Path:
    return PREVIEW_DIR / f"{entry_id}.png"
