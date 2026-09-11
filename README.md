# TraceClaw — Source-Grounded Observability for Agent Runtimes

**TraceClaw reconstructs an agent system from source code, instruments the real runtime, and shows which semantic execution boundaries were actually observed.**

This repository currently targets the OpenClaw Gateway `chat.send` path on **OpenClaw `v2026.7.1-2`**. It combines a fixed source model of Gateway execution (**G0–G18**) with runtime instrumentation for the deeper post-G18 Agent Runtime, including Agent selection, provider/model execution, tool lifecycle, final reply capture, and the return to Gateway control flow.

> Source defines what **can** happen. Runtime evidence determines what **was observed** to happen.

---

## Why this project exists

Agent systems are difficult to debug because message-level events, logs, and user-visible outputs do not always line up with the system's actual semantic execution boundaries.

A concrete example is the **final assistant reply**. A message-end hook can fire before later tool execution, retry/fallback logic, or winner selection finishes. TraceClaw therefore captures the final reply at the winning run-result boundary instead of treating an earlier message event as authoritative.

TraceClaw is built around three goals:

1. **Reconstruct the execution model from implementation source** instead of inventing a generic pipeline.
2. **Overlay real runtime evidence** without turning source-derived facts into fake measurements.
3. **Expose cross-layer boundaries** from Gateway request handling into Agent Runtime and back.

---

## What I built

- **Source-grounded G0–G18 execution model** for the OpenClaw Gateway `chat.send` path, pinned to a specific upstream release and commit.
- **Runtime instrumentation** for Gateway stages plus post-G18 Agent Runtime events.
- **Cross-layer trace correlation** across Session, Agent, resolver, provider/model, tools, final reply, and resolver return.
- **Evidence-aware UI** that separates source structure from direct observations and source-derived facts.
- **Live playback** with Pause/Resume that freezes only visualization while the Gateway continues running.
- **Semantic final-reply capture** at the winning run-result boundary after fallback/winner selection.
- **Automated completed-run publishing** to `data/cases/latest-live.js` while keeping raw local archives out of Git.
- **Runtime doctor / verification scripts** to detect a stale or uninstrumented local OpenClaw build before a trace is trusted.

---

## System at a glance

```text
User prompt
   │
   ▼
OpenClaw Gateway
   │
   ├─ G0–G2   Connection authentication
   ├─ G3–G5   Request validation / normalization
   ├─ G6–G9   Session + Agent resolution
   ├─ G10–G12 Policy / dedupe / work admission
   ├─ G13–G15 Runtime context preparation
   └─ G16–G18 Reply dispatch + resolver boundary
                    │
                    ▼
             Deeper Agent Runtime
                    │
                    ├─ agent_runtime_selected
                    ├─ agent_run_started
                    ├─ tool_started / tool_result
                    ├─ agent_reply_finalized
                    ├─ agent_run_ended
                    └─ reply_resolver_returned
                    │
                    ▼
             G16 resumes processing
                    │
                    ▼
             G14 returns final result
```

The numbered Gateway model intentionally stops at **G18**. Post-G18 evidence is stored separately under `agentRuntime`; it is not renamed into an artificial G19.

---

## Evidence semantics

The viewer keeps source structure and runtime evidence separate.

| Label | Meaning |
| --- | --- |
| **SOURCE MODEL** | Fixed control-flow / data-flow structure reconstructed from OpenClaw `v2026.7.1-2`. |
| **OBSERVED** | Direct runtime or native evidence from the current run. |
| **SOURCE-DERIVED** | Supported by the current run plus verified source control flow, but not emitted as a standalone runtime event. |
| **NOT OBSERVED** | No direct current-run evidence for that stage, branch, or value. |

Before a new live run starts, the page shows only the **SOURCE MODEL**. It does not reuse runtime values from a previously published trace.

This distinction matters especially for **G14–G16**: the current instrumentation does not emit standalone events for every internal step there, so those stages may be source-confirmed by surrounding runtime evidence rather than falsely labeled as directly observed.

---

## The final-reply boundary

