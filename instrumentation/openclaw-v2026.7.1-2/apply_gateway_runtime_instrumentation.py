#!/usr/bin/env python3
"""Apply reproducible G0-G18 TraceClaw instrumentation to OpenClaw v2026.7.1-2.

The patch records only stage-boundary facts already present at each source
boundary. It does not alter authentication, routing, admission, Agent selection,
reply behavior, prompts, tools, or delivery.

Expected upstream source commit:
0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


EXPECTED_COMMIT = "0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c"
HELPER_REL = Path("src/infra/traceclaw-gateway-runtime.ts")

HELPER_SOURCE = r"""import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TRACECLAW_GATEWAY_RUNTIME_SCHEMA = "traceclaw.gateway.runtime.v1";

type JsonSafe =
  | null
  | boolean
  | number
  | string
  | JsonSafe[]
  | { [key: string]: JsonSafe };

type TraceClawGatewayRuntimeEvent = {
  stage: `G${number}`;
  event: string;
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  [key: string]: unknown;
};

function tracePath(): string {
  return (
    process.env.TRACECLAW_LOG_PATH?.trim() ||
    process.env.TRACECLAW_GATEWAY_TRACE_FILE?.trim() ||
    join(homedir(), "Desktop", "traceclaw-cake3-gateway.jsonl")
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

export function writeTraceClawGatewayRuntimeEvent(
  input: TraceClawGatewayRuntimeEvent,
): void {
  try {
    const { stage, event, ...fields } = input;
    const payload = {
      schema: TRACECLAW_GATEWAY_RUNTIME_SCHEMA,
      scope: "gateway-runtime",
      stage,
      event,
      ts: new Date().toISOString(),
      ...(jsonSafe(fields) as Record<string, JsonSafe>),
    };
    appendFileSync(tracePath(), JSON.stringify(payload) + "\n", "utf8");
  } catch {
    // Observability must never change Gateway behavior.
  }
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
        print("already patched:", path, marker)
        return False
    if needle not in content:
        raise RuntimeError(
            f"source anchor not found in {path}: {needle[:120]!r}"
        )
    write(path, content.replace(needle, replacement, 1))
    print("patched:", path, marker)
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


def ensure_helper(root: Path) -> None:
    helper = root / HELPER_REL
    if helper.exists() and read(helper) == HELPER_SOURCE:
        print("already present:", helper)
        return
    write(helper, HELPER_SOURCE)
    print("created/updated:", helper)


def apply_imports(root: Path) -> None:
    patches = [
        (
            "src/gateway/server/ws-connection/auth-context.ts",
            'from "../../../infra/traceclaw-gateway-runtime.js"',
            'import { withSerializedRateLimitAttempt } from "../../rate-limit-attempt-serialization.js";',
            'import { withSerializedRateLimitAttempt } from "../../rate-limit-attempt-serialization.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../../../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/gateway/server/ws-connection/message-handler.ts",
            'from "../../../infra/traceclaw-gateway-runtime.js"',
            'import { rawDataToString } from "../../../infra/ws.js";',
            'import { rawDataToString } from "../../../infra/ws.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../../../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/gateway/server-methods.ts",
            'from "../infra/traceclaw-gateway-runtime.js"',
            'import { getPluginRegistryState } from "../plugins/runtime-state.js";',
            'import { getPluginRegistryState } from "../plugins/runtime-state.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/gateway/server-methods/chat.ts",
            'from "../../infra/traceclaw-gateway-runtime.js"',
            'import { formatErrorMessage, formatUncaughtError } from "../../infra/errors.js";',
            'import { formatErrorMessage, formatUncaughtError } from "../../infra/errors.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/auto-reply/dispatch.ts",
            'from "../infra/traceclaw-gateway-runtime.js"',
            'import { isDiagnosticsEnabled } from "../infra/diagnostic-events.js";',
            'import { isDiagnosticsEnabled } from "../infra/diagnostic-events.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/auto-reply/reply/inbound-context.ts",
            'from "../../infra/traceclaw-gateway-runtime.js"',
            'import { resolveCommandTurnContext } from "../command-turn-context.js";',
            'import { resolveCommandTurnContext } from "../command-turn-context.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../../infra/traceclaw-gateway-runtime.js";',
        ),
        (
            "src/auto-reply/reply/dispatch-from-config.ts",
            'from "../../infra/traceclaw-gateway-runtime.js"',
            'import { formatErrorMessage } from "../../infra/errors.js";',
            'import { formatErrorMessage } from "../../infra/errors.js";\n'
            'import { writeTraceClawGatewayRuntimeEvent } from "../../infra/traceclaw-gateway-runtime.js";',
        ),
    ]
    for rel, marker, needle, replacement in patches:
        insert_once(root / rel, marker, needle, replacement)


def apply_stages(root: Path) -> None:
    auth = root / "src/gateway/server/ws-connection/auth-context.ts"
    insert_once(
        auth,
        'event: "connection_auth_state_resolution_started"',
        '  const sharedConnectAuth = resolveSharedConnectAuth(params.connectAuth);',
        '  const sharedConnectAuth = resolveSharedConnectAuth(params.connectAuth);\n'
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G0",\n'
        '    event: "connection_auth_state_resolution_started",\n'
        '    authMode: params.resolvedAuth.mode,\n'
        '    hasDeviceIdentity: params.hasDeviceIdentity,\n'
        '    sharedAuthProvided: Boolean(sharedConnectAuth),\n'
        '  });',
    )
    insert_once(
        auth,
        'event: "shared_credential_authorized"',
        '  const sharedAuthResult =\n    sharedConnectAuth &&',
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G1",\n'
        '    event: "shared_credential_authorized",\n'
        '    authMode: params.resolvedAuth.mode,\n'
        '    authMethod: authResult.method,\n'
        '    sharedAuthProvided,\n'
        '    result: authResult.ok ? "allow" : "deny",\n'
        '    ...(authResult.reason ? { reason: authResult.reason } : {}),\n'
        '  });\n\n'
        '  const sharedAuthResult =\n    sharedConnectAuth &&',
    )
    insert_once(
        auth,
        'event: "connection_auth_state_resolved"',
        '  return {\n    authResult,',
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G0",\n'
        '    event: "connection_auth_state_resolved",\n'
        '    authMode: params.resolvedAuth.mode,\n'
        '    authMethod: authResult.method ?? (params.resolvedAuth.mode === "password" ? "password" : "token"),\n'
        '    authOk: authResult.ok,\n'
        '    sharedAuthOk,\n'
        '    sharedAuthProvided,\n'
        '    hasDeviceIdentity: params.hasDeviceIdentity,\n'
        '    result: authResult.ok ? "authorized" : "not_authorized",\n'
        '  });\n\n'
        '  return {\n    authResult,',
    )

    message_handler = root / "src/gateway/server/ws-connection/message-handler.ts"
    insert_once(
        message_handler,
        'event: "connection_authentication_completed"',
        '        advanceHandshakePhase("ready");',
        '        writeTraceClawGatewayRuntimeEvent({\n'
        '          stage: "G2",\n'
        '          event: "connection_authentication_completed",\n'
        '          authMode: resolvedAuth.mode,\n'
        '          authMethod,\n'
        '          role,\n'
        '          scopes: helloOkAuthScopes,\n'
        '          result: "pass",\n'
        '        });\n'
        '        advanceHandshakePhase("ready");',
    )

    methods = root / "src/gateway/server-methods.ts"
    insert_once(
        methods,
        'event: "gateway_method_authorized"',
        '  const authError = authorizeGatewayMethod(req.method, client, req.params, methodRegistry);',
        '  const authError = authorizeGatewayMethod(req.method, client, req.params, methodRegistry);\n'
        '  if (req.method === "chat.send") {\n'
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G3",\n'
        '      event: "gateway_method_authorized",\n'
        '      method: req.method,\n'
        '      role: client?.connect?.role ?? "operator",\n'
        '      scopes: client?.connect?.scopes ?? [],\n'
        '      result: authError ? "deny" : "allow",\n'
        '    });\n'
        '  }',
    )

    chat = root / "src/gateway/server-methods/chat.ts"
    insert_once(
        chat,
        'event: "chat_send_request_validated"',
        '    const sanitizedMessageResult = sanitizeChatSendMessageInput(p.message);',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G4",\n'
        '      event: "chat_send_request_validated",\n'
        '      runId: p.idempotencyKey,\n'
        '      sessionKey: p.sessionKey,\n'
        '      method: "chat.send",\n'
        '      hasPrivilegedFields: Boolean(\n'
        '        p.systemInputProvenance || p.systemProvenanceReceipt || suppressCommandInterpretation\n'
        '      ),\n'
        '      hasExplicitOrigin: explicitOriginResult.value !== undefined,\n'
        '      result: "pass",\n'
        '    });\n'
        '    const sanitizedMessageResult = sanitizeChatSendMessageInput(p.message);',
    )
    insert_once(
        chat,
        'event: "chat_message_normalized"',
        '    const pendingChatSendKey = pendingChatSendDedupeKey(clientRunId);',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G5",\n'
        '      event: "chat_message_normalized",\n'
        '      runId: clientRunId,\n'
        '      sessionKey: rawSessionKey,\n'
        '      messageLength: inboundMessage.length,\n'
        '      attachmentCount: normalizedAttachments.length,\n'
        '      messageChangedBySanitization: inboundMessage !== p.message,\n'
        '      result: inboundMessage === p.message ? "unchanged" : "normalized",\n'
        '    });\n'
        '    const pendingChatSendKey = pendingChatSendDedupeKey(clientRunId);',
    )
    insert_once(
        chat,
        'event: "requested_agent_resolved"',
        '    const sessionLoadOptions = requestedAgentId ? { agentId: requestedAgentId } : undefined;',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G6",\n'
        '      event: "requested_agent_resolved",\n'
        '      runId: clientRunId,\n'
        '      sessionKey: rawSessionKey,\n'
        '      explicitAgentId: agentIdOverride,\n'
        '      requestedAgentId,\n'
        '      result: "resolved",\n'
        '    });\n'
        '    const sessionLoadOptions = requestedAgentId ? { agentId: requestedAgentId } : undefined;',
    )
    insert_once(
        chat,
        'event: "session_resolved"',
        '    const expectedSessionRoutingContract = normalizeOptionalText(p.expectedSessionRoutingContract);',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G7",\n'
        '      event: "session_resolved",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      rawSessionKey,\n'
        '      canonicalSessionKey: sessionKey,\n'
        '      ...(entry?.sessionId ? { sessionId: entry.sessionId } : {}),\n'
        '      result: "resolved",\n'
        '    });\n'
        '    const expectedSessionRoutingContract = normalizeOptionalText(p.expectedSessionRoutingContract);',
    )
    insert_once(
        chat,
        'event: "agent_session_validated"',
        '    const agentId = resolveSessionAgentId({',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G8",\n'
        '      event: "agent_session_validated",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      requestedAgentId,\n'
        '      selectedAgentId: selectedAgent.agentId,\n'
        '      ...(backingSessionId ? { backingSessionId } : {}),\n'
        '      result: "pass",\n'
        '    });\n'
        '    const agentId = resolveSessionAgentId({',
    )
    insert_once(
        chat,
        'event: "effective_agent_resolved"',
        '    const activeRunScopeKey = resolveChatSendActiveScopeKey({',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G9",\n'
        '      event: "effective_agent_resolved",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      agentId,\n'
        '      result: "resolved",\n'
        '    });\n'
        '    const activeRunScopeKey = resolveChatSendActiveScopeKey({',
    )
    insert_once(
        chat,
        'event: "session_send_policy_evaluated"',
        '    if (sendPolicy === "deny") {',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G10",\n'
        '      event: "session_send_policy_evaluated",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      agentId,\n'
        '      sendPolicy,\n'
        '      result: sendPolicy,\n'
        '    });\n'
        '    if (sendPolicy === "deny") {',
    )
    insert_once(
        chat,
        'event: "run_idempotency_guard_passed"',
        '    const chatSendTraceAttributes = {',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G11",\n'
        '      event: "run_idempotency_guard_passed",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      agentId,\n'
        '      dedupeDecision: "new_dispatch",\n'
        '      result: "pass",\n'
        '    });\n'
        '    const chatSendTraceAttributes = {',
    )
    insert_once(
        chat,
        'event: "work_admission_completed"',
        '    const cleanupAdmittedRun: typeof activeRunAbort.cleanup = (options) => {',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G12",\n'
        '      event: "work_admission_completed",\n'
        '      runId: clientRunId,\n'
        '      sessionKey,\n'
        '      agentId,\n'
        '      attemptId: pendingAttemptId,\n'
        '      admissionDecision: "admitted",\n'
        '      latestSessionRevalidated: true,\n'
        '      result: "admitted",\n'
        '    });\n'
        '    const cleanupAdmittedRun: typeof activeRunAbort.cleanup = (options) => {',
    )
    insert_once(
        chat,
        'event: "runtime_context_constructed"',
        '      const isInternalTextSlashCommandTurn =',
        '      writeTraceClawGatewayRuntimeEvent({\n'
        '        stage: "G13",\n'
        '        event: "runtime_context_constructed",\n'
        '        runId: clientRunId,\n'
        '        sessionKey: ctx.SessionKey,\n'
        '        agentId: ctx.AgentId,\n'
        '        body: ctx.Body,\n'
        '        chatType: ctx.ChatType,\n'
        '        messageSid: ctx.MessageSid,\n'
        '        hasMedia: mediaPathOffloadPaths.length > 0 || normalizedAttachments.length > 0,\n'
        '        result: "constructed",\n'
        '      });\n'
        '      const isInternalTextSlashCommandTurn =',
    )

    dispatch = root / "src/auto-reply/dispatch.ts"
    insert_once(
        dispatch,
        'event: "dispatch_inbound_entered"',
        '  const finalized = measureDiagnosticsTimelineSpanSync(',
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G14",\n'
        '    event: "dispatch_inbound_entered",\n'
        '    runId: replyOptions?.runId,\n'
        '    sessionKey: params.ctx.SessionKey,\n'
        '    agentId: params.ctx.AgentId,\n'
        '    result: "entered",\n'
        '  });\n'
        '  const finalized = measureDiagnosticsTimelineSpanSync(',
    )

    inbound = root / "src/auto-reply/reply/inbound-context.ts"
    insert_once(
        inbound,
        'event: "inbound_context_finalized"',
        '  return normalized as T & FinalizedMsgContext;',
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G15",\n'
        '    event: "inbound_context_finalized",\n'
        '    runId: normalized.MessageSid,\n'
        '    sessionKey: normalized.SessionKey,\n'
        '    agentId: normalized.AgentId,\n'
        '    body: normalized.Body,\n'
        '    chatType: normalized.ChatType,\n'
        '    result: "finalized",\n'
        '  });\n'
        '  return normalized as T & FinalizedMsgContext;',
    )

    dfc = root / "src/auto-reply/reply/dispatch-from-config.ts"
    insert_once(
        dfc,
        'event: "reply_dispatch_orchestration_entered"',
        '  const dispatchOperationSessionKey =',
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G16",\n'
        '    event: "reply_dispatch_orchestration_entered",\n'
        '    runId: params.replyOptions?.runId,\n'
        '    sessionKey: acpDispatchSessionKey,\n'
        '    agentId: ctx.AgentId,\n'
        '    result: "entered",\n'
        '  });\n'
        '  const dispatchOperationSessionKey =',
    )
    insert_once(
        dfc,
        'event: "effective_agent_reresolved"',
        '  const sessionAgentCfg = resolveAgentConfig(cfg, sessionAgentId);',
        '  const sessionAgentCfg = resolveAgentConfig(cfg, sessionAgentId);\n'
        '  writeTraceClawGatewayRuntimeEvent({\n'
        '    stage: "G17",\n'
        '    event: "effective_agent_reresolved",\n'
        '    runId: params.replyOptions?.runId,\n'
        '    sessionKey: acpDispatchSessionKey,\n'
        '    agentId: ctx.AgentId,\n'
        '    downstreamAgentId: sessionAgentId,\n'
        '    result: "resolved",\n'
        '  });',
    )
    insert_once(
        dfc,
        'event: "reply_resolver_selected"',
        '    const replyConfig = withFullRuntimeReplyConfig(',
        '    writeTraceClawGatewayRuntimeEvent({\n'
        '      stage: "G18",\n'
        '      event: "reply_resolver_selected",\n'
        '      runId: params.replyOptions?.runId,\n'
        '      sessionKey: acpDispatchSessionKey,\n'
        '      agentId: sessionAgentId,\n'
        '      resolverSource: params.replyResolver\n'
        '        ? "custom_replyResolver"\n'
        '        : "default_getReplyFromConfig",\n'
        '      resolver: params.replyResolver ? "custom" : "getReplyFromConfig",\n'
        '      result: "selected",\n'
        '    });\n'
        '    const replyConfig = withFullRuntimeReplyConfig(',
    )


def apply(root: Path) -> None:
    ensure_helper(root)
    apply_imports(root)
    apply_stages(root)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not (root / "src").is_dir():
        raise SystemExit("OpenClaw source root not found: " + str(root))

    head = git_head(root)
    if head:
        print("OpenClaw HEAD:", head)
        if head != EXPECTED_COMMIT:
            print(
                "NOTE: working tree may already contain TraceClaw changes; "
                "all remaining edits still require exact v2026.7.1-2 anchors."
            )

    apply(root)
    print()
    print("Gateway G0-G18 instrumentation applied.")
    print("Schema: traceclaw.gateway.runtime.v1")


if __name__ == "__main__":
    main()
