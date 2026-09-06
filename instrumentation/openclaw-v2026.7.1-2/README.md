# Post-G18 Agent Runtime instrumentation — OpenClaw v2026.7.1-2

This instrumentation is pinned to:

- release: `v2026.7.1-2`
- source commit: `0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`

It extends the existing Gateway G0–G18 trace **after G18**. It does not introduce
G19 or rewrite the Gateway stage model.

## Verified source path after G18

The fixed source path is:

```text
G18 · replyResolver(...)
  ↓
getReplyFromConfig(...)
  ↓
runPreparedReply(...)
  ↓
runReplyAgent(...)
  ↓
runAgentTurnWithFallback(...)
  ├─ CLI branch      → runCliAgentWithLifecycle(...)
  └─ embedded branch → runEmbeddedAgent(...)
                        ↓
                  embedded run attempt
                  ├─ resolve Skills prompt
                  ├─ construct runtime Tools
                  ├─ create Agent session
                  ├─ subscribe Agent lifecycle/tool events
                  └─ activeSession.prompt(...)
                        ↓
                  assistant/tool event loop
                        ↓
                  Agent terminal lifecycle
                        ↓
return through runReplyAgent / runPreparedReply / getReplyFromConfig
  ↓
replyResult returns across the G18 boundary
  ↓
G16 resumes post-processing / delivery / completion
```

Source anchors in OpenClaw v2026.7.1-2:

| Boundary | Fixed source |
| --- | --- |
| G18 resolver selection/invocation | `src/auto-reply/reply/dispatch-from-config.ts:3381–3808` |
| default resolver | `src/auto-reply/reply/get-reply.ts` |
| prepared reply runner | `src/auto-reply/reply/get-reply-run.ts:512+` |
| reply Agent runner | `src/auto-reply/reply/agent-runner.ts:1130+` |
| CLI / embedded runtime selection | `src/auto-reply/reply/agent-runner-execution.ts:2338–2660` |
| Skills prompt | `src/agents/embedded-agent-runner/run/attempt.ts:1150–1158` |
| runtime tool construction | `src/agents/embedded-agent-runner/run/attempt.ts:1342–1383` |
| Agent session creation | `src/agents/embedded-agent-runner/run/attempt.ts:2557–2573` |
| Agent event subscription | `src/agents/embedded-agent-runner/run/attempt.ts:3711–3749` |
| model prompt boundary | `src/agents/embedded-agent-runner/run/attempt.ts:3582–3588` |
| Agent lifecycle start/end | `src/agents/embedded-agent-subscribe.handlers.lifecycle.ts:27–58, 170–225` |
| tool start | `src/agents/embedded-agent-subscribe.handlers.tools.ts:1044–1059` |
| tool result | `src/agents/embedded-agent-subscribe.handlers.tools.ts:1266+, 1470+` |
| final embedded assistant message | `src/agents/embedded-agent-subscribe.handlers.messages.ts:1026+` |
| global Agent event bus | `src/infra/agent-events.ts:487+` |

## What is recorded

The patch writes `traceclaw.agent.runtime.v1` records to the **same**
`TRACECLAW_LOG_PATH` JSONL file used by the Gateway trace.

Direct runtime records:

```text
agent_runtime_selected
agent_run_started
tool_started
tool_result
agent_reply_finalized
agent_run_ended
reply_resolver_returned
```

Those records allow the collector to observe, per run:

- final / effective Agent;
- resolver;
- runtime branch (`embedded` or `cli`);
- provider and model;
- whether a tool was called;
- tool name, sanitized arguments and sanitized/capped result;
- Agent start and terminal lifecycle;
- final embedded assistant reply when that boundary exists;
- direct return of `replyResult` to G16.

The existing `agent.wait → chat.history` path remains the authority for the final
user-visible assistant response. A downstream `chat.history` response is **not**
relabeled as the internal `replyResult`.

## Apply to the local OpenClaw source

From the trace-viewer repository:

```bash
python3 instrumentation/openclaw-v2026.7.1-2/apply_agent_runtime_instrumentation.py \
  --root /Users/mac/Desktop/openclaw-source-2026.7.1-2
```

The patcher is idempotent. It validates exact source anchors and supports the
already-instrumented v2026.7.1-2 working tree used by TraceClaw.

Then rebuild OpenClaw:

```bash
cd /Users/mac/Desktop/openclaw-source-2026.7.1-2
pnpm build
```

Restart the OpenClaw Gateway so the rebuilt source is active, then restart the
local trace viewer/collector.

## Collector output

A new run contains a separate top-level object:

```json
{
  "agentRuntime": {
    "observed": true,
    "finalAgent": "main",
    "resolverSource": "default_getReplyFromConfig",
    "runner": "embedded",
    "provider": "...",
    "model": "...",
    "runStarted": true,
    "runEnded": true,
    "toolCalled": false,
    "tools": [],
    "finalReply": "...",
    "finalReplyEvidence": "RUNTIME · agent reply finalized",
    "returnToG16Observed": true,
    "events": []
  }
}
```

No missing provider/model/tool/reply fields are invented. If the instrumentation
does not observe a boundary, the viewer keeps it absent / not captured.
