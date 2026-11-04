# Next plan: accounts, meeting room, and more blocks

Status: discussion only, nothing built yet. Written after the redesign (branch `redesign`).

## Decisions so far

- **Name:** Noree. It is set in one place, `front_end/src/brand.ts`. No trademark check has been done. A pending beverage trademark, "NORÏE", is the closest match found.
- **Meeting feature:** a call mode of the board itself, like Google Meet with the board as the shared screen. It is not a block on the board.
- **Database:** there is none today. Boards are Yjs files on one server's disk, with no backup. The project list lives in the browser. There are no users.

## Order of work

1. **Accounts and a database.** Needed first, because a meeting has to know who is in the room and who pays for voice minutes. SQLite on the same server is the lightest start. Postgres once there is more than one server. Also decide sign-in method and board ownership. This also gives the real Home dashboard and profile that are only stand-ins today.
2. **Table and chart blocks.** `add_table` and `add_chart` Slate widgets, so the main agent can build them. Slate already has function graph, complex number, steps and flashcard widgets.
3. **Voice module.** Mic capture, transcribe, TTS. Built once and shared by two features: the existing `live-agent` idea (talk to the app) and the meeting room (people talking to each other).
4. **Meeting room, voice only.** Then camera video.

## Meeting room design

**How it's used**
- A **Join call** button in the top bar opens a call strip beside the board: one tile per person, mute, leave.
- Live captions in a bar at the bottom of the board, in each viewer's language. Translated speech is optional per person.
- Each person picks the language they speak and the language they want to read or hear. This is stored with presence, not in the shared document.
- The transcript is saved with the board. The main agent can summarise it and put action items on the board.

**Pipeline**
1. The browser sends mic audio over a WebSocket. Voice activity detection finds pauses.
2. The transcribe model turns speech into text. Verify its streaming support and language coverage first.
3. Split into sentences or clauses before translating, and give the model the previous sentence as context. Translate once per target language, not per listener.
4. A Modal function does TTS. Cache the audio per language and sentence.

**Where it lives**
- Frontend: call strip, caption bar, audio capture hook.
- Document: transcript entries with speaker, language, original text and time. Store the original only. Make translations on demand.
- `shared/`: schema, actions and outline entries so the agent can read the transcript.
- Backend: a voice module with its own WebSocket, separate from the sync server. Not the jobs service, because a meeting is a stream and needs its own limits.
- Modal: the TTS function, next to the 3D service.

**Media transport (WebRTC)**
- Direct browser to browser: fine for about 4 people, cheap, the server only does signalling and relay.
- A media server such as LiveKit: scales further and gives clean per-speaker audio for transcription. More to run, so check the server load first.
- Start voice only.

## Open decisions

- Sign-in method for accounts, and who owns a board.
- Captions only, or real voice through the app, for the first meeting version. The call-mode design above assumes real voice.
- Direct browser connections or a media server.
- Consent: everyone sees who is transcribing, with a clear recording indicator. Keep transcript text, not audio, by default.
- Cost control: a cap on meeting length, per-board limits, and translating only the languages someone is listening in.
- TTS model choice and its language coverage.
- Small bug to fix on the way: blocks added from the dock all land in the same spot and overlap.
