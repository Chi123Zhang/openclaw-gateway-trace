#!/usr/bin/env python3
"""Apply post-G18 TraceClaw instrumentation to OpenClaw v2026.7.1-2.

This patch is intentionally small and evidence-oriented:
- mirror the existing Agent Event bus lifecycle/tool events to TRACECLAW_LOG_PATH;
- record the selected runtime branch/provider/model for each fallback attempt;
- record the final embedded assistant provider/model/reply text;
- record the reply-resolver return boundary back into G16.

It does not change Gateway decisions, Agent behavior, prompts, tools, or replies.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


EXPECTED_COMMIT = "0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c"
HELPER_REL = Path("src/infra/traceclaw-agent-runtime.ts")


HELPER_SOURCE = """import { appendFileSync } from "node:fs";

const TRACECLAW_AGENT_RUNTIME_SCHEMA = "traceclaw.agent.runtime.v1";

type JsonSafe =
  | null
  | boolean
  | number
  | string
  | JsonSafe[]
  | { [key: string]: JsonSafe };

type TraceClawAgentRuntimeEvent = {
  event: string;
  runId?: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  [key: string]: unknown;
};

type AgentBusEventLike = {
  runId: string;
  seq?: number;
  ts?: number;
  stream: string;
  data: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
};

function tracePath(): string {
  return (
    process.env.TRACECLAW_LOG_PATH?.trim() ||
    process.env.TRACECLAW_GATEWAY_TRACE_FILE?.trim() ||
    ""
  );
}

function jsonSafe(value: unknown, seen = new WeakSet<object>(), depth = 0): JsonSafe {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return value as null | string | boolean;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (depth >= 8) {
    return "[depth-limit]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonSafe(item, seen, depth + 1));
  }
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return "[circular]";
    }
    seen.add(objectValue);
    const result: Record<string, JsonSafe> = {};
    for (const [key, item] of Object.entries(objectValue)) {
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        continue;
      }
      result[key] = jsonSafe(item, seen, depth + 1);
    }
    seen.delete(objectValue);
    return result;
  }
  return String(value);
}

export function writeTraceClawAgentRuntimeEvent(input: TraceClawAgentRuntimeEvent): void {
  const path = tracePath();
  if (!path) {
    return;
  }

  try {
    const { event, ...fields } = input;
    const payload = {
      schema: TRACECLAW_AGENT_RUNTIME_SCHEMA,
      scope: "agent-runtime",
      event,
      ts: new Date().toISOString(),
      ...(jsonSafe(fields) as Record<string, JsonSafe>),
    };
    appendFileSync(path, JSON.stringify(payload) + "\n", "utf8");
  } catch {
    // Trace instrumentation must never affect Agent execution.
  }
}

