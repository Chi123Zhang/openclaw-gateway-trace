# OpenClaw Gateway Trace Viewer

A static source-level trace viewer for the OpenClaw Gateway `chat.send` path.

The current repository contains one trace:

- **How to make a cake?** (`cake`)

Shared Gateway source structure is kept separate from trace-specific runtime data, so new questions can be added without duplicating the dashboard.

## Repository layout

```text
openclaw-gateway-trace/
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
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
├── .gitignore
└── .nojekyll
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

These files should normally remain unchanged across traces produced from the same OpenClaw source snapshot.

## Trace-specific data

`data/cases/cake.js` contains the runtime data for the current trace, including:

- prompt
- SessionKey / sessionId / runId
- Agent
- resolver
- model / provider / available tools
- observed result for each G stage
- concrete runtime input / output
- evidence type
- state by stage

`data/cases/index.js` controls the trace selector shown in the page header.

## Run locally

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Direct link to the current trace:

```text
http://localhost:8000/?case=cake
```

## Publish with GitHub Pages

Open the repository and go to:

**Settings → Pages → Build and deployment → Deploy from a branch**

Select:

- Branch: `main`
- Folder: `/ (root)`

After deployment, the site should be available at:

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
4. Add the new trace to `data/cases/index.js`.

Example index entry:

```js
{
  id: "weather",
  title: "What's the weather in New York?",
  file: "data/cases/weather.js",
  description: "Gateway trace for the weather query."
}
```

The page header will then allow switching between the traces, and a trace can be opened directly with:

```text
?case=weather
```

## Source snapshot

The current source mapping is based on OpenClaw `v2026.7.1-2`, commit:

```text
0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
```

Runtime-observed, native, source, and source-derived evidence are kept distinct. Missing per-stage timing or token values are not estimated.
