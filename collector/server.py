"""Local OpenClaw + TraceClaw collector.

This service is meant to run on the same machine as OpenClaw. The public
GitHub Pages frontend can talk to it over localhost, so Gateway credentials
never need to be placed in the static site.

Flow:
  POST /api/run
    -> `openclaw gateway call chat.send`
    -> optional TraceClaw JSONL collection
    -> `chat.history` polling for the new assistant reply
    -> normalized trace payload for the existing G0-G18 UI
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from openclaw_client import (
    OpenClawClient,
    OpenClawError,
    assistant_messages,
    wait_for_new_assistant_message,
)
from trace_parser import TraceLog, display_event, event_result, latest_event_by_stage


app = FastAPI(title="OpenClaw Gateway Trace Collector", version="0.3.2")

origins = [
    "https://chi123zhang.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

extra_origin = os.getenv("TRACE_VIEWER_ORIGIN")
if extra_origin:
    origins.append(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

client = OpenClawClient()
trace_log = TraceLog()


class RunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    sessionKey: str | None = Field(default=None, max_length=2_000)


def _tone(result: str) -> str:
    lowered = result.lower()
    if any(word in lowered for word in ("deny", "not_authorized", "blocked", "error", "failed")):
        return "warn"
    return "good"


def _known_input(stage: str, *, message: str, session_key: str, run_id: str) -> str:
    n = int(stage[1:])
    lines: list[str] = []
    if n >= 4:
        lines.append(f"message = {message!r}")
        lines.append(f"sessionKey = {session_key}")
    if n >= 11:
        lines.append(f"runId = {run_id}")
    if not lines:
        return "No request-specific input field was captured for this stage."
    return "\n".join(lines)


def _render_event_fields(event: dict[str, Any], keys: tuple[str, ...]) -> str:
    lines: list[str] = []
    for key in keys:
        value = event.get(key)
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        else:
            rendered = str(value)
        lines.append(f"{key} = {rendered}")
    return "\n".join(lines)


def _default_stage(
    stage: str,
    *,
    message: str,
    session_key: str,
    run_id: str,
) -> dict[str, Any]:
    return {
        "result": "not separately observed",
        "evidence": ["source"],
        "tone": "good",
        "case2": "No standalone runtime event was captured for this stage in this run.",
        "time": "not separately observed",
        "tokens": "not observed",
        "risk": "No runtime risk decision is asserted without an observed event.",
        "concreteInput": _known_input(
            stage,
            message=message,
            session_key=session_key,
            run_id=run_id,
        ),
        "concreteOutput": "not separately observed",
        "concreteInputEvidence": "REQUEST + SOURCE-DERIVED",
        "concreteOutputEvidence": "SOURCE / OBSERVATION LIMIT",
    }


def _event_stage(
    stage: str,
    event: dict[str, Any],
    *,
    message: str,
    session_key: str,
    run_id: str,
) -> dict[str, Any]:
    result = event_result(stage, event)
    timestamp = event.get("ts")

    concrete_input = _known_input(
        stage,
        message=message,
        session_key=session_key,
        run_id=run_id,
    )
    concrete_output = display_event(event)
    input_evidence = "REQUEST + SOURCE-DERIVED"

    # G3 consumes authenticated connection identity and the current RPC method.
    # Keep those runtime inputs separate from the authorization decision.
    if stage == "G3":
        observed_input = _render_event_fields(event, ("method", "role", "scopes"))
        observed_output = _render_event_fields(event, ("result", "reason"))
        if observed_input:
            concrete_input = observed_input
            input_evidence = "RUNTIME"
        if observed_output:
            concrete_output = observed_output

    # G4 validates the existing chat.send request. method/run/session/message are
    # inputs already present before validation; G4 outputs only the validation
    # decision and observed validation flags.
    elif stage == "G4":
        method = event.get("method")
        input_lines = []
        if method is not None:
            input_lines.append(f"method = {method}")
        input_lines.extend(
            [
                f"sessionKey = {session_key}",
                f"message = {message!r}",
                "attachments = none",
                f"idempotencyKey / runId = {run_id}",
            ]
        )
        concrete_input = "\n".join(input_lines)
        input_evidence = "RUNTIME + REQUEST" if method is not None else "REQUEST"
        observed_output = _render_event_fields(
            event,
            ("result", "hasPrivilegedFields", "hasExplicitOrigin"),
        )
        if observed_output:
            concrete_output = observed_output

    # G5 sanitizes/classifies the message. SessionKey/runId remain in the same
    # handler scope, but they are not outputs of message sanitization.
    elif stage == "G5":
        concrete_input = f"message = {message!r}\nattachments = none"
        input_evidence = "REQUEST"
        observed_output = _render_event_fields(
            event,
            ("result", "messageLength", "messageChangedBySanitization"),
        )
        if observed_output:
            concrete_output = observed_output

    return {
        "result": result,
        "evidence": ["runtime", "source"],
        "tone": _tone(result),
        "case2": f"Observed runtime event: {event.get('event', 'event')}.",
        "time": f"event at {timestamp}" if timestamp else "runtime event observed",
        "tokens": "not observed",
        "risk": "Runtime event captured; no extra risk conclusion is added by the collector.",
        "concreteInput": concrete_input,
        "concreteOutput": concrete_output,
        "concreteInputEvidence": input_evidence,
        "concreteOutputEvidence": "RUNTIME",
    }


def _event_bad(event: dict[str, Any]) -> bool:
    text = " ".join(
        str(event.get(key, ""))
        for key in ("result", "reason", "event")
    ).lower()
    return any(word in text for word in ("deny", "not_authorized", "blocked", "error", "failed"))


def _state_by_stage(
    meta: dict[str, Any],
    by_stage: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}

    for idx in range(19):
        stage = f"G{idx}"

        if idx == 0 and "G0" in by_stage:
            current = event_result("G0", by_stage["G0"])
            auth = {"label": "PASS" if _tone(current) == "good" else "FALLBACK", "tone": "good" if _tone(current) == "good" else "warn"}
        elif idx == 1 and "G1" in by_stage:
            current = event_result("G1", by_stage["G1"])
            auth = {"label": "PASS" if _tone(current) == "good" else "FALLBACK", "tone": "good" if _tone(current) == "good" else "warn"}
        elif idx >= 2 and "G2" in by_stage:
            auth = {"label": "PASS", "tone": "good"}
        else:
            auth = {"label": "—", "tone": "neutral"}

        if idx < 10:
            policy = {"label": "—", "tone": "neutral"}
        elif "G10" in by_stage:
            policy_value = str(meta.get("sendPolicy") or event_result("G10", by_stage["G10"]))
            policy = {"label": policy_value, "tone": "warn" if _tone(policy_value) == "warn" else "good"}
        else:
            policy = {"label": "—", "tone": "neutral"}

        if idx < 11:
            runtime = {"label": "—", "tone": "neutral"}
        elif idx == 11 and "G11" in by_stage:
            decision = str(meta.get("dedupeDecision") or by_stage["G11"].get("dedupeDecision") or "observed")
            runtime = {"label": decision.replace("_", " ").upper(), "tone": "info"}
        elif idx >= 12 and "G12" in by_stage:
            decision = str(meta.get("admissionDecision") or by_stage["G12"].get("admissionDecision") or "observed")
            runtime = {"label": decision.replace("_", " ").upper(), "tone": "good"}
        else:
            runtime = {"label": "—", "tone": "neutral"}

        if idx < 6:
            routing = {"label": "—", "tone": "neutral"}
        elif idx < 9:
            routing = {"label": "RESOLVING", "tone": "info"} if any(
                f"G{i}" in by_stage for i in range(6, idx + 1)
            ) else {"label": "—", "tone": "neutral"}
        elif idx >= 17 and "G17" in by_stage:
            routing = {"label": str(meta.get("downstreamAgent") or meta.get("agent") or "observed"), "tone": "good"}
        elif "G9" in by_stage:
            routing = {"label": str(meta.get("agent") or "observed"), "tone": "good"}
        else:
            routing = {"label": "—", "tone": "neutral"}

        bad_seen = any(
            _event_bad(event)
            for key, event in by_stage.items()
            if key.startswith("G") and key[1:].isdigit() and int(key[1:]) <= idx
        )
        overall = {"label": "ALERT" if bad_seen else "NO ALERT", "tone": "warn" if bad_seen else "good"}

        result[stage] = {
            "authentication": auth,
            "policy": policy,
            "runtime": runtime,
            "routing": routing,
            "overall": overall,
        }
    return result


def _timeline(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    for event in events:
        stage = event.get("stage")
        if not isinstance(stage, str) or not stage.startswith("G"):
            continue
        item = {
            "stage": stage,
            "event": event.get("event") or "observed",
            "ts": event.get("ts"),
        }
        if event.get("result") is not None:
            item["result"] = event.get("result")
        timeline.append(item)
    return timeline


def _build_trace(
    *,
    message: str,
    session_key: str,
    run_id: str,
    events: list[dict[str, Any]],
    response: str | None,
    send_result: Any,
) -> dict[str, Any]:
    by_stage = latest_event_by_stage(events)

    g7 = by_stage.get("G7", {})
    g8 = by_stage.get("G8", {})
    g9 = by_stage.get("G9", {})
    g10 = by_stage.get("G10", {})
    g11 = by_stage.get("G11", {})
    g12 = by_stage.get("G12", {})
    g17 = by_stage.get("G17", {})
    g18 = by_stage.get("G18", {})

    agent = g9.get("agentId") or g17.get("agentId")
    downstream_agent = ""
    if g17.get("agentId") and g17.get("downstreamAgentId"):
        downstream_agent = f"{g17['agentId']} → {g17['downstreamAgentId']}"

    send_policy = g10.get("sendPolicy") or g10.get("result")
    dedupe_decision = g11.get("dedupeDecision")
    admission_decision = g12.get("admissionDecision")
    resolver_source = g18.get("resolverSource")
    resolver = "getReplyFromConfig" if resolver_source == "default_getReplyFromConfig" else g18.get("resolver")
    provider = g18.get("provider")
    model = g18.get("model")
    tools = g18.get("toolCount")

    canonical_session_key = g7.get("canonicalSessionKey") or session_key
    backing_session_id = g8.get("sessionId") or g8.get("backingSessionId") or ""

    meta = {
        "id": f"live-{run_id}",
        "title": message,
        "prompt": message,
        "response": response or "",
        "rawSessionKey": session_key,
        "canonicalSessionKey": canonical_session_key,
        "sessionId": backing_session_id,
        "runId": run_id,
        "agent": agent or "",
        "sendPolicy": send_policy or "",
        "dedupeDecision": dedupe_decision or "",
        "admissionDecision": admission_decision or "",
        "downstreamAgent": downstream_agent,
        "resolver": resolver or "",
        "resolverSource": resolver_source or "",
        "provider": provider or "",
        "model": model or "",
        "tools": str(tools) if tools is not None else "",
        "ack": "",
        "titleSync": "",
        "overallRisk": "ALERT" if any(_event_bad(event) for event in by_stage.values()) else "NO ALERT",
    }

    stages: dict[str, Any] = {}
    for idx in range(19):
        stage = f"G{idx}"
        event = by_stage.get(stage)
        stages[stage] = (
            _event_stage(
                stage,
                event,
                message=message,
                session_key=session_key,
                run_id=run_id,
            )
            if event
            else _default_stage(
                stage,
                message=message,
                session_key=session_key,
                run_id=run_id,
            )
        )

    stages["G11"]["concreteInput"] = f"runId = {run_id}\nSessionKey = {session_key}"

    observed = set(by_stage)
    return {
        "meta": meta,
        "stages": stages,
        "stateByStage": _state_by_stage(meta, by_stage),
        "_collector": {
            "traceEventCount": len(events),
            "traceStagesObserved": sorted(observed, key=lambda item: int(item[1:])),
            "timeline": _timeline(events),
            "sendResult": send_result,
            "traceLogConfigured": trace_log.configured,
        },
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    status: dict[str, Any] = {
        "status": "ok",
        "openclawCli": client.available,
        "traceLogConfigured": trace_log.configured,
        "traceLogExists": trace_log.exists,
        "traceLogPath": str(trace_log.path) if trace_log.path else None,
    }
    if client.available:
        try:
            await client.status()
            status["gateway"] = "reachable"
        except Exception as exc:
            status["gateway"] = "unreachable"
            status["gatewayError"] = str(exc)
    else:
        status["gateway"] = "unavailable"
    return status


@app.post("/api/run")
async def run_trace(request: RunRequest) -> dict[str, Any]:
    if not client.available:
        raise HTTPException(
            status_code=503,
            detail="OpenClaw CLI was not found. Install OpenClaw or set OPENCLAW_BIN.",
        )

    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message must not be empty")

    session_key = request.sessionKey or client.config.make_session_key()
    run_id = str(uuid.uuid4())

    try:
        baseline_history = await client.history(session_key)
        baseline_assistant_count = len(assistant_messages(baseline_history))
    except OpenClawError:
        baseline_assistant_count = 0

    cursor = trace_log.cursor()
    started = time.monotonic()

    try:
        send_result = await client.send(
            message,
            session_key=session_key,
            run_id=run_id,
        )
    except OpenClawError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    events = await trace_log.collect(
        cursor,
        run_id=run_id,
        session_key=session_key,
        timeout_seconds=float(os.getenv("TRACECLAW_WAIT_SECONDS", "8")),
    )

    elapsed = time.monotonic() - started
    remaining = max(2.0, (client.config.timeout_ms / 1000) - elapsed)

    try:
        response, _history = await wait_for_new_assistant_message(
            client,
            session_key=session_key,
            baseline_count=baseline_assistant_count,
            timeout_seconds=remaining,
        )
    except OpenClawError:
        response = None

    trace = _build_trace(
        message=message,
        session_key=session_key,
        run_id=run_id,
        events=events,
        response=response,
        send_result=send_result,
    )

    return {
        "response": response or "",
        "trace": trace,
    }
