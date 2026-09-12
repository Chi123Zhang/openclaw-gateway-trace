# TraceClaw Common Trace Schema

This document defines a **proposed cross-system trace model** for TraceClaw. The current OpenClaw implementation still contains version-specific collector fields; this schema is the abstraction layer I plan to use when adapting the same runtime execution analysis method to other agent systems such as MAVDR.

The goal is not to force every system into the same internal implementation. The goal is to give TraceClaw a small common vocabulary for describing one execution across source stages, runtime events, model/tool activity, final results, and inter-agent handoffs.

## Core idea

A TraceClaw run can be summarized as:

```text
run
  └─ agent / subsystem
       └─ stage
            └─ runtime event
                 ├─ evidence type
                 ├─ input / output
                 ├─ model / tool activity
                 └─ result / handoff
```

The source model defines what **can** happen. Runtime events describe what **did** happen. TraceClaw keeps those two layers separate and then correlates them for execution analysis.

## Proposed event shape

```json
{
  "runId": "run-123",
  "system": "openclaw",
  "agentId": "main",
  "stageId": "G18",
  "eventType": "reply_resolver_invoked",
  "timestamp": "2026-09-12T12:00:00Z",
  "evidenceType": "observed",
  "input": {},
  "output": {},
  "model": null,
  "tool": null,
  "handoff": null,
  "durationMs": null,
  "metadata": {}
}
```

This is a design target, not a claim that every current OpenClaw event is already emitted in exactly this shape.

## Core fields

| Field | Meaning | Required? |
| --- | --- | --- |
| `runId` | Correlates all events that belong to one execution. | Yes |
| `system` | Source system, for example `openclaw` or `mavdr`. | Yes |
| `agentId` | Agent or runtime actor responsible for the event when known. | Optional |
| `stageId` | Source/workflow stage associated with the event, e.g. `G18` or a future MAVDR stage. | Optional |
| `eventType` | Normalized event category. | Yes |
| `timestamp` | Event time in an ordered, machine-readable format. | Yes |
| `evidenceType` | How strongly the stage/event is supported by runtime evidence. | Yes |
| `input` | Input values exposed safely for this stage/event. | Optional |
| `output` | Output values exposed safely for this stage/event. | Optional |
| `model` | Provider/model execution details when applicable. | Optional |
| `tool` | Tool execution details when applicable. | Optional |
| `handoff` | Transition from one agent/subsystem to another. | Optional |
| `durationMs` | Stage/event duration when directly measurable. | Optional |
| `metadata` | System-specific values that do not belong in the common fields. | Optional |

## Evidence types

TraceClaw currently uses four evidence states in the UI. The common schema keeps the same distinction.

### `source_model`

The stage or relationship exists in the verified source/workflow model, but no current runtime claim is being made.

Typical use:

```text
before a live run starts
```

### `observed`

The claim is supported by a directly captured runtime/native event from the current run.

Examples:

```text
agent_run_started
tool_started
tool_result
agent_reply_finalized
reply_resolver_returned
```

### `source_derived`

The current run plus verified source control flow supports the path, but there is no standalone runtime event for that exact internal step.

This state is intentionally different from `observed`.

### `not_observed`

The stage or branch is part of the source/workflow model but has no direct current-run evidence.

This must not be interpreted as proof that the code path is impossible; it only means TraceClaw did not observe it in the current run.

## Normalized event categories

The first generic event vocabulary should stay small. System-specific event names can be preserved in `metadata.nativeEventType` when needed.

```text
run_started
run_completed
run_failed

stage_entered
stage_completed

agent_selected
agent_run_started
agent_run_completed

model_started
model_completed

tool_started
tool_result
tool_failed

handoff_started
handoff_completed

final_result
resolver_returned
```

The schema should only normalize events when the semantic meaning is actually comparable across systems. It should not rename unrelated implementation events just to make the schema look uniform.

## Model activity

Suggested shape:

```json
{
  "provider": "openai",
  "model": "gpt-5.6",
  "requestId": null,
  "status": "completed",
  "durationMs": 1240
}
```

Only fields directly available from the current runtime should be populated.

## Tool activity

Suggested shape:

```json
{
  "name": "web_search",
  "callId": "tool-call-42",
  "status": "completed",
  "inputSummary": "weather in New York",
  "resultSummary": "...",
  "durationMs": 620
}
```

Raw secrets, credentials, or sensitive tool payloads should not be exposed just to make a trace more detailed.

## Handoffs

For multi-agent systems, handoff becomes a first-class part of the analysis.

Suggested shape:

```json
{
  "fromAgent": "repair-agent",
  "toAgent": "verification-agent",
  "reason": "candidate patch ready for verification",
  "status": "completed"
}
```

For OpenClaw, a related boundary is the transition from Gateway reply dispatch into the deeper Agent Runtime and the later resolver return to G16.

For MAVDR, the same concept can describe transitions such as:

```text
Scanning → Analysis
Analysis → Repair
Repair → Verification
Verification → Repair   (retry path)
Verification → Arbitration
Arbitration → Post-processing
```

The exact paths must be derived from the real MAVDR implementation rather than assumed from the UI.

## OpenClaw mapping

The current OpenClaw case study can be mapped conceptually into the common model as follows:

| OpenClaw concept | Common trace concept |
| --- | --- |
| G0–G18 stage catalog | `stageId` + source model |
| `agent_runtime_selected` | `agent_selected` |
| `agent_run_started` | `agent_run_started` |
| `tool_started` | `tool_started` |
| `tool_result` | `tool_result` |
| `agent_reply_finalized` | `final_result` |
| `agent_run_ended` | `agent_run_completed` |
| `reply_resolver_returned` | `resolver_returned` / runtime-to-Gateway return boundary |

The native event name should still be retained when useful for source-grounded debugging.

## Planned MAVDR mapping

The next step is to test this abstraction against the MAVDR six-agent system at the Chinese Academy of Sciences:

```text
Scanning
→ Analysis
→ Repair
→ Verification
→ Arbitration
→ Post-processing
```

For each agent, TraceClaw should be able to represent:

```text
source/workflow stages
runtime observations
model activity
tool activity
result
handoff
retry / return path when present
```

The first implementation target should be one agent at a time, starting with a code path where runtime behavior and handoffs are easy to validate from source.

## Design rules

1. **Do not confuse source structure with runtime evidence.** A stage existing in source does not mean the current run executed it.
2. **Do not infer `observed` from UI state alone.** Direct runtime evidence is required.
3. **Keep native events available.** Normalization must not remove the source-specific evidence needed for debugging.
4. **Treat semantic boundaries carefully.** Message-level callbacks are not automatically run-level completion boundaries.
5. **Correlate before visualizing.** A UI should not combine events from different runs, sessions, or agents without evidence that they belong together.
6. **Keep the schema extensible.** System-specific values belong in `metadata` until there is evidence that they deserve a common field.

## Why this abstraction matters

The OpenClaw implementation proves the idea on one concrete system. A common trace model makes it possible to ask whether the same execution-analysis method transfers to another architecture instead of hard-coding every visualization around OpenClaw's G0–G18 stages.

The intended progression is:

```text
OpenClaw-specific implementation
        ↓
common TraceClaw execution model
        ↓
MAVDR per-agent execution analysis
        ↓
cross-system evaluation of faithfulness, debugging utility, and generality
```
