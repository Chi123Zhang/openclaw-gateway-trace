"""Incremental live-run API for the Gateway trace viewer.

The browser starts a real ``chat.send`` request and polls TraceClaw while the
Gateway runs it.  OpenClaw's ``chat.send`` RPC is ACK-oriented: the RPC can
return before reply dispatch / Agent Runtime has finished.  Completion is
therefore tracked with the source-native ``agent.wait`` RPC, and ``chat.history``
is used only after the run is terminal to retrieve the final assistant text.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException

from openclaw_client import OpenClawError, assistant_messages, wait_for_new_assistant_message
from server import RunRequest, _build_trace, app, client, trace_log
from trace_parser import TraceCursor, correlate_events


@dataclass
class LiveRun:
    id: str
    message: str
    session_key: str
    run_id: str
    baseline_assistant_count: int
    cursor: TraceCursor | None
    scan_cursor: TraceCursor | None
    started_at: float = field(default_factory=time.monotonic)
    raw_events: list[dict[str, Any]] = field(default_factory=list)
    send_result: Any = None
    wait_result: Any = None
    response: str | None = None
    status: str = "starting"
    error: str | None = None
    task: asyncio.Task[Any] | None = None


_RUNS: dict[str, LiveRun] = {}
_RUNS_LOCK = asyncio.Lock()


def _wait_status(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    status = payload.get("status")
    return str(status).strip().lower() if status is not None else ""


def _compact_wait_result(payload: Any) -> dict[str, Any] | None:
    """Expose only source-documented run-lifecycle fields to the local viewer."""
    if not isinstance(payload, dict):
        return None
    keys = (
        "runId",
        "status",
        "startedAt",
        "endedAt",
        "error",
        "stopReason",
        "livenessState",
        "yielded",
        "pendingError",
        "timeoutPhase",
        "providerStarted",
    )
    return {key: payload[key] for key in keys if key in payload}


def _wait_failure(payload: Any) -> str | None:
    """Return a readable terminal failure, or None for non-failure snapshots."""
    if not isinstance(payload, dict):
        return None

    status = _wait_status(payload)
    failure_statuses = {
        "error",
        "failed",
        "failure",
        "timeout",
        "timed_out",
        "killed",
        "aborted",
        "cancelled",
        "canceled",
    }
    if status not in failure_statuses:
        return None

    details: list[str] = []
    for key in ("error", "pendingError", "stopReason", "timeoutPhase", "livenessState"):
        value = payload.get(key)
        if value not in (None, "", False):
            details.append(f"{key}={value}")
    suffix = f" ({', '.join(details)})" if details else ""
    return f"agent.wait returned terminal status {status!r}{suffix}"


async def _execute(run: LiveRun) -> None:
    try:
        run.status = "sending"
        # chat.send returns the Gateway ACK / run identity; it is not the reply
        # completion signal in OpenClaw v2026.7.1-2.
        run.send_result = await client.send(
            run.message,
            session_key=run.session_key,
            run_id=run.run_id,
        )

        run.status = "waiting_for_run"
        run.wait_result = await client.call(
            "agent.wait",
            {
                "runId": run.run_id,
                "timeoutMs": client.config.timeout_ms,
            },
        )

        wait_failure = _wait_failure(run.wait_result)
        if wait_failure:
            raise OpenClawError(wait_failure)

        # agent.wait is the run-lifecycle boundary.  Once it returns a non-failure
        # terminal snapshot, allow a short persistence window for chat.history to
        # expose the assistant message that the UI should render.
        run.status = "waiting_for_reply"
        response, _history = await wait_for_new_assistant_message(
            client,
            session_key=run.session_key,
            baseline_count=run.baseline_assistant_count,
            timeout_seconds=20.0,
            poll_seconds=0.5,
        )

        if not response:
            status = _wait_status(run.wait_result) or "terminal"
            raise OpenClawError(
                "agent.wait finished the run "
                f"with status {status!r}, but no new assistant message became "
                f"visible in chat.history for session {run.session_key!r} within 20s."
            )

        run.response = response
        run.status = "complete"
    except Exception as exc:  # surfaced to the browser, never hidden
        run.error = str(exc)
        run.status = "error"


def _scan_new_events(run: LiveRun) -> None:
    if run.scan_cursor is None:
        return
    batch, next_cursor = trace_log.read_from(run.scan_cursor)
    if batch:
        run.raw_events.extend(batch)
    run.scan_cursor = next_cursor


def _correlated(run: LiveRun) -> list[dict[str, Any]]:
    return correlate_events(
        run.raw_events,
        run_id=run.run_id,
        session_key=run.session_key,
    )


@app.post("/api/live/start")
async def start_live_run(request: RunRequest) -> dict[str, Any]:
    if not client.available:
        raise HTTPException(status_code=503, detail="OpenClaw CLI was not found.")

    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message must not be empty")

    # A generated dashboard SessionKey is new, so there can be no earlier
    # assistant response to baseline. Explicit/fixed sessions retain the existing
    # preflight history count so response detection stays correct on reused chats.
    existing_session_key = request.sessionKey or client.config.fixed_session_key
    if existing_session_key:
        session_key = existing_session_key
        try:
            history = await client.history(session_key)
            baseline = len(assistant_messages(history))
        except OpenClawError:
            baseline = 0
    else:
        session_key = client.config.make_session_key()
        baseline = 0

    run_id = str(uuid.uuid4())

    # Start the trace cursor immediately before chat.send so no request-stage
    # TraceClaw evidence is lost.
    cursor = trace_log.cursor()
    live_id = uuid.uuid4().hex
    run = LiveRun(
        id=live_id,
        message=message,
        session_key=session_key,
        run_id=run_id,
        baseline_assistant_count=baseline,
        cursor=cursor,
        scan_cursor=cursor,
    )

    async with _RUNS_LOCK:
        _RUNS[live_id] = run

    run.task = asyncio.create_task(_execute(run))

    return {
        "liveRunId": live_id,
        "runId": run_id,
        "sessionKey": session_key,
        "status": run.status,
        "historyPreflight": bool(existing_session_key),
    }


@app.get("/api/live/{live_run_id}")
async def poll_live_run(live_run_id: str) -> dict[str, Any]:
    run = _RUNS.get(live_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="live run not found")

    _scan_new_events(run)
    events = _correlated(run)
    trace = _build_trace(
        message=run.message,
        session_key=run.session_key,
        run_id=run.run_id,
        events=events,
        response=run.response,
        send_result=run.send_result,
    )

    compact_wait = _compact_wait_result(run.wait_result)
    return {
        "status": run.status,
        "error": run.error,
        "response": run.response or "",
        "trace": trace,
        "complete": run.status in {"complete", "error"},
        "elapsedSeconds": round(time.monotonic() - run.started_at, 3),
        "sendReturned": run.send_result is not None,
        "agentWaitObserved": run.wait_result is not None,
        "agentWaitStatus": _wait_status(run.wait_result) or None,
        "agentWait": compact_wait,
        "assistantResponseObserved": bool(run.response),
        "sessionKey": run.session_key,
        "runId": run.run_id,
    }
