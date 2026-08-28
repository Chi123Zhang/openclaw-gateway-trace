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
    """Render the actual G17 internal Agent re-resolution boundary."""

    observed_session_key = event.get("sessionKey") or session_key
    fallback_agent_id = event.get("agentId")
    session_agent_id = event.get("downstreamAgentId") or event.get("agentId")

    input_lines = [f"acpDispatchSessionKey = {observed_session_key}"]
    if fallback_agent_id is not None:
        input_lines.append(f"fallback ctx.AgentId = {_render_value(fallback_agent_id)}")

    output_lines: list[str] = []
    if session_agent_id is not None:
        output_lines.append(f"sessionAgentId = {_render_value(session_agent_id)}")
    # sessionAgentCfg is a real source variable, but this TraceClaw event does not
    # serialize the configuration object itself.
    output_lines.append("sessionAgentCfg = not directly logged")

    return "\n".join(input_lines), "\n".join(output_lines)


def _g18_stage_io(
    event: dict[str, Any],
    *,
    session_key: str,
) -> tuple[str, str]:
    """Render the G18 reply-resolver invocation boundary.

    The runtime event directly records which resolver was selected. It does not
    serialize the replyResult object returned later from the deeper reply run.
    """

    observed_session_key = event.get("sessionKey") or session_key
    observed_agent_id = event.get("agentId")

    input_lines = [f"ctx.SessionKey = {observed_session_key}"]
    if observed_agent_id is not None:
        input_lines.append(f"ctx.AgentId = {_render_value(observed_agent_id)}")

    resolver_source = event.get("resolverSource")
    if resolver_source == "default_getReplyFromConfig":
        input_lines.append("custom replyResolver = none")

    return "\n".join(input_lines), "replyResult = not directly logged"


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

        downstream_agent = event.get("downstreamAgentId") or event.get("agentId")
        upstream_agent = event.get("agentId")
        if downstream_agent is not None:
            if upstream_agent == downstream_agent:
                payload["case2"] = (
                    f"The Agent was checked again in this run and stayed "
                    f"{_render_value(downstream_agent)}."
                )
            else:
                payload["case2"] = (
                    f"The downstream Agent resolved to "
                    f"{_render_value(downstream_agent)} in this run."
                )
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

        resolver_source = event.get("resolverSource")
        if resolver_source:
            payload["case2"] = (
                f"This run directly logged the selected reply resolver: "
                f"{_render_value(resolver_source)}. The full replyResult object "
                "was not logged at this boundary."
            )
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
    lines.append("ctx.ChatType = direct")
    if run_id:
        lines.append(f"ctx.MessageSid = {run_id}")
    return "\n".join(lines)


