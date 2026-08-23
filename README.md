# OpenClaw Gateway Trace Viewer

A source-level viewer for the OpenClaw Gateway `chat.send` path.

The project now has two modes:

1. **Saved traces** — open an existing trace such as **How to make a cake?**
2. **Live trace input** — type a new question in the page and send it to a collector service that will run OpenClaw and return the G0–G18 trace

The live input UI is already included. The next backend step is connecting the collector to the real OpenClaw Gateway and TraceClaw runtime events.

## Live site

```text
https://chi123zhang.github.io/openclaw-gateway-trace/
```

Current saved trace:

```text
https://chi123zhang.github.io/openclaw-gateway-trace/?case=cake
```

GitHub Pages is static. It can display saved traces directly, but arbitrary new questions need the separate collector service described below.

## Current architecture

```text
Browser
  │
  ├─ Saved trace
  │    └─ data/cases/cake.js
  │
  └─ New question
       │
       └─ POST /api/run
             │
             ▼
       Trace Collector
             │
             ├─ OpenClaw chat.send
             ├─ TraceClaw / Gateway events
             └─ final reply
             │
             ▼
       normalized G0–G18 trace
             │
             ▼
       existing dashboard
```

## Repository layout

```text
openclaw-gateway-trace/
├── index.html
├── config.js
├── assets/
│   ├── app.js
│   ├── live.js
│   ├── styles.css
│   └── live.css
├── data/
│   ├── modules.js
│   ├── stages/
│   │   ├── part1.js      # G0–G6
│   │   ├── part2.js      # G7–G12
│   │   └── part3.js      # G13–G18
│   └── cases/
│       ├── index.js
│       ├── cake.js
│       └── _template.js
├── collector/
│   ├── server.py
│   ├── requirements.txt
│   └── README.md
├── .gitignore
└── .nojekyll
```

## Frontend

`index.html` now contains an **Ask OpenClaw** input at the top.

When `config.js` has no collector URL, the page still works as a saved-trace viewer and clearly reports that the collector is not connected.

When a collector URL is configured, the frontend sends:

```http
POST /api/run
Content-Type: application/json
```

```json
{
  "message": "How to make a cake?"
}
```

The returned trace is loaded into the same G0–G18 dashboard without rebuilding the page.

## Collector

The collector API shell lives in `collector/`.

Current routes:

```text
GET  /health
POST /api/run
```

`/api/run` intentionally returns `503` for now instead of fabricating runtime data. The next implementation step is to connect it to:

- OpenClaw Gateway `chat.send`
- the run ID / SessionKey produced by that request
- TraceClaw / Gateway runtime events for the same run
- the final reply

The collector should return the same trace shape used by `data/cases/cake.js`.

## Configure the collector

`config.js`:

```js
window.GATEWAY_CONFIG = {
  collectorUrl: "",
  requestTimeoutMs: 120000
};
```

For a deployed HTTPS collector:

```js
window.GATEWAY_CONFIG = {
  collectorUrl: "https://your-collector.example.com",
  requestTimeoutMs: 120000
};
```

For local development, serve the frontend locally and use:

```js
collectorUrl: "http://127.0.0.1:8787"
```

## Run locally

Frontend:

```bash
python3 -m http.server 8000
```

Collector shell:

```bash
cd collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8787 --reload
```

Then open:

```text
http://localhost:8000/
```

## Shared Gateway definitions

`data/modules.js` contains the M1–M5 high-level grouping.

`data/stages/part1.js`, `part2.js`, and `part3.js` contain the shared G0–G18 definitions:

- stage names and module ownership
- purpose
- generic input / output
- process steps
- source mapping
- source-aligned pseudocode

These should remain shared across traces produced from the same OpenClaw source snapshot.

## Saved trace data

`data/cases/cake.js` contains the current saved runtime trace:

- prompt
- SessionKey / sessionId / runId
- Agent
- resolver
- model / provider / tools
- observed stage results
- concrete runtime input / output
- evidence type
- state by stage

Saved traces remain useful as reproducible examples even after live collection is connected.

## Source snapshot

The current source mapping is based on OpenClaw `v2026.7.1-2`, commit:

```text
0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
```

Runtime-observed, native, source, and source-derived evidence are kept distinct. Missing runtime fields are not invented.
