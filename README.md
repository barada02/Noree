# Noree

A shared board where people and AI agents plan together. Each project is one board, and a board is made of blocks. Write by hand on a Slate and the AI annotates it. Draw a line from one block to another to give the AI context. Press Generate to turn that context into a working 3D model. Everyone on the link sees all of it live, including the AI's work.

**Live:** https://kanya.alito.tech (choose **Open app**)

## What it does

| Block | What you do | What the AI does |
|---|---|---|
| **Slate** | Write by hand, paste text or images, across pages | Reads the page, then annotates it with outlines, arrows, explanations and interactive widgets |
| **3D model** | Write a prompt, or connect other blocks, and press Generate | Writes Three.js, tests it in a Modal sandbox, reviews a screenshot with a vision model, and retries if needed |
| **Text, Sticky** | Write notes | Reads them as context when you ask, or when something is connected to them |
| **Frame** | Group blocks | Sets the reading order for the Read view and export |

- **Connections carry context.** A line from A to B means B reads from A. A question or a generation on B uses A's content, including handwriting.
- **One AI to talk to.** The AI panel is a main agent. It answers questions, builds and connects blocks on the board, and delegates to specialists: the Slate agent and the 3D agent. One Undo reverses a whole run. See [docs/agent-architecture.html](docs/agent-architecture.html).
- **Multiplayer with no sign-up.** Share the link. You get live cursors, shared edits and per-person undo, built on Yjs.
- **Agents are participants.** They write into the same shared document as people, so nobody has to refresh to see their work, and closing a tab doesn't stop it.
- **Read view and Markdown export.** The canvas gives freedom, and frames give order.

## Meta models

| Use | Default | Fallback |
|---|---|---|
| Slate agent (vision and tool calling) | Muse Spark Open, on Baseten | Muse Spark, Meta Model API |
| Main agent and page transcription | Muse Spark, Meta Model API | Muse Spark Open, on Baseten |
| 3D brief | Muse Spark, Meta Model API | Muse Spark Open, on Baseten |
| 3D code and visual review | Muse Spark Open, on Baseten | None |

## How it works

```
Browser                     Server (one EC2 instance)                  External
┌─────────────────┐  wss    ┌───────────────────────────────┐
│ Board UI        │◄───────►│ nginx → Nest                  │
│ Y.Doc (all data)│         │   Hocuspocus sync on /collab  │
│ IndexedDB cache │  https  │   Jobs and agent runtime ─────┼──► Baseten, Meta API
└─────────────────┘────────►│   Disk: documents and assets  │
                            │ agent-sandbox (localhost) ────┼──► Modal
                            └───────────────────────────────┘
```

Three rules keep it simple:

1. **The Y.Doc is the source of truth.** The UI draws what's in the document.
2. **Agents write to the document.** An agent never talks to one browser, so everyone sees the same thing.
3. **HTTP only starts work.** A request returns a job id at once. Progress and results arrive through the document.

The model never outputs coordinates. It refers to ink and objects by id, and the server computes the geometry, returning errors the model can correct itself from.

Generated 3D code runs only inside a sandboxed iframe with no same-origin access, and is served as plain text so it can't run from this site directly.

The full design and build plan is in [docs/noree-v1-plan.html](docs/noree-v1-plan.html).

## Run it locally

You need Node 22 or newer, Python 3.12 or newer for the 3D service, and at least one model key.

```bash
# Backend, on :3000
cd back_end
cp .env.example .env      # add BASETEN_API_KEY and/or META_API
npm install
npm run start:dev

# Frontend, in a second terminal. It proxies /api to the backend.
cd front_end
npm install
npm run dev               # then open the printed URL and go to /#/app
```

For 3D generation, run the service in a third terminal. It also needs `BASETEN_API_KEY` and a Modal account (`modal setup`, or `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`).

```bash
cd services/agent-sandbox
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # .venv/bin/pip on Linux and macOS
.venv/Scripts/python main.py                      # listens on 127.0.0.1:8000
```

## Tests

```bash
cd back_end
npm test              # server and shared logic, no credits used: AI tests use scripted fake providers
npm run test:e2e      # existing camera and app end-to-end tests
```

Browser tests are in [e2e/](e2e/). They drive two real browsers, and some make real model calls.

## Repo layout

| Path | What's there |
|---|---|
| `front_end/src/noree/` | The product: board, blocks, shared-document bindings, AI panel, Read view |
| `back_end/src/collab/` | Sync server, project storage |
| `back_end/src/agents/` | The shared agent engine, main agent, Slate and 3D specialists, context collection |
| `back_end/src/jobs/` | Job lifecycle, cancellation and limits |
| `shared/` | Document schema, action layer, reading order. Copied into both apps by `scripts/sync-shared.mjs` |
| `services/agent-sandbox/` | The 3D pipeline (Python, FastAPI, Modal) |
| `deploy/` | CI/CD scripts. See [deploy/README.md](deploy/README.md) |
| `front_end/src/experiments/`, `pages/` | Earlier experiments, kept as they were |

## Built during the hackathon

All of this was built during the event, which ran from Oct 26 to Nov 4, 2026. The first commit in this repo is from Nov 2.

Two parts started a few days earlier in the author's separate hackathon repo, also during the event, and were copied in:

- The Slate agent, drawing canvas and widgets, from `ink-agent` (first committed Nov 4).
- The 3D pipeline in `services/agent-sandbox`, from `agent-sandbox` (first committed Nov 3), unchanged. See [services/README.md](services/README.md).

## Known limits

This is a first version, and these are deliberate:

- Anyone with a link can edit that board. There are no accounts yet.
- Documents and assets are stored as files on one server, with no backup.
- A Slate's AI run looks at its own page. Connections feed block chat and 3D generation.
- Handwriting quality depends on the model, so very messy writing can be misread.
