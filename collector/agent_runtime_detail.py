"""Normalize directly observed post-G18 Agent Runtime events.

The Gateway G0-G18 model remains unchanged. OpenClaw's deeper agent execution is
kept in a separate agentRuntime object so a runtime event can never be mistaken
for a numbered Gateway stage.

Expected instrumentation schema: traceclaw.agent.runtime.v1.

Only values present in the current run are promoted to runtime facts. The final
assistant message from chat.history is kept as downstream evidence when the
instrumented agent reply event is absent; it is not relabeled as an internal
replyResult observation.
"""

from __future__ import annotations

from typing import Any

import server


_ORIGINAL_BUILD_TRACE = server._build_trace
_AGENT_RUNTIME_SCHEMA = "traceclaw.agent.runtime.v1"
_AGENT_RUNTIME_SCOPE = "agent-runtime"


def is_agent_runtime_event(event: Any) -> bool:
    return isinstance(event, dict) and (
        event.get("schema") == _AGENT_RUNTIME_SCHEMA
        or event.get("scope") == _AGENT_RUNTIME_SCOPE
    )


def _last(events: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.get("event") == name:
            return event
    return None


def _last_gateway_event(
    events: list[dict[str, Any]], stage: str
) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.get("stage") == stage:
            return event
    return None


def _event_copy(event: dict[str, Any]) -> dict[str, Any]:
    """Keep the actual JSONL record, minus redundant schema/scope markers."""
    return {
        str(key): value
        for key, value in event.items()
        if key not in {"schema", "scope"}
    }


def _tool_records(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered_ids: list[str] = []
    by_id: dict[str, dict[str, Any]] = {}

    for event in events:
        if event.get("event") not in {"tool_started", "tool_result"}:
            continue

        call_id = str(event.get("toolCallId") or "").strip()
        if not call_id:
            call_id = f"observed-{len(ordered_ids) + 1}"

        if call_id not in by_id:
            ordered_ids.append(call_id)
            by_id[call_id] = {
                "toolCallId": call_id,
                "name": event.get("name") or "",
                "started": False,
                "resultObserved": False,
            }

        item = by_id[call_id]
        if event.get("name"):
            item["name"] = event.get("name")

        if event.get("event") == "tool_started":
            item["started"] = True
            if event.get("ts") is not None:
                item["startedAt"] = event.get("ts")
            if event.get("args") is not None:
                item["args"] = event.get("args")
        else:
            item["resultObserved"] = True
            item["status"] = "error" if event.get("isError") is True else "completed"
            item["isError"] = event.get("isError") is True
            if event.get("result") is not None:
                item["result"] = event.get("result")
            if event.get("toolErrorSummary") is not None:
                item["toolErrorSummary"] = event.get("toolErrorSummary")
            if event.get("ts") is not None:
                item["endedAt"] = event.get("ts")

    return [by_id[call_id] for call_id in ordered_ids]


def _normalize_agent_runtime(
    *,
    events: list[dict[str, Any]],
    response: str | None,
) -> dict[str, Any]:
    runtime_events = [event for event in events if is_agent_runtime_event(event)]

    selected = _last(runtime_events, "agent_runtime_selected")
    started = _last(runtime_events, "agent_run_started")
    ended = _last(runtime_events, "agent_run_ended")
    finalized = _last(runtime_events, "agent_reply_finalized")
    returned = _last(runtime_events, "reply_resolver_returned")

    g17 = _last_gateway_event(events, "G17") or {}
    g18 = _last_gateway_event(events, "G18") or {}

    final_agent = (
        (finalized or {}).get("agentId")
        or (ended or {}).get("agentId")
        or (started or {}).get("agentId")
        or (selected or {}).get("agentId")
        or g17.get("downstreamAgentId")
        or g17.get("agentId")
        or ""
    )

    resolver_source = (
        (returned or {}).get("resolverSource")
        or g18.get("resolverSource")
        or ""
    )
    resolver = (
        "getReplyFromConfig"
        if resolver_source == "default_getReplyFromConfig"
        else ((returned or {}).get("resolver") or g18.get("resolver") or "")
    )

    provider = (
        (finalized or {}).get("provider")
        or (selected or {}).get("provider")
        or ""
    )
    model = (
        (finalized or {}).get("model")
        or (selected or {}).get("model")
        or ""
    )
    provider_model_evidence = (
        "RUNTIME · final assistant message"
        if finalized and (finalized.get("provider") or finalized.get("model"))
        else ("RUNTIME · selected attempt" if selected else "NOT CAPTURED")
    )

    tools = _tool_records(runtime_events)
    terminal_observed = ended is not None
    tool_stream_observed = any(
        event.get("event") in {"tool_started", "tool_result"}
        for event in runtime_events
    )

    direct_final_reply = ""
    if finalized and isinstance(finalized.get("replyText"), str):
        direct_final_reply = finalized["replyText"]

    downstream_reply = response if isinstance(response, str) else ""
    final_reply = direct_final_reply or downstream_reply
    final_reply_evidence = (
        "RUNTIME · agent reply finalized"
        if direct_final_reply
        else ("RESPONSE · chat.history after agent.wait" if downstream_reply else "NOT CAPTURED")
    )

    phase = str((ended or {}).get("phase") or "").strip().lower()
    if phase == "end":
        status = "completed"
    elif phase in {"error", "finishing"}:
        status = phase
    elif started:
        status = "running"
    elif selected:
        status = "selected"
    else:
        status = "not captured"

    attempts = [
        _event_copy(event)
        for event in runtime_events
        if event.get("event") == "agent_runtime_selected"
    ]

    return {
        "schemaVersion": "traceclaw.viewer.agent-runtime.v1",
        "observed": bool(runtime_events),
        "status": status,
        "finalAgent": final_agent,
        "resolver": resolver,
        "resolverSource": resolver_source,
        "runner": (selected or {}).get("runner") or "",
        "provider": provider,
        "model": model,
        "providerModelEvidence": provider_model_evidence,
        "runStarted": started is not None,
        "startedAt": (started or {}).get("startedAt") or (started or {}).get("ts"),
        "runEnded": terminal_observed,
        "endedAt": (ended or {}).get("endedAt") or (ended or {}).get("ts"),
        "terminalPhase": (ended or {}).get("phase") or "",
        "stopReason": (ended or {}).get("stopReason") or (finalized or {}).get("stopReason") or "",
        "toolCalled": bool(tools),
        "toolEventObserved": tool_stream_observed,
        "toolCount": len(tools),
        "tools": tools,
        "finalReply": final_reply,
        "finalReplyEvidence": final_reply_evidence,
        "agentReplyDirectlyObserved": bool(direct_final_reply),
        "returnToG16Observed": returned is not None,
        "replyResultKind": (returned or {}).get("replyResultKind") or "",
        "replyCount": (returned or {}).get("replyCount"),
        "downstreamAssistantResponseObserved": bool(downstream_reply),
        "attempts": attempts,
        "events": [_event_copy(event) for event in runtime_events],
    }


def _enrich_trace(
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

    runtime = _normalize_agent_runtime(events=events, response=response)
    trace["agentRuntime"] = runtime

    meta = trace.get("meta")
    if isinstance(meta, dict):
        if runtime["finalAgent"]:
            meta["downstreamAgentFinal"] = runtime["finalAgent"]
        if runtime["resolverSource"]:
            meta["resolverSource"] = runtime["resolverSource"]
            if runtime["resolver"]:
                meta["resolver"] = runtime["resolver"]
        if runtime["provider"]:
            meta["provider"] = runtime["provider"]
        if runtime["model"]:
            meta["model"] = runtime["model"]
        if runtime["observed"]:
            if runtime["toolCalled"]:
                names = [
                    str(item.get("name") or "").strip()
                    for item in runtime["tools"]
                    if str(item.get("name") or "").strip()
                ]
                meta["tools"] = ", ".join(dict.fromkeys(names)) or str(runtime["toolCount"])
            elif runtime["runEnded"] and runtime["toolEventObserved"] is False:
                meta["tools"] = "none"
            if runtime["runner"]:
                meta["runner"] = runtime["runner"]

    collector = trace.setdefault("_collector", {})
    if isinstance(collector, dict):
        collector["agentRuntimeSchema"] = runtime["schemaVersion"]
        collector["agentRuntimeObserved"] = runtime["observed"]
        collector["agentRuntimeEventCount"] = len(runtime["events"])
        collector["agentRuntimeReturnObserved"] = runtime["returnToG16Observed"]

    return trace


server._build_trace = _enrich_trace
