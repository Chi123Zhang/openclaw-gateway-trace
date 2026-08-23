# OpenClaw Gateway Trace Viewer

A source-grounded, interactive execution viewer for the OpenClaw Gateway `chat.send` path.

This project visualizes how one user request moves through the Gateway before control reaches the deeper Agent Runtime. It combines a fixed source-code model of OpenClaw `v2026.7.1-2` with runtime evidence collected from an instrumented local Gateway.

The main goal is not to replay a hand-written demo. The viewer can accept a new prompt, execute it through OpenClaw, correlate the resulting runtime events, and animate the observed Gateway path in the browser.

## Current status

The Gateway-level trace path is implemented and usable as a live research prototype.

| Area | Status |
| --- | --- |
| Arbitrary prompt execution | Implemented |
| Live G0–G18 Gateway visualization | Implemented |
| Runtime / source evidence separation | Implemented |
| Pause / Resume visualization | Implemented |
| New Session per run | Implemented |
| Reuse current Session | Implemented |
| Source-level stage detail and pseudocode | Implemented |
| G14–G16 standalone runtime events | Not currently instrumented; shown only as verified source path |
| Deeper Agent Runtime provider / model / tool events | Planned next step |

The current viewer therefore stops its numbered Gateway model at **G18**. Provider, model, tool-call, tool-result, memory, and other deeper Agent Runtime details are intentionally not fabricated when they have not been observed.

## What the viewer shows

The fixed Gateway model is organized as:

```text
Connection
G0  Connection Auth State
└─ G1  Shared Credential Authorization
G2  Final Authentication & Handshake

Request path
M1  Request Processing        G3–G5
M2  Session & Agent           G6–G9
M3  Runtime Control           G10–G12
M4  Context Preparation       G13–G15
M5  Reply Dispatch            G16–G18

G18
  ↓
Deeper Reply / Agent Runtime
  ↓
replyResult returns to G16
  ↓
G14 finalization
```

The strict source relationship near the reply boundary is:

```text
G14 dispatchInboundMessage(...)
├─ G15 finalizeInboundContext(...)
└─ G16 dispatchReplyFromConfig(...)
   ├─ G17 downstream Agent re-resolution
   └─ G18 reply resolver invocation
        ↓
        Deeper Reply / Agent Runtime
```

G14, G15, and G16 are not treated as independent runtime observations unless standalone events actually exist. In the current instrumentation, they are displayed as **SOURCE PATH** when the surrounding runtime evidence and source control flow establish that the request passed through them.

## Evidence model

The viewer deliberately distinguishes three types of information:

- **RUNTIME** — directly observed from TraceClaw / Gateway runtime events.
- **SOURCE** — verified from the fixed OpenClaw source snapshot.
- **SOURCE-DERIVED / REQUEST-KNOWN** — values that follow from the request or verified control flow but were not emitted as standalone runtime fields.

Missing observations are left blank or shown as `not observed yet` / `not separately observed`.

This is important for stages such as G14–G16 and for the deeper Agent Runtime. The UI should not make a source-derived fact look like a measured runtime event.

## Live architecture

```text
Browser
http://127.0.0.1:8765/
        │
        │ POST /api/live/start
        │ GET  /api/live/{liveRunId}
        ▼
Local viewer + collector
        │
        ├─ OpenClaw CLI: gateway call chat.send
        ├─ optional history baseline for reused Sessions
        └─ TraceClaw JSONL reader
                 │
                 ▼
Instrumented OpenClaw Gateway
ws://127.0.0.1:18789
                 │
                 ├─ real Gateway execution
                 └─ TraceClaw runtime JSONL
                            │
                            ▼
                  correlated G-stage events
                            │
                            ▼
                    live browser playback
```

The collector runs on the same machine as OpenClaw. Gateway credentials stay local and are not embedded in the browser code.

## Session behavior

By default, every new live run creates a fresh SessionKey:

```text
Run 1 → Session A
Run 2 → Session B
```

For a brand-new Session, the collector does not perform a preflight `chat.history` request. It records the trace cursor and moves directly into `chat.send`.

The webpage also provides **Reuse current session**. When enabled after a completed run:

```text
Run 1 → Session A
Run 2 → Session A
Run 3 → Session A
```

For a reused Session, the collector first checks the existing assistant-message count so it can identify the new reply correctly, then sends the next message through the same Session.

A simple continuity test is:

```text
Run 1: My favorite number is 7391.
Run 2 with Reuse current session: What is my favorite number?
```

## Pause / Resume semantics

Pause affects **only the visualization**.

```text
Gateway execution continues
        ↓
TraceClaw continues collecting
        ↓
new stages remain queued
        ↓
Resume replays them in order
```

