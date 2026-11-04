# Browser tests

These drive real browsers through the app, including two people on one board. They use your installed Microsoft Edge through `playwright-core`.

CI doesn't run them, because some make real model calls and need keys. Fast logic tests are in `back_end` and run in CI through `npm test`.

## Setup

```bash
cd e2e
npm install
cd ../back_end && npm run build
cd ../front_end && npx vite --host 127.0.0.1 --port 5199 --strictPort
```

Keep Vite running. Run each test from `e2e` in another terminal. Each one starts its own server on port 3000 with a temporary data folder, except `board.mjs`, which needs the backend already running on 3000.

## Tests

The second argument is an optional folder for screenshots.

| Test | Covers | Real model calls |
|---|---|---|
| `board.mjs` | Projects, blocks, frames, connections, surviving a reload | None |
| `multiplayer.mjs` | Two browsers, cursors, undo, offline merge, server restart | None |
| `slate.mjs` | Handwriting, pages, pasting, a real agent run. Add `nomodel` as a third argument to skip the run | One Slate run |
| `chat.mjs` | The AI panel, and answers that use a connected Slate's handwriting | Yes |
| `generate-and-read.mjs` | A real 3D generation, live view, out-of-date badge, Read view, export. Also needs `services/agent-sandbox` on port 8000 | Yes, and Modal |
| `extras.mjs` | Pasting an image, a Slate run on the Meta API, smaller screens | One Slate run |
| `live.mjs` | Sync through the real site. Set `LIVE_URL` to change the target. Creates a project there | None |

```bash
node slate.mjs http://127.0.0.1:5199 ./shots
```