export function mirrorTraceClawAgentEvent(event: AgentBusEventLike): void {
  const phase = typeof event.data.phase === "string" ? event.data.phase : "";
  let traceEvent = "";

  if (event.stream === "lifecycle") {
    traceEvent = phase === "start" ? "agent_run_started" : "agent_run_ended";
  } else if (event.stream === "tool") {
    if (phase === "start") {
      traceEvent = "tool_started";
    } else if (phase === "result") {
      traceEvent = "tool_result";
    } else {
      return;
    }
  } else {
    return;
  }

  writeTraceClawAgentRuntimeEvent({
    event: traceEvent,
    runId: event.runId,
    ...(event.sessionKey ? { sessionKey: event.sessionKey } : {}),
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    ...(event.agentId ? { agentId: event.agentId } : {}),
    ...(event.seq != null ? { agentEventSeq: event.seq } : {}),
    ...(event.ts != null ? { agentEventTs: event.ts } : {}),
    stream: event.stream,
    ...event.data,
  });
}
"""


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def insert_once(path: Path, marker: str, needle: str, replacement: str) -> bool:
    content = read(path)
    if marker in content:
        print("already patched:", path)
        return False
    if needle not in content:
        raise RuntimeError("source anchor not found in " + str(path))
    write(path, content.replace(needle, replacement, 1))
    print("patched:", path)
    return True


def git_head(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def apply(root: Path) -> None:
    helper = root / HELPER_REL
    if helper.exists() and "TRACECLAW_AGENT_RUNTIME_SCHEMA" in read(helper):
        print("already present:", helper)
    else:
        write(helper, HELPER_SOURCE)
        print("created:", helper)

    agent_events = root / "src/infra/agent-events.ts"
    insert_once(
        agent_events,
        'from "./traceclaw-agent-runtime.js"',
        'import { createAbortError } from "./abort-signal.js";',
        'import { createAbortError } from "./abort-signal.js";\n'
        'import { mirrorTraceClawAgentEvent } from "./traceclaw-agent-runtime.js";',
    )
    insert_once(
        agent_events,
        "mirrorTraceClawAgentEvent(enriched);",
        "  if (enriched) {\n    notifyListeners(getAgentEventState().listeners, enriched);\n  }",
        "  if (enriched) {\n"
        "    mirrorTraceClawAgentEvent(enriched);\n"
        "    notifyListeners(getAgentEventState().listeners, enriched);\n"
        "  }",
    )

    execution = root / "src/auto-reply/reply/agent-runner-execution.ts"
    insert_once(
        execution,
        'from "../../infra/traceclaw-agent-runtime.js"',
        'import { isDiagnosticsEnabled } from "../../infra/diagnostic-events.js";',
        'import { isDiagnosticsEnabled } from "../../infra/diagnostic-events.js";\n'
        'import { writeTraceClawAgentRuntimeEvent } from "../../infra/traceclaw-agent-runtime.js";',
    )
    insert_once(
        execution,
        'event: "agent_runtime_selected",\n                runId,\n                sessionKey: params.sessionKey,\n                agentId: params.followupRun.run.agentId,\n                runner: "cli"',
        '              const result = await agentTurnTiming.measure("cli_run", () =>\n'
        '                runCliAgentWithLifecycle({',
        '              writeTraceClawAgentRuntimeEvent({\n'
        '                event: "agent_runtime_selected",\n'
        '                runId,\n'
        '                sessionKey: params.sessionKey,\n'
        '                agentId: params.followupRun.run.agentId,\n'
        '                runner: "cli",\n'
        '                provider: cliExecutionProvider,\n'
        '                model,\n'
        '              });\n'
        '              const result = await agentTurnTiming.measure("cli_run", () =>\n'
        '                runCliAgentWithLifecycle({',
    )
    insert_once(
        execution,
        'event: "agent_runtime_selected",\n                  runId,\n                  sessionKey: params.sessionKey,\n                  agentId: params.followupRun.run.agentId,\n                  runner: "embedded"',
        '                const result = await agentTurnTiming.measure("embedded_run", () =>\n'
        '                  runEmbeddedAgent({',
        '                writeTraceClawAgentRuntimeEvent({\n'
        '                  event: "agent_runtime_selected",\n'
        '                  runId,\n'
        '                  sessionKey: params.sessionKey,\n'
        '                  agentId: params.followupRun.run.agentId,\n'
        '                  runner: "embedded",\n'
        '                  provider: embeddedRunProvider,\n'
        '                  model,\n'
        '                });\n'
        '                const result = await agentTurnTiming.measure("embedded_run", () =>\n'
        '                  runEmbeddedAgent({',
    )

    messages = root / "src/agents/embedded-agent-subscribe.handlers.messages.ts"
    insert_once(
        messages,
        'from "../infra/traceclaw-agent-runtime.js"',
        'import type { AssistantMessage } from "../llm/types.js";',
        'import type { AssistantMessage } from "../llm/types.js";\n'
        'import { writeTraceClawAgentRuntimeEvent } from "../infra/traceclaw-agent-runtime.js";',
    )
    insert_once(
        messages,
        'event: "agent_reply_finalized",',
        '  const finalAssistantText = silentExpectedWithoutSentinel ? "" : text;\n'
        '  const addedDuringMessage = ctx.state.assistantTexts.length > ctx.state.assistantTextBaseline;',
        '  const finalAssistantText = silentExpectedWithoutSentinel ? "" : text;\n'
        '  writeTraceClawAgentRuntimeEvent({\n'
        '    event: "agent_reply_finalized",\n'
        '    runId: ctx.params.runId,\n'
        '    ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),\n'
        '    ...(ctx.params.agentId ? { agentId: ctx.params.agentId } : {}),\n'
        '    provider: normalizeOptionalString(assistantMessage.provider) ?? "",\n'
        '    model: normalizeOptionalString(assistantMessage.model) ?? "",\n'
        '    stopReason: normalizeOptionalString(assistantMessage.stopReason) ?? "",\n'
        '    replyText: finalAssistantText,\n'
        '  });\n'
        '  const addedDuringMessage = ctx.state.assistantTexts.length > ctx.state.assistantTextBaseline;',
    )

    dispatch = root / "src/auto-reply/reply/dispatch-from-config.ts"
    insert_once(
        dispatch,
        'from "../../infra/traceclaw-agent-runtime.js"',
        'import { formatErrorMessage } from "../../infra/errors.js";',
        'import { formatErrorMessage } from "../../infra/errors.js";\n'
        'import { writeTraceClawAgentRuntimeEvent } from "../../infra/traceclaw-agent-runtime.js";',
    )
    insert_once(
        dispatch,
        'event: "reply_resolver_returned",',
        '    const sessionMetadataChanges = takeCommandSessionMetadataChanges(ctx);',
        '    writeTraceClawAgentRuntimeEvent({\n'
        '      event: "reply_resolver_returned",\n'
        '      runId: params.replyOptions?.runId,\n'
        '      sessionKey: acpDispatchSessionKey,\n'
        '      agentId: sessionAgentId,\n'
        '      resolverSource: params.replyResolver\n'
        '        ? "custom_replyResolver"\n'
        '        : "default_getReplyFromConfig",\n'
        '      replyResultKind: Array.isArray(replyResult)\n'
        '        ? "array"\n'
        '        : replyResult\n'
        '          ? "single"\n'
        '          : "undefined",\n'
        '      replyCount: Array.isArray(replyResult) ? replyResult.length : replyResult ? 1 : 0,\n'
        '    });\n'
        '    const sessionMetadataChanges = takeCommandSessionMetadataChanges(ctx);',
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        required=True,
        help="Path to the OpenClaw v2026.7.1-2 source checkout",
    )
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not (root / "src").is_dir():
        raise SystemExit("OpenClaw source root not found: " + str(root))

    head = git_head(root)
    if head:
        print("OpenClaw HEAD:", head)
        if head != EXPECTED_COMMIT:
            print(
                "NOTE: HEAD is not the pristine tag commit. "
                "The patch will continue only through exact v2026.7.1-2 source anchors; "
                "this supports an already-instrumented working tree."
            )
    else:
        print("No Git metadata found; validating by exact source anchors.")

    apply(root)
    print()
    print("Agent Runtime instrumentation applied.")
    print("TRACECLAW_LOG_PATH is used for the same JSONL stream as Gateway G0-G18.")
    print("Rebuild and restart OpenClaw before running the next trace.")


if __name__ == "__main__":
    main()