The Gateway itself is never paused, so the observer does not alter request timing, timeout behavior, or execution semantics.

## Quick start

### 1. Requirements

You need:

- OpenClaw installed locally;
- a running Gateway;
- the TraceClaw Gateway instrumentation writing JSONL runtime events;
- Python 3;
- this repository.

Confirm OpenClaw first:

```bash
which openclaw
openclaw gateway status
```

### 2. Clone

```bash
git clone https://github.com/Chi123Zhang/openclaw-gateway-trace.git
cd openclaw-gateway-trace
```

### 3. Start the local viewer

If the trace file is already at the path expected by `start_live.sh`:

```bash
zsh start_live.sh
```

For a different TraceClaw JSONL file:

```bash
TRACECLAW_LOG_PATH=/absolute/path/to/gateway-runtime.jsonl zsh start_live.sh
```

The startup script creates the collector virtual environment when needed and serves both the frontend and API from one local origin.

Open:

```text
http://127.0.0.1:8765/
```

Health endpoint:

```text
http://127.0.0.1:8765/health
```

### 4. Run a trace

Enter any prompt, for example:

```text
How to make a cake?
```

Press **Run trace**. The page will advance as correlated runtime evidence is received.

## Manual startup

If you prefer not to use `start_live.sh`:

```bash
cd openclaw-gateway-trace/collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

TRACECLAW_LOG_PATH=/absolute/path/to/gateway-runtime.jsonl \
.venv/bin/python -m uvicorn viewer_server:app \
  --host 127.0.0.1 \
  --port 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

## Live API

The live UI uses a two-phase API.

Start a run:

```http
POST /api/live/start
Content-Type: application/json

{
  "message": "How to make pasta?"
}
```

Reuse a Session:

```http
POST /api/live/start
Content-Type: application/json

{
  "message": "What did I ask before?",
  "sessionKey": "agent:main:dashboard:trace-..."
}
```

Poll the active run:

```http
GET /api/live/{liveRunId}
```

The older blocking `POST /api/run` endpoint remains available for direct testing, but the browser uses the incremental live API.

## Repository layout

```text
openclaw-gateway-trace/
├── index.html
├── config.js
├── start_live.sh
├── assets/
│   ├── app.js
│   ├── styles.css
│   ├── live.js
│   ├── live.css
│   └── session-reuse.js
├── data/
│   ├── modules.js
│   ├── stages/
│   │   ├── part1.js
│   │   ├── part2.js
│   │   └── part3.js
│   └── cases/
│       ├── index.js
│       ├── cake.js
│       └── _template.js
└── collector/
    ├── server.py
    ├── live_runs.py
    ├── viewer_server.py
    ├── openclaw_client.py
    ├── trace_parser.py
    ├── requirements.txt
    └── README.md
```

## Source snapshot

All G0–G18 source mappings are tied to one fixed OpenClaw snapshot:

```text
OpenClaw v2026.7.1-2
commit 0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
```

The stage definitions in `data/stages/` are source-aligned to this snapshot rather than being generic descriptions of an arbitrary OpenClaw release.

## Runtime correlation

Request-specific stages are correlated using `runId` and/or `sessionKey` where available.

Connection-level G0–G3 events occur before request-specific identifiers are consistently available, so the collector uses the nearest preceding connection-authentication sequence as a conservative correlation heuristic. Their raw event order is preserved.

This limitation is explicit because G0–G2 are connection-level stages, not intrinsically one-per-request stages when a WebSocket connection is reused.

## Current limitations

1. **G14–G16** currently do not emit standalone TraceClaw events. They are rendered only as verified source-path stages.
2. **Provider, model, tools, tool calls, and tool results** belong to the deeper Agent Runtime and are not yet captured by the current Gateway instrumentation.
3. Connection-level event correlation is heuristic until an earlier shared connection/request correlation identifier is instrumented.
4. The live viewer depends on a local OpenClaw + TraceClaw environment; the public GitHub Pages site alone cannot reproduce the local runtime.

## Next step

The next instrumentation boundary is after G18, inside the deeper Reply / Agent Runtime. The intended extension is to capture runtime evidence for:

```text
Agent Runtime start
→ provider / model selection
→ history / memory / skill context
→ available tools
→ tool_call / tool_result
→ final model response
→ replyResult back to G16
```

These events will remain outside the G0–G18 Gateway numbering rather than introducing an artificial G19.

## Public repository

```text
https://github.com/Chi123Zhang/openclaw-gateway-trace
```

A static GitHub Pages build may be used for saved traces and interface review, while live execution should be demonstrated from the local viewer at `127.0.0.1:8765`.