One of the most important bugs uncovered while building TraceClaw was that an early message-level hook was not a reliable semantic final-reply boundary.

```text
message end
   │
   ├─ tool execution may still happen
   ├─ retry / fallback may still happen
   └─ winning run may not be selected yet

winning run result selected
   │
   ▼
finalAssistantVisibleText / finalAssistantRawText
   │
   ▼
agent_reply_finalized
```

The instrumentation now captures the reply from the **winning run result** after fallback selection. This makes the displayed final reply correspond to the runtime result that actually won, rather than to an earlier intermediate message event.

---

## Current capabilities

| Capability | Status |
| --- | --- |
| Arbitrary live prompt execution | ✅ |
| G0–G18 Gateway visualization | ✅ |
| Source model vs current-run evidence separation | ✅ |
| Post-G18 Agent Runtime tracing | ✅ |
| Provider / model capture | ✅ |
| Tool start / result capture | ✅ |
| Final Agent reply capture | ✅ |
| Return-to-G16 resolver boundary | ✅ |
| Pause / Resume visualization | ✅ |
| Fresh Session per run | ✅ |
| Session reuse | ✅ |
| Saved / published trace view | ✅ |
| Auto-publish latest successful run | ✅ |
| Source-level pseudocode + verified source ranges | ✅ |
| Runtime alignment / instrumentation doctor | ✅ |

---

## Source model

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
```

The reply-side source relationship is:

```text
G14 dispatchInboundMessage(...)
├─ G15 finalizeInboundContext(...)
└─ G16 dispatchReplyFromConfig(...)
   ├─ G17 downstream Agent re-resolution
   └─ G18 reply resolver invocation
        ↓
        Deeper Agent Runtime
        ↓
        replyResult returns to G16
```

All source mappings are tied to:

```text
OpenClaw v2026.7.1-2
commit 0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
```

The stage definitions in `data/stages/` are therefore version-specific source mappings, not generic descriptions of an arbitrary OpenClaw release.

---

## Live architecture

```text
Browser (127.0.0.1:8765)
        │
        │ POST /api/live/start
        │ GET  /api/live/{liveRunId}
        ▼
Local viewer + collector
        │
        ├─ OpenClaw CLI / Gateway request
        ├─ TraceClaw JSONL reader
        └─ run correlation
                 │
                 ▼
Instrumented OpenClaw Gateway
        │
        ├─ G0–G18 events
        └─ post-G18 Agent Runtime events
                 │
                 ▼
        one normalized run snapshot
        ├─ stages
        └─ agentRuntime
                 │
                 ▼
          browser playback
```

Gateway credentials remain local and are not embedded in frontend code.

---

## Quick start

### 1. Requirements

- OpenClaw installed locally
- OpenClaw Gateway running
- Python 3
- this repository
- TraceClaw runtime instrumentation applied to the pinned OpenClaw source checkout

Verify OpenClaw first:

```bash
which openclaw
openclaw gateway status
```

### 2. Clone

```bash
git clone https://github.com/Chi123Zhang/openclaw-gateway-trace.git
cd openclaw-gateway-trace
```

### 3. Start the viewer

If the trace file is already at the path expected by `start_live.sh`:

```bash
zsh start_live.sh
```

Or specify another JSONL trace file:

```bash
TRACECLAW_LOG_PATH=/absolute/path/to/gateway-runtime.jsonl zsh start_live.sh
```

Then open:

```text
http://127.0.0.1:8765/
```

`start_live.sh` runs a runtime doctor before starting the viewer so a successful assistant response is not mistaken for a valid G0–G18 trace when the local Gateway is stale or uninstrumented.

### 4. Run a trace

Enter any prompt and press **Run trace**. The browser advances only as correlated evidence from that run becomes available.

A tool-using prompt is useful for demonstrating the full cross-layer path because it can expose:

```text
G0–G18
  ↓
Agent Runtime
  ↓
tool_started
  ↓
tool_result
  ↓
agent_reply_finalized
  ↓
