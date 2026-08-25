"""Source-aligned stage-level Input/Output rendering overrides.

The collector's base event renderer intentionally mirrors raw TraceClaw event
payloads.  That is useful for trace inspection, but some UI stages represent a
source-level object boundary whose real Input/Output is not identical to the
instrumentation event envelope.

Keep those corrections here so the live viewer stays dynamic: values come from
the current request/runtime event, while the field mapping comes from the fixed
OpenClaw v2026.7.1-2 source snapshot.  Reference runs are used to validate the
mapping; their concrete prompt/run IDs are never hard-coded.
"""

from __future__ import annotations

import json
from typing import Any

import server


_ORIGINAL_EVENT_STAGE = server._event_stage


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


server._event_stage = _event_stage
