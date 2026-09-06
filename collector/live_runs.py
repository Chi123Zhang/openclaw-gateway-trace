"""Incremental live-run API for the Gateway trace viewer.

The browser starts a real ``chat.send`` request and polls TraceClaw while the
Gateway runs it. OpenClaw's ``chat.send`` RPC is ACK-oriented: the RPC can
return before reply dispatch / Agent Runtime has finished. Completion is
therefore tracked with the source-native ``agent.wait`` RPC, and ``chat.history``
is used only after the run is terminal to retrieve the final assistant text.

Completed (and failed) live runs are also persisted as JSON under
``collector/runs`` so restarting the collector does not erase run history.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from openclaw_client import OpenClawError, assistant_messages, wait_for_new_assistant_message
from server import RunRequest, _build_trace, app, client, trace_log
from trace_parser import TraceCursor, correlate_events, is_agent_runtime_event


_RUN_ARCHIVE_DIR = Path(
    os.environ.get(
        "TRACECLAW_RUN_ARCHIVE_DIR",
        str(Path(__file__).resolve().parent / "runs"),
    )
).expanduser()


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
    started_at_iso: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    raw_events: list[dict[str, Any]] = field(default_factory=list)
    send_result: Any = None
    wait_result: Any = None
    response: str | None = None
    status: str = "starting"
    error: str | None = None
    task: asyncio.Task[Any] | None = None
    archive_id: str | None = None
    archive_path: str | None = None
    archive_error: str | None = None


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

        # agent.wait is the run-lifecycle boundary. Once it returns a non-failure
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
    finally:
        # Persistence is server-side, not browser-driven. Even if the page closes
        # before the final poll, a terminal run is still archived. Give the trace
        # writer a brief flush window, then capture the final correlated evidence.
        try:
            # Allow the JSONL writer to flush the terminal agent lifecycle and
            # reply_resolver_returned records before archiving the run.
            await asyncio.sleep(0.25)
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
            _persist_run(run, trace=trace, events=events)
        except Exception as archive_exc:
            if not run.archive_error:
                run.archive_error = str(archive_exc)


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


def _archive_payload(run: LiveRun, *, trace: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Build one self-contained, human-inspectable saved-run record."""
    return {
        "schemaVersion": "traceclaw.saved-run.v2",
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "startedAt": run.started_at_iso,
        "liveRunId": run.id,
        "runId": run.run_id,
        "sessionKey": run.session_key,
        "prompt": run.message,
        "status": run.status,
        "error": run.error,
        "response": run.response or "",
        "sendResult": run.send_result,
        "agentWait": _compact_wait_result(run.wait_result),
        "assistantResponseObserved": bool(run.response),
        "trace": trace,
        # Keep all correlated evidence for later source/runtime audits.
        "runtimeEvents": events,
        "agentRuntimeEvents": [
            event for event in events if is_agent_runtime_event(event)
        ],
    }


def _persist_run(run: LiveRun, *, trace: dict[str, Any], events: list[dict[str, Any]]) -> None:
    """Atomically persist one terminal run. Repeated polls do not duplicate it."""
    if run.archive_id or run.archive_error:
        return

    try:
        _RUN_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        archive_id = f"{stamp}_{run.run_id}"
        final_path = _RUN_ARCHIVE_DIR / f"{archive_id}.json"
        temp_path = _RUN_ARCHIVE_DIR / f".{archive_id}.json.tmp"
        payload = _archive_payload(run, trace=trace, events=events)
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        temp_path.replace(final_path)
        run.archive_id = archive_id
        run.archive_path = str(final_path)
    except Exception as exc:
        run.archive_error = str(exc)


def _archive_file(archive_id: str) -> Path:
    if not archive_id or Path(archive_id).name != archive_id:
        raise HTTPException(status_code=400, detail="invalid archive id")
    path = _RUN_ARCHIVE_DIR / f"{archive_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="saved run not found")
    return path


def _read_archive(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"could not read saved run: {exc}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="saved run has invalid format")
    return payload


def _archive_summary(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    response = str(payload.get("response") or "").strip().replace("\n", " ")
    return {
        "id": path.stem,
        "savedAt": payload.get("savedAt"),
        "startedAt": payload.get("startedAt"),
        "prompt": payload.get("prompt") or "",
        "status": payload.get("status") or "",
        "runId": payload.get("runId") or "",
        "sessionKey": payload.get("sessionKey") or "",
        "responsePreview": response[:160],
        "assistantResponseObserved": bool(payload.get("assistantResponseObserved")),
    }


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

    # Do not archive from the polling request. _execute() owns terminal
    # persistence after its JSONL flush window, so a fast browser poll cannot race
    # the final Agent lifecycle / reply_resolver_returned records and freeze an
    # incomplete saved run.
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
        "archiveId": run.archive_id,
        "archiveSaved": bool(run.archive_id),
        "archiveError": run.archive_error,
    }


@app.get("/api/runs")
async def list_saved_runs(limit: int = 30) -> dict[str, Any]:
    """List recent persisted runs without loading every full trace into the UI."""
    safe_limit = max(1, min(int(limit), 100))
    if not _RUN_ARCHIVE_DIR.exists():
        return {"runs": [], "archiveDir": str(_RUN_ARCHIVE_DIR)}

    items: list[dict[str, Any]] = []
    paths = sorted(
        _RUN_ARCHIVE_DIR.glob("*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in paths:
        summary = _archive_summary(path)
        if summary is not None:
            items.append(summary)
        if len(items) >= safe_limit:
            break
    return {"runs": items, "archiveDir": str(_RUN_ARCHIVE_DIR)}


@app.get("/api/runs/{archive_id}")
async def get_saved_run(archive_id: str) -> dict[str, Any]:
    """Return one full persisted run, including trace, events, and final reply."""
    return _read_archive(_archive_file(archive_id))