def _finalized_context_source_mapped_output(trace: dict[str, Any]) -> str:
    """Render the G15 context values established for the executed direct-text path.

    G15 has no standalone TraceClaw event in the current instrumentation. These
    values are therefore source-mapped for the current request and runtime-
    supported by the fact that the same run continues through G16/G17/G18.
    """

    meta = trace.get("meta") if isinstance(trace, dict) else None
    if not isinstance(meta, dict):
        meta = {}

    message = meta.get("prompt") or meta.get("title") or ""
    session_key = meta.get("canonicalSessionKey") or meta.get("rawSessionKey") or ""
    agent_id = meta.get("agent") or ""

    lines: list[str] = []
    if message:
        lines.extend(
            [
                f"FinalizedMsgContext.Body = {message!r}",
                f"FinalizedMsgContext.BodyForAgent = {message!r}",
                f"FinalizedMsgContext.BodyForCommands = {message!r}",
            ]
        )
    if session_key:
        lines.append(f"FinalizedMsgContext.SessionKey = {session_key}")
    if agent_id:
        lines.append(f"FinalizedMsgContext.AgentId = {agent_id}")
    lines.append("FinalizedMsgContext.ChatType = direct")
    if message and not message.strip().startswith("/"):
        lines.append("FinalizedMsgContext.CommandTurn.kind = normal")
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

    # G14: the tested desktop flow directly entered dispatchInboundMessage. In
    # current live traces, observing downstream G17/G18 is also enough to prove
    # that G14 was entered, even when no standalone G14 event was emitted.
    if isinstance(g14, dict) and not g14.get("runtimeObserved"):
        g14["concreteInput"] = mapped_input
        g14["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"
        if downstream_observed:
            g14["result"] = "entered"
            g14["case2"] = (
                "This run entered G14 and continued into the reply path. "
                "Downstream G17/G18 provide runtime support for that traversal."
            )
            g14["evidence"] = ["source", "derived"]
        if successful_reply_completion:
            g14["concreteOutput"] = "DispatchInboundResult = returned"
            g14["concreteOutputEvidence"] = (
                "SOURCE + RUNTIME-SUPPORTED / RETURN FIELDS NOT DIRECTLY LOGGED"
            )
            g14["case2"] = (
                "This run entered G14, continued through G17/G18, and later "
                "produced the assistant response. The DispatchInboundResult "
                "object returned, but its individual fields were not logged."
            )

    # G15: exactly as in the verified desktop flow, this is the nested context-
    # finalization step between G14 and G16. Reaching G17/G18 proves the finalized
    # context was successfully handed onward, while the values shown below remain
    # source-mapped rather than a direct standalone G15 event.
    if isinstance(g15, dict) and not g15.get("runtimeObserved"):
        g15["concreteInput"] = mapped_input
        g15["concreteInputEvidence"] = "SOURCE-MAPPED FROM G13"
        if downstream_observed:
            g15["result"] = "finalized"
            g15["concreteOutput"] = _finalized_context_source_mapped_output(trace)
            g15["concreteOutputEvidence"] = (
                "SOURCE-DERIVED FOR THIS RUN + RUNTIME-SUPPORTED HANDOFF"
            )
            g15["case2"] = (
                "G15 finalized the message context and handed it to G16. "
                "The same run then reached G17/G18, confirming the handoff. "
                "These context values are source-mapped for this run, not a "
                "standalone G15 runtime snapshot."
            )
            g15["evidence"] = ["source", "derived"]

    # G16: G17/G18 are nested inside this orchestration. Their same-run runtime
    # events prove the normal G16 path was traversed. The final assistant response
    # proves the overall reply path completed, but the DispatchFromConfigResult
    # object's individual fields are not directly serialized by TraceClaw.
    if isinstance(g16, dict) and not g16.get("runtimeObserved"):
        g16["concreteInput"] = mapped_input
        g16["concreteInputEvidence"] = "SOURCE-MAPPED THROUGH G15"
        if downstream_observed:
            g16["result"] = "normal_path"
            g16["case2"] = (
                "This run followed the normal G16 reply path because the same "
                "run directly reached G17 and G18."
            )
            g16["evidence"] = ["source", "derived"]
        if successful_reply_completion:
            g16["concreteOutput"] = "DispatchFromConfigResult = returned"
            g16["concreteOutputEvidence"] = (
                "SOURCE + RUNTIME-SUPPORTED / RETURN FIELDS NOT DIRECTLY LOGGED"
            )
            g16["case2"] = (
                "This run followed G16 through G17/G18 and later produced the "
                "assistant response. DispatchFromConfigResult returned, while "
                "its individual fields were not logged as a standalone G16 event."
            )

    # G18 directly observes resolver selection. Once the same run later exposes
    # the assistant response, the return to G16 is runtime-supported, but the
    # replyResult object itself is still not serialized at this boundary.
    if isinstance(g18, dict) and successful_reply_completion:
        g18["concreteOutput"] = "replyResult = returned to G16"
        g18["concreteOutputEvidence"] = (
            "SOURCE + RUNTIME-SUPPORTED / REPLYRESULT FIELDS NOT DIRECTLY LOGGED"
        )
        resolver_source = ""
        for runtime_event in g18.get("runtimeEvents", []):
            if not isinstance(runtime_event, dict):
                continue
            fields = runtime_event.get("fields")
            if isinstance(fields, dict) and fields.get("resolverSource"):
                resolver_source = str(fields["resolverSource"])
                break
        if resolver_source:
            g18["case2"] = (
                f"This run directly selected {resolver_source}. The deeper reply "
                "path completed and returned to G16; the full replyResult fields "
                "were not logged at the G18 boundary."
            )

    return trace


server._event_stage = _event_stage
server._build_trace = _build_trace
