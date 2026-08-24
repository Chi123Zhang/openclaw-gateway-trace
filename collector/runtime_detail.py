"""Attach raw correlated runtime observations to each rendered Gateway stage.

The base collector intentionally normalizes each G-stage to a compact payload.  For
interactive inspection we also keep the actual TraceClaw event fields so the UI can
show what was really observed instead of reconstructing parameters from source text.

This module patches ``server._build_trace`` at import time.  ``viewer_server`` imports
it before ``live_runs`` so both /api/run and /api/live/* use the enriched payload.
"""

from __future__ import annotations

from typing import Any

import server
from trace_parser import event_result


_ORIGINAL_BUILD_TRACE = server._build_trace


def _clean_value(value: Any) -> Any:
    """Keep JSON-compatible runtime values without converting them to prose."""
    if isinstance(value, dict):
        return {str(key): _clean_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    if isinstance(value, tuple):
        return [_clean_value(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _runtime_record(stage: str, event: dict[str, Any], ordinal: int) -> dict[str, Any]:
    fields = {
        str(key): _clean_value(value)
        for key, value in event.items()
        if key not in {"schema", "stage", "event", "ts"} and value is not None
    }

    step_value = event.get("stepIndex", event.get("step"))
    step_index: int | None = None
    if isinstance(step_value, int):
        step_index = step_value
    elif isinstance(step_value, str) and step_value.isdigit():
        step_index = int(step_value)

    phase = event.get("phase")
    if phase not in {"input", "output", "enter", "exit", "before", "after"}:
        phase = None

    return {
        "ordinal": ordinal,
        "stage": stage,
        "event": str(event.get("event") or "observed"),
        "ts": event.get("ts"),
        "result": event_result(stage, event),
        "stepIndex": step_index,
        "phase": phase,
        "fields": fields,
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

    by_stage: dict[str, list[dict[str, Any]]] = {}
    for ordinal, event in enumerate(events):
        stage = event.get("stage")
        if not isinstance(stage, str) or not stage.startswith("G"):
            continue
        by_stage.setdefault(stage, []).append(_runtime_record(stage, event, ordinal))

    stages = trace.get("stages")
    if isinstance(stages, dict):
        for stage_id, stage_payload in stages.items():
            if not isinstance(stage_payload, dict):
                continue
            runtime_events = by_stage.get(str(stage_id), [])
            stage_payload["runtimeEvents"] = runtime_events
            stage_payload["runtimeEventCount"] = len(runtime_events)
            stage_payload["runtimeObserved"] = bool(runtime_events)
            stage_payload["directStepRuntimeObserved"] = any(
                item.get("stepIndex") is not None for item in runtime_events
            )

    collector = trace.setdefault("_collector", {})
    if isinstance(collector, dict):
        collector["runtimeDetailSchema"] = "traceclaw.viewer.runtime-detail.v1"
        collector["rawStageEventCount"] = sum(len(items) for items in by_stage.values())
        collector["stepTaggedRuntimeEventCount"] = sum(
            1
            for items in by_stage.values()
            for item in items
            if item.get("stepIndex") is not None
        )

    return trace


server._build_trace = _enrich_trace