reply_resolver_returned
```

---

## Completed-run publishing

Each successful completed live run is stored locally and, by default, normalized into the public latest snapshot:

```text
collector/runs/<timestamp>_<runId>.json   local archive (gitignored)
                 ↓
data/cases/latest-live.js                 replaceable published snapshot
                 ↓
git commit + push origin main
```

Only the normalized published trace is pushed. Raw local run archives remain ignored.

Disable automatic publication for a session with:

```bash
TRACECLAW_AUTO_PUBLISH_LATEST=0 zsh start_live.sh
```

Explicit `?reference=1` pages are treated as saved/published trace views; the normal live viewer starts from an evidence-neutral **SOURCE MODEL** state.

---

## Repository layout

```text
openclaw-gateway-trace/
├── index.html                     # main viewer
├── start_live.sh                  # local viewer + collector entry point
├── config.js
├── assets/                        # rendering, evidence, flow, live playback
├── data/
│   ├── modules.js
│   ├── stages/                    # fixed G0–G18 source catalog
│   └── cases/                     # saved / latest published trace
├── collector/                     # live API, parsing, correlation, persistence
├── instrumentation/
│   └── openclaw-v2026.7.1-2/     # pinned Gateway + Agent Runtime patches
└── scripts/
    ├── publish_latest_run.py
    ├── reinstall_local_instrumented_gateway.sh
    ├── trace_runtime_doctor.py
    └── verify_agent_runtime_capture.py
```

---

## Research direction

TraceClaw is currently a research prototype. The next stage is evaluation rather than additional UI feature work.

Planned research questions include:

- **Faithfulness:** how accurately does source-grounded tracing reconstruct semantic execution paths?
- **Debugging utility:** can semantic boundaries localize failures more clearly than conventional logs?
- **Overhead:** what latency / resource / trace-volume cost does instrumentation introduce?
- **Generality:** how well does the approach transfer across OpenClaw versions or other agent runtimes?

A central hypothesis is that **observable message events are not always equivalent to semantic execution boundaries**, and that source-grounded runtime evidence can make those boundaries explicit.

---

## Current limitations

1. **G14–G16 do not currently have standalone runtime events for every internal step.** They may appear as source-confirmed/source-derived when downstream evidence proves the surrounding control path.
2. **Post-G18 Agent Runtime evidence requires the pinned local instrumentation patch.** Without it, provider/model/tool/final-reply fields remain explicitly uncaptured.
3. **Connection-level G0–G2 correlation is conservative.** These events occur before request-specific identifiers are consistently available and are not intrinsically one-per-request when a connection is reused.
4. **Live execution requires a local OpenClaw + TraceClaw environment.** A static GitHub Pages view can display saved traces but cannot reproduce local runtime execution by itself.

---

<details>
<summary><strong>Apply / verify the pinned instrumentation</strong></summary>

The version-specific instrumentation lives in:

```text
instrumentation/openclaw-v2026.7.1-2/
```

It includes separate Gateway and post-G18 Agent Runtime instrumentation scripts.

For the full local macOS development setup, the repair script reapplies instrumentation, rebuilds the pinned OpenClaw checkout, repoints the managed Gateway to the local instrumented build, restarts it, and runs the runtime doctor:

```bash
bash scripts/reinstall_local_instrumented_gateway.sh
```

Verify Agent Runtime capture separately with:

```bash
python3 scripts/verify_agent_runtime_capture.py
```

</details>

<details>
<summary><strong>Live API</strong></summary>

Start a run:

```http
POST /api/live/start
Content-Type: application/json

{
  "message": "What is the weather today?"
}
```

Poll the run:

```http
GET /api/live/{liveRunId}
```

The older blocking `POST /api/run` endpoint remains available for direct testing, while the browser uses the incremental live API.

</details>

<details>
<summary><strong>Manual collector startup</strong></summary>

```bash
cd collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

TRACECLAW_LOG_PATH=/absolute/path/to/gateway-runtime.jsonl \
.venv/bin/python -m uvicorn viewer_server:app \
  --host 127.0.0.1 \
  --port 8765
```

Then open `http://127.0.0.1:8765/`.

</details>
