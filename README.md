# OpenClaw Gateway Trace Viewer

A static source-level trace viewer for the OpenClaw Gateway `chat.send` path.

The current repository contains one trace:

- **How to make a cake?** (`cake`)

The viewer keeps the shared Gateway source mapping and G0–G18 step definitions separate from trace-specific runtime values. That makes it possible to add new questions without duplicating the dashboard code.

## Repository layout

```text
openclaw-gateway-trace/
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── data/
│   ├── stages.js
│   └── cases/
│       ├── index.js
│       ├── cake.js
│       └── _template.js
├── .gitignore
└── .nojekyll
```

### `data/stages.js`

Shared source-level definitions:

- G0–G18 names
- module ownership
- purpose
- generic input/output
- process steps
- source mapping
- source-aligned pseudocode

These should normally remain the same across traces for the same OpenClaw source snapshot.

### `data/cases/cake.js`

Trace-specific runtime data:

- prompt
- SessionKey / sessionId / runId
- Agent
- resolver
- model/provider/tools
- observed result for each G stage
- concrete input/output values
- evidence type
- stage state

### `data/cases/index.js`

List of traces shown in the trace selector.

## Run locally

Because the site is static, you can use any simple HTTP server:

```bash
cd openclaw-gateway-trace
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

The current trace can also be linked directly:

```text
http://localhost:8000/?case=cake
```

## Publish with GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`.
4. Save.

The site will then be available at:

```text
https://chi123zhang.github.io/openclaw-gateway-trace/
```

Current trace:

```text
https://chi123zhang.github.io/openclaw-gateway-trace/?case=cake
```

## Add another question / trace

1. Copy `data/cases/_template.js` to a new file, for example `data/cases/weather.js`.
2. Change the registered case ID from `example` to `weather`.
3. Fill in the trace-specific metadata and G0–G18 runtime fields.
4. Add one entry to `data/cases/index.js`.

The selector in the header will then show both traces.

## Source snapshot

The current source mapping is based on OpenClaw `v2026.7.1-2`, commit:

```text
0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
```

Runtime evidence and source-derived values are intentionally distinguished in the UI. Missing per-stage timing/token values are not estimated.
