"""Incremental live-run API for the Gateway trace viewer.

The existing /api/run endpoint returns only after the request is complete.  This
module adds a two-phase API so the browser can clear stale results immediately,
start the real chat.send call, and then poll TraceClaw while the Gateway is still
executing the request.
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
    response: str | None = None
    status: str = "starting"
    error: str | None = None
    task: asyncio.Task[Any] | None = None


_RUNS: dict[str, LiveRun] = {}
_RUNS_LOCK = asyncio.Lock()


async def _execute(run: LiveRun) -> None:
    try:
        run.status = "sending"
        run.send_result = await client.send(
            run.message,
            session_key=run.session_key,
            run_id=run.run_id,
        )
        run.status = "waiting_for_reply"

        elapsed = time.monotonic() - run.started_at
        remaining = max(2.0, (client.config.timeout_ms / 1000) - elapsed)
        response, _history = await wait_for_new_assistant_message(
            client,
            session_key=run.session_key,
            baseline_count=run.baseline_assistant_count,
            timeout_seconds=remaining,
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

    session_key = request.sessionKey or client.config.make_session_key()
    run_id = str(uuid.uuid4())

    try:
        history = await client.history(session_key)
        baseline = len(assistant_messages(history))
    except OpenClawError:
        baseline = 0

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

    return {
        "status": run.status,
        "error": run.error,
        "response": run.response or "",
        "trace": trace,
        "complete": run.status in {"complete", "error"},
    }
