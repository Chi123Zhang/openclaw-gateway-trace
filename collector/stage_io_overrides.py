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


def _has_runtime_evidence(stage: Any) -> bool:
    if not isinstance(stage, dict):
        return False
    if stage.get("runtimeObserved"):
        return True
    evidence = stage.get("evidence")
    if not isinstance(evidence, list):
        return False
    return any(str(item).strip().lower() == "runtime" for item in evidence)


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
    output_lines.append("sessionAgentCfg = not captured")

    return "\n".join(input_lines), "\n".join(output_lines)


def _g18_stage_io(
    event: dict[str, Any],
    *,
    session_key: str,
) -> tuple[str, str]:
    """Render the G18 reply-resolver invocation boundary.

    G18 consumes the finalized ctx plus prepared replyOptions/replyConfig and an
    optional custom resolver. The current TraceClaw event records resolver
    selection, but not the resolver's returned replyResult. A later successful
    run may runtime-support that a value returned, while its contents still
    remain uncaptured.
    """

    observed_session_key = event.get("sessionKey") or session_key
    observed_agent_id = event.get("agentId")

    input_lines = [f"ctx.SessionKey = {observed_session_key}"]
    if observed_agent_id is not None:
        input_lines.append(f"ctx.AgentId = {_render_value(observed_agent_id)}")

    resolver_source = event.get("resolverSource")
    if resolver_source == "default_getReplyFromConfig":
        input_lines.append("custom replyResolver = none")

    return "\n".join(input_lines), "replyResult contents = not captured"


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


def _finalized_context_runtime_supported_output(trace: dict[str, Any]) -> str:
    """Render only G15 output fields supported by downstream runtime evidence."""

    meta = trace.get("meta") if isinstance(trace, dict) else None
    if not isinstance(meta, dict):
        meta = {}

    session_key = meta.get("canonicalSessionKey") or meta.get("rawSessionKey") or ""
    agent_id = meta.get("agent") or ""

    lines = ["FinalizedMsgContext = returned"]
    if session_key:
        lines.append(f"FinalizedMsgContext.SessionKey = {session_key}")
    if agent_id:
        lines.append(f"FinalizedMsgContext.AgentId = {agent_id}")
    lines.append("remaining fields = not captured")
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

    g14 = stages.get("G14")
    g15 = stages.get("G15")
    g16 = stages.get("G16")
    g17 = stages.get("G17")
    g18 = stages.get("G18")

    g17_observed = _has_runtime_evidence(g17)
    g18_observed = _has_runtime_evidence(g18)
    downstream_observed = g17_observed or g18_observed
    response_captured = isinstance(response, str) and bool(response.strip())
    successful_reply_completion = g18_observed and response_captured

    # G14 signature: dispatchInboundMessage({ ctx, cfg, dispatcher, ... }).
    # The concrete input fields are source-mapped from the actual G13 context.
    if isinstance(g14, dict) and not g14.get("runtimeObserved"):
        g14["concreteInput"] = mapped_input
        g14["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"
        if successful_reply_completion:
            # v2026.7.1-2 returns DispatchInboundResult from dispatchInboundMessage.
            # The completed current run supports that the return boundary was
            # reached, but TraceClaw does not record the result object's fields.
            g14["concreteOutput"] = (
                "DispatchInboundResult = returned\n"
                "result fields = not captured"
            )
            g14["concreteOutputEvidence"] = (
                "SOURCE + RUNTIME-SUPPORTED / OBSERVATION LIMIT"
            )
            g14["case2"] = (
                "G14 completed in this run: downstream G17/G18 were reached and "
                "an assistant response was captured. No standalone G14 return "
                "event exposed the DispatchInboundResult fields."
            )
            g14["evidence"] = ["source", "derived"]

    # G15 is nested inside G14: finalizeInboundContext(params.ctx). Reaching G16
    # (and therefore G17/G18) proves that G15 returned a FinalizedMsgContext.
    # Only SessionKey/AgentId are shown because those identities are supported by
    # downstream runtime evidence; the rest of the object remains uncaptured.
    if isinstance(g15, dict) and not g15.get("runtimeObserved"):
        g15["concreteInput"] = mapped_input
        g15["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"
        if downstream_observed:
            g15["concreteOutput"] = _finalized_context_runtime_supported_output(trace)
            g15["concreteOutputEvidence"] = (
                "SOURCE-MAPPED + RUNTIME-SUPPORTED / OBSERVATION LIMIT"
            )
            g15["case2"] = (
                "G15 returned in this run because execution continued into G16 "
                "and downstream G17/G18. The complete FinalizedMsgContext object "
                "was not captured as a standalone event."
            )
            g15["evidence"] = ["source", "derived"]

    # G16 receives the finalized context returned by G15. For this ordinary direct
    # text path, the key identity/body fields remain stable through G15. A captured
    # assistant response after observed G18 supports normal completion of G16, but
    # does not expose the DispatchFromConfigResult object fields.
    if isinstance(g16, dict) and not g16.get("runtimeObserved"):
        g16["concreteInput"] = mapped_input
        g16["concreteInputEvidence"] = "SOURCE-MAPPED THROUGH G15"
        if successful_reply_completion:
            g16["concreteOutput"] = (
                "DispatchFromConfigResult = returned\n"
                "result fields = not captured"
            )
            g16["concreteOutputEvidence"] = (
                "SOURCE + RUNTIME-SUPPORTED / OBSERVATION LIMIT"
            )
            g16["case2"] = (
                "G16 completed in this run: G17/G18 were observed and the final "
                "assistant response was captured. The DispatchFromConfigResult "
                "fields were not recorded by a standalone TraceClaw G16 event."
            )
            g16["evidence"] = ["source", "derived"]
        elif downstream_observed:
            g16["case2"] = (
                "Traversal of G16 is runtime-supported by downstream G17/G18 "
                "events in this run; no standalone TraceClaw G16 return event "
                "was captured."
            )
            g16["evidence"] = ["source", "derived"]

    # G18's event directly observes resolver selection, not the replyResult. When
    # this same run later produces the assistant response, the resolver return is
    # runtime-supported even though the replyResult contents remain uncaptured.
    if isinstance(g18, dict) and successful_reply_completion:
        g18["concreteOutput"] = (
            "replyResult = returned\n"
            "replyResult contents = not captured"
        )
        g18["concreteOutputEvidence"] = (
            "SOURCE + RUNTIME-SUPPORTED / OBSERVATION LIMIT"
        )

    return trace


server._event_stage = _event_stage
server._build_trace = _build_trace
