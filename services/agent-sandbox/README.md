# agent-sandbox

Backend for the agent Three.js system. Frontend is the existing React app in `../nolan` — nothing to build here for the UI.

Architecture: `../modal-sandbox-architecture.html`. Contracts: `CONTRACT.md`.

## Run (once implemented)

```powershell
.\.venv\Scripts\python.exe main.py
```

Health check: `GET http://127.0.0.1:8000/health`

## Setup already done

- Modal: `modal 1.6.3` installed in this folder's `.venv`; account auth via `python -m modal setup` (token in `~/.modal.toml`, never commit it).
- Deps in `requirements.txt`. Keys stay in the workspace root `.env` (`META_API`, `BASETEN_API_KEY`).

## Built

Modal tester (`app/modal_tester.py`), agent loop with 3-attempt multimodal review (`app/agent.py`, `POST /generate`), file registry (`app/registry.py`, `registry/`), and the Nolan-side fetch/render with built-in fallback. Verified end to end: registry v1 approved on attempt 1 for "a copper torus knot sculpture".

Re-run the tester alone: `.\.venv\Scripts\python.exe probes\probe_tester.py` (needs `PYTHONPATH=.`).
