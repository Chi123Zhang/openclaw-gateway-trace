"""Read TraceClaw Gateway JSONL events and normalize G0-G18 observations."""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


VALID_STAGES = {f"G{i}" for i in range(19)}
AUX_STAGES = {"D1", "D2"}
TRACE_STAGES = VALID_STAGES | AUX_STAGES


@dataclass(frozen=True)
class TraceCursor:
    path: Path
    offset: int


class TraceLog:
    def __init__(self, path: str | None = None) -> None:
        configured = (
            path
            or os.getenv("TRACECLAW_LOG_PATH")
            or os.getenv("TRACECLAW_GATEWAY_TRACE_FILE")
        )
        self.path = Path(configured).expanduser() if configured else None

    @property
    def configured(self) -> bool:
        return self.path is not None

    @property
    def exists(self) -> bool:
        return bool(self.path and self.path.exists())

    def cursor(self) -> TraceCursor | None:
        if not self.path:
            return None
        offset = self.path.stat().st_size if self.path.exists() else 0
        return TraceCursor(self.path, offset)

    @staticmethod
    def _read_from(cursor: TraceCursor) -> tuple[list[dict[str, Any]], int]:
        if not cursor.path.exists():
            return [], cursor.offset
        events: list[dict[str, Any]] = []
        with cursor.path.open("r", encoding="utf-8", errors="replace") as fh:
            fh.seek(cursor.offset)
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict) and item.get("stage") in TRACE_STAGES:
                    events.append(item)
            return events, fh.tell()

    async def collect(
        self,
        cursor: TraceCursor | None,
        *,
        run_id: str,
        session_key: str,
        timeout_seconds: float = 8.0,
        settle_seconds: float = 0.7,
    ) -> list[dict[str, Any]]:
        if cursor is None:
            return []

        deadline = time.monotonic() + timeout_seconds
        offset = cursor.offset
        all_events: list[dict[str, Any]] = []
        last_growth = time.monotonic()
        seen_request_stage = False
        seen_g18 = False

        while time.monotonic() < deadline:
            batch, offset = self._read_from(TraceCursor(cursor.path, offset))
            if batch:
                last_growth = time.monotonic()
                all_events.extend(batch)

            relevant = correlate_events(all_events, run_id=run_id, session_key=session_key)
            seen_request_stage = any(
                event.get("stage") in VALID_STAGES - {"G0", "G1", "G2", "G3"}
                for event in relevant
            )
            seen_g18 = any(event.get("stage") == "G18" for event in relevant)

            if seen_g18 and time.monotonic() - last_growth >= settle_seconds:
                break
            if seen_request_stage and time.monotonic() - last_growth >= 2.0:
                break

            await asyncio.sleep(0.15)

        return correlate_events(all_events, run_id=run_id, session_key=session_key)


def correlate_events(
    events: list[dict[str, Any]],
    *,
    run_id: str,
    session_key: str,
) -> list[dict[str, Any]]:
    """Correlate one chat.send request without inventing missing identifiers.

    G4+ can be matched by runId/sessionKey. G3 method authorization and G0-G2
    connection events do not necessarily carry those identifiers, so attach only
    the nearest pre-request G0-G3 chain before the first exact request match.
    D1/D2 carry runId and are kept as auxiliary timing events.
    """

    matched_request: list[dict[str, Any]] = []
    request_positions: list[int] = []

    for idx, event in enumerate(events):
        stage = event.get("stage")
        if stage in {"G0", "G1", "G2", "G3"}:
            continue
        if event.get("runId") == run_id or event.get("sessionKey") == session_key:
            matched_request.append(event)
            request_positions.append(idx)

    if not request_positions:
        return []

    first_request_pos = min(request_positions)
    prelude: list[dict[str, Any]] = []
    seen: set[str] = set()
    wanted = {"G0", "G1", "G2", "G3"}

    for event in reversed(events[:first_request_pos]):
        stage = event.get("stage")
        if stage in wanted and stage not in seen:
            prelude.append(event)
            seen.add(str(stage))
        if seen == wanted:
            break
    prelude.reverse()

    return prelude + matched_request


def latest_event_by_stage(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for event in events:
        stage = event.get("stage")
        if stage in VALID_STAGES:
            result[str(stage)] = event
    return result


def latest_aux_event(events: list[dict[str, Any]], stage: str) -> dict[str, Any] | None:
    found: dict[str, Any] | None = None
    for event in events:
        if event.get("stage") == stage:
            found = event
    return found


def display_event(event: dict[str, Any]) -> str:
    fields = []
    for key, value in event.items():
        if key in {"schema", "ts", "stage", "event"}:
            continue
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        else:
            rendered = str(value)
        fields.append(f"{key} = {rendered}")
    return "\n".join(fields) or f"event = {event.get('event', 'observed')}"


def event_result(stage: str, event: dict[str, Any]) -> str:
    result = event.get("result")
    if result not in (None, ""):
        return str(result)

    if stage == "G9" and event.get("agentId"):
        return str(event["agentId"])
    if stage == "G17":
        left = event.get("agentId")
        right = event.get("downstreamAgentId")
        if left and right:
            return f"{left} → {right}"
    if stage == "G18" and event.get("resolverSource"):
        return "selected"

    name = event.get("event")
    return str(name) if name else "observed"
