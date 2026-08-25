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

    if stage != "G13":
        return payload

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


def _source_mapped_msg_context_input(trace: dict[str, Any]) -> str:
    """Project the G13 MsgContext fields that are handed into G14/G15.

    G14 receives the G13 ctx as params.ctx. Inside G14, G15 is invoked as
    finalizeInboundContext(params.ctx). G14/G15 do not have standalone TraceClaw
    events in the current instrumentation, so these are explicitly source-mapped
    from the already observed G13/current-run metadata rather than labelled as
    direct G14/G15 runtime observations.
    """

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
    # G13 fixes ChatType to direct on the Gateway chat.send path.
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

    # G15 is nested inside G14: finalizeInboundContext(params.ctx). It therefore
    # receives the same MsgContext at this boundary, not generic message/session/
    # run fields. Its FinalizedMsgContext return value is still not separately
    # observed by current instrumentation, so the concrete Output stays limited.
    g15 = stages.get("G15")
    if isinstance(g15, dict) and not g15.get("runtimeObserved"):
        g15["concreteInput"] = mapped_input
        g15["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"

    return trace


server._event_stage = _event_stage
server._build_trace = _build_trace
