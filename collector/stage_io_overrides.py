"""Source-aligned stage-level Input/Output rendering overrides.

The collector's base event renderer intentionally mirrors raw TraceClaw event
payloads. That is useful for trace inspection, but some UI stages represent a
source-level object boundary whose real Input/Output is not identical to the
instrumentation event envelope.

Keep those corrections here so the live viewer stays dynamic: values come from
the current request/runtime event, while the field mapping comes from the fixed
OpenClaw v2026.7.1-2 source snapshot. Reference runs are used to validate the
mapping; their concrete prompt/run IDs are never hard-coded.
"""

from __future__ import annotations

import json
from typing import Any

import server


_ORIGINAL_EVENT_STAGE = server._event_stage
_ORIGINAL_BUILD_TRACE = server._build_trace


def _render_value(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def _g13_stage_io(
    event: dict[str, Any],
    *,
    message: str,
    session_key: str,
    run_id: str,
) -> tuple[str, str]:
    """Render the actual G13 MsgContext construction boundary.

    Source mapping (OpenClaw v2026.7.1-2, chat.ts):
      parsedMessage           -> MsgContext.Body / RawBody / command bodies
      sessionKey              -> MsgContext.SessionKey
      agentId                 -> MsgContext.AgentId
      clientRunId             -> MsgContext.MessageSid
      client.connect.scopes   -> MsgContext.GatewayClientScopes
      ChatType                -> fixed "direct"

    The current live collector request does not carry attachments, so the
    reference/runtime path has no staged media fields on the constructed ctx.
    """

    observed_session_key = event.get("sessionKey") or session_key
    observed_run_id = event.get("runId") or run_id
    observed_agent_id = event.get("agentId")
    observed_scopes = event.get("scopes")

    input_lines = [
        f"parsedMessage = {message!r}",
        f"sessionKey = {observed_session_key}",
    ]
    if observed_agent_id is not None:
        input_lines.append(f"agentId = {_render_value(observed_agent_id)}")
    input_lines.append(f"clientRunId = {observed_run_id}")
    if observed_scopes is not None:
        input_lines.append(f"clientScopes = {_render_value(observed_scopes)}")
    input_lines.append("stagedMedia = none")

    output_lines = [
        f"MsgContext.Body = {message!r}",
        f"MsgContext.SessionKey = {observed_session_key}",
    ]
    if observed_agent_id is not None:
        output_lines.append(f"MsgContext.AgentId = {_render_value(observed_agent_id)}")
    output_lines.extend(
        [
            "MsgContext.ChatType = direct",
            f"MsgContext.MessageSid = {observed_run_id}",
        ]
    )
    if observed_scopes is not None:
        output_lines.append(
            f"MsgContext.GatewayClientScopes = {_render_value(observed_scopes)}"
        )
    output_lines.append("media fields = absent")

    return "\n".join(input_lines), "\n".join(output_lines)


def _g17_stage_io(
    event: dict[str, Any],
    *,
    session_key: str,
) -> tuple[str, str]:
    """Render the actual G17 internal Agent re-resolution boundary.

    Source (dispatch-from-config.ts:1422-1427):
      resolveSessionAgentId({
        sessionKey: acpDispatchSessionKey,
        config: cfg,
        fallbackAgentId: ctx.AgentId,
      })
      sessionAgentCfg = resolveAgentConfig(cfg, sessionAgentId)

    The TraceClaw event observes sessionKey, agentId and downstreamAgentId. We map
    those observations to the source variable names, while leaving the full Agent
    config object unasserted because it is not captured by the event.
    """

    observed_session_key = event.get("sessionKey") or session_key
    fallback_agent_id = event.get("agentId")
    session_agent_id = event.get("downstreamAgentId") or event.get("agentId")

    input_lines = [f"acpDispatchSessionKey = {observed_session_key}"]
    if fallback_agent_id is not None:
        input_lines.append(f"fallback ctx.AgentId = {_render_value(fallback_agent_id)}")

    output_lines: list[str] = []
    if session_agent_id is not None:
        output_lines.append(f"sessionAgentId = {_render_value(session_agent_id)}")
    output_lines.append("sessionAgentCfg = not separately observed")

    return "\n".join(input_lines), "\n".join(output_lines)


def _g18_stage_io(
    event: dict[str, Any],
    *,
    session_key: str,
) -> tuple[str, str]:
    """Render the G18 reply-resolver invocation boundary.

    G18 consumes the finalized ctx plus prepared replyOptions/replyConfig and an
    optional custom resolver. The current TraceClaw event records resolver
    selection, but not the resolver's returned replyResult. Therefore selection
    evidence belongs to Observed trace, while the stage-level concrete Output is
    explicitly limited to the unobserved replyResult.
    """

    observed_session_key = event.get("sessionKey") or session_key
    observed_agent_id = event.get("agentId")

    input_lines = [f"ctx.SessionKey = {observed_session_key}"]
    if observed_agent_id is not None:
        input_lines.append(f"ctx.AgentId = {_render_value(observed_agent_id)}")

    resolver_source = event.get("resolverSource")
    if resolver_source == "default_getReplyFromConfig":
        input_lines.append("custom replyResolver = none")

    return "\n".join(input_lines), "replyResult = not separately observed"


def _event_stage(
    stage: str,
    event: dict[str, Any],
    *,
    message: str,
    session_key: str,
    run_id: str,
) -> dict[str, Any]:
    payload = _ORIGINAL_EVENT_STAGE(
        stage,
        event,
        message=message,
        session_key=session_key,
        run_id=run_id,
    )

    if stage == "G13":
        concrete_input, concrete_output = _g13_stage_io(
            event,
            message=message,
            session_key=session_key,
            run_id=run_id,
        )
        payload["concreteInput"] = concrete_input
        payload["concreteOutput"] = concrete_output
        payload["concreteInputEvidence"] = "RUNTIME + REQUEST + SOURCE-MAPPED"
        payload["concreteOutputEvidence"] = "RUNTIME + SOURCE-MAPPED"
        return payload

    if stage == "G17":
        concrete_input, concrete_output = _g17_stage_io(
            event,
            session_key=session_key,
        )
        payload["concreteInput"] = concrete_input
        payload["concreteOutput"] = concrete_output
        payload["concreteInputEvidence"] = "RUNTIME + SOURCE-MAPPED"
        payload["concreteOutputEvidence"] = "RUNTIME + SOURCE-MAPPED / OBSERVATION LIMIT"
        return payload

    if stage == "G18":
        concrete_input, concrete_output = _g18_stage_io(
            event,
            session_key=session_key,
        )
        payload["concreteInput"] = concrete_input
        payload["concreteOutput"] = concrete_output
        payload["concreteInputEvidence"] = "RUNTIME + SOURCE-MAPPED"
        payload["concreteOutputEvidence"] = "SOURCE / OBSERVATION LIMIT"
        return payload

    return payload


def _source_mapped_msg_context_input(trace: dict[str, Any]) -> str:
    """Project the MsgContext fields handed across G14/G15/G16 boundaries."""

    meta = trace.get("meta") if isinstance(trace, dict) else None
    if not isinstance(meta, dict):
        meta = {}

    message = meta.get("prompt") or meta.get("title") or ""
    session_key = meta.get("canonicalSessionKey") or meta.get("rawSessionKey") or ""
    agent_id = meta.get("agent") or ""
    run_id = meta.get("runId") or ""

    lines: list[str] = []
    if message:
        lines.append(f"ctx.Body = {message!r}")
    if session_key:
        lines.append(f"ctx.SessionKey = {session_key}")
    if agent_id:
        lines.append(f"ctx.AgentId = {agent_id}")
    # G13 fixes ChatType to direct on the Gateway chat.send path, and G15
    # canonicalizes rather than replacing it for this ordinary direct turn.
    lines.append("ctx.ChatType = direct")
    if run_id:
        lines.append(f"ctx.MessageSid = {run_id}")
    return "\n".join(lines)


def _build_trace(
    *,
    message: str,
    session_key: str,
    run_id: str,
    events: list[dict[str, Any]],
    response: str | None,
    send_result: Any,
) -> dict[str, Any]:
    trace = _ORIGINAL_BUILD_TRACE(
        message=message,
        session_key=session_key,
        run_id=run_id,
        events=events,
        response=response,
        send_result=send_result,
    )

    stages = trace.get("stages") if isinstance(trace, dict) else None
    if not isinstance(stages, dict):
        return trace

    mapped_input = _source_mapped_msg_context_input(trace)
    if not mapped_input:
        return trace

    # G14 signature: dispatchInboundMessage({ ctx, cfg, dispatcher, ... }).
    # Concrete values shown here are only the current-run ctx fields that can be
    # source-mapped from G13. cfg/dispatcher/replyOptions remain in the abstract
    # Input description because they are not standalone runtime observations.
    g14 = stages.get("G14")
    if isinstance(g14, dict) and not g14.get("runtimeObserved"):
        g14["concreteInput"] = mapped_input
        g14["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"

    # G15 is nested inside G14: finalizeInboundContext(params.ctx). It receives
    # that MsgContext and returns a FinalizedMsgContext. The current instrumentation
    # does not capture the returned object fields as a standalone G15 event.
    g15 = stages.get("G15")
    if isinstance(g15, dict) and not g15.get("runtimeObserved"):
        g15["concreteInput"] = mapped_input
        g15["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"

    # G16 receives the finalized context returned by G15. For this ordinary direct
    # text path, the key identity/body fields remain stable through G15. The full
    # cfg/dispatcher/replyOptions values are intentionally left in the abstract
    # Input description because they are not independently observed here.
    g16 = stages.get("G16")
    if isinstance(g16, dict) and not g16.get("runtimeObserved"):
        g16["concreteInput"] = mapped_input
        g16["concreteInputEvidence"] = "SOURCE-MAPPED THROUGH G15"
        # Observed G17/G18 in the same run proves traversal through the surrounding
        # G16 source path, but it still does not expose G16's final result object.
        g17 = stages.get("G17")
        g18 = stages.get("G18")
        downstream_observed = any(
            isinstance(item, dict) and "runtime" in item.get("evidence", [])
            for item in (g17, g18)
        )
        if downstream_observed:
            g16["case2"] = (
                "Traversal of G16 is runtime-supported by downstream G17/G18 "
                "events in this run; no standalone TraceClaw G16 event was captured."
            )
            g16["evidence"] = ["source", "derived"]

    return trace


server._event_stage = _event_stage
server._build_trace = _build_trace
