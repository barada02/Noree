# Contract — Agent Three.js + Modal Sandbox

Frontend is the existing React app in `../nolan`. This folder is the backend only.
Full diagram: `../modal-sandbox-architecture.html`.

## 1. Context payload (UI -> backend)

Sent on every generation request. JSON object:

| Field | Type | Meaning |
|---|---|---|
| `prompt` | string | What the user asked for |
| `viewport` | `{width, height}` | Canvas size in the UI |
| `theme` | `{background, accent}` | Page colours to match |
| `params` | object | Slider/control values from the UI |
| `scene` | array | Names of objects already in the scene |
| `perfTier` | `high \| low` | Device capability hint |

## 2. Snippet contract (agent -> sandbox -> registry)

The coding agent returns ONE JavaScript module. Rules:

- Only `three` imports allowed. No other packages, no network calls, no DOM access outside its canvas.
- Default-exports a function `create(container, context)` that builds the scene inside `container` and returns `{ dispose() }`.
- Must start rendering immediately and honour `prefers-reduced-motion` (no auto-motion when set).
- Console errors or a blank canvas in the sandbox test = automatic fail.

## 3. Modal tester (sandbox -> result)

Input: snippet code + context payload.
Runs in a Modal Sandbox with a headless browser. Output:

| Field | Meaning |
|---|---|
| `screenshot` | PNG of the rendered canvas |
| `console` | All console messages incl. warnings |
| `passed` | True only if no errors and canvas is non-blank |

Sandbox is always terminated after the run, pass or fail. Max 3 generate-test-review rounds, then fall back to the last approved registry version.

## 4. Registry entry

| Field | Meaning |
|---|---|
| `id`, `version`, `hash` | Immutable identity of the code |
| `code` | The approved snippet (never edited in place) |
| `preview` | Screenshot that passed review |
| `context` | Payload that produced it |
| `status` | `draft \| approved` |

The UI fetches an approved version by id and executes it in a sandboxed iframe.

## Status

Implemented and verified end to end: `POST /generate` ran the agent, tested the snippet in a Modal Sandbox, passed multimodal review on attempt 1, and stored registry v1 as approved. Nolan fetches `codeUrl` and renders it in a sandboxed iframe, falling back to the built-in hero object when nothing has been generated.
