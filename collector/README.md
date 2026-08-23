# Collector

The GitHub Pages frontend is static. The collector runs on the same computer as OpenClaw and provides live `POST /api/run` execution.

## What is implemented

`server.py` now performs the live path:

1. creates a fresh `runId` and Session key;
2. calls the installed OpenClaw CLI with `gateway call chat.send`;
3. waits for the assistant reply through `chat.history`;
4. optionally reads the TraceClaw Gateway JSONL log for matching G0–G18 runtime events;
5. correlates request stages by `runId` / `sessionKey`;
6. returns a trace payload that the existing dashboard can render.

Missing runtime observations are **not fabricated**. If a G stage has no standalone event, the collector leaves it as source-only / not separately observed.

## 1. Check OpenClaw first

On the computer where OpenClaw is running:

```bash
which openclaw
openclaw gateway status
```

The collector uses your existing OpenClaw local configuration/authentication. You do not need to put a Gateway token into the public GitHub Pages site.

If your OpenClaw binary is not named `openclaw`, set:

```bash
export OPENCLAW_BIN=/absolute/path/to/openclaw
```

Optional overrides:

```bash
export OPENCLAW_GATEWAY_URL='ws://127.0.0.1:18789'
export OPENCLAW_GATEWAY_TOKEN='...'
export OPENCLAW_GATEWAY_PASSWORD='...'
export OPENCLAW_AGENT_ID='main'
```

Only set these when your normal OpenClaw CLI configuration does not already resolve the Gateway.

## 2. Point the collector at the TraceClaw JSONL file

For the full G0–G18 runtime visualization, set `TRACECLAW_LOG_PATH` to the JSONL file that contains events such as:

```json
{"schema":"traceclaw.gateway.runtime.v1","stage":"G17","event":"effective_agent_reresolved", ...}
```

Example:

```bash
export TRACECLAW_LOG_PATH='/absolute/path/to/your/gateway-runtime.jsonl'
```

Do not guess this path. Use the same runtime log file that produced the existing Cake trace.

If this variable is omitted, OpenClaw can still answer the question, but the new trace will only contain request-known/source fields and will report that no G-stage runtime events were captured.

## 3. Start the collector

```bash
git clone https://github.com/Chi123Zhang/openclaw-gateway-trace.git
cd openclaw-gateway-trace/collector

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn server:app --host 127.0.0.1 --port 8765 --reload
```

Keep this Terminal open.

## 4. Check health

In another Terminal:

```bash
curl http://127.0.0.1:8765/health
```

A fully ready setup should report values equivalent to:

```json
{
  "status": "ok",
  "openclawCli": true,
  "gateway": "reachable",
  "traceLogConfigured": true,
  "traceLogExists": true
}
```

## 5. Test one live run directly

Before using the webpage, test the collector itself:

```bash
curl -X POST http://127.0.0.1:8765/api/run \
  -H 'Content-Type: application/json' \
  -d '{"message":"How to make a cake?"}'
```

The response contains:

```json
{
  "response": "...",
  "trace": {
    "meta": { ... },
    "stages": { "G0": { ... }, "G1": { ... } },
    "stateByStage": { ... }
  }
}
```

## 6. Use the webpage

`config.js` currently points the frontend to:

```text
http://127.0.0.1:8765
```

Open the GitHub Pages site and use **Ask OpenClaw → Run trace**.

If your browser blocks a public HTTPS page from calling a localhost HTTP service, run the frontend locally for development:

```bash
cd openclaw-gateway-trace
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

A later deployment step can put the collector behind an HTTPS tunnel/service so the public GitHub Pages site works without the local HTTP restriction.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENCLAW_BIN` | OpenClaw executable | `openclaw` |
| `OPENCLAW_GATEWAY_URL` | Explicit Gateway WebSocket URL | OpenClaw config |
| `OPENCLAW_GATEWAY_TOKEN` | Explicit Gateway token | OpenClaw config |
| `OPENCLAW_GATEWAY_PASSWORD` | Explicit Gateway password | OpenClaw config |
| `OPENCLAW_AGENT_ID` | Agent used in generated Session keys | `main` |
| `OPENCLAW_SESSION_KEY` | Reuse one fixed Session instead of creating a fresh trace Session | unset |
| `OPENCLAW_TIMEOUT_MS` | Gateway / reply timeout | `120000` |
| `TRACECLAW_LOG_PATH` | TraceClaw Gateway runtime JSONL | unset |
| `TRACECLAW_WAIT_SECONDS` | Wait for correlated runtime events | `8` |
| `TRACE_VIEWER_ORIGIN` | Extra allowed browser origin | unset |

## Current boundary

The collector currently relies on the installed OpenClaw CLI and an existing TraceClaw runtime JSONL instrumentation stream. It does not patch or rewrite OpenClaw source code at runtime.
