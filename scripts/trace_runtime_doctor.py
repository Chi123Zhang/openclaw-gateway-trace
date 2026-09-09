#!/usr/bin/env python3
"""Diagnose whether the running macOS Gateway can emit TraceClaw events.

This checks three independent layers:
1. the local v2026.7.1-2 source checkout;
2. its built dist output;
3. the installed ai.openclaw.gateway LaunchAgent command.

It never modifies OpenClaw.
"""

from __future__ import annotations

import argparse
import json
import os
import plistlib
from pathlib import Path
from typing import Iterable


DEFAULT_OPENCLAW_ROOT = Path("/Users/mac/Desktop/openclaw-source-2026.7.1-2")
DEFAULT_TRACE = Path("/Users/mac/Desktop/traceclaw-cake3-gateway.jsonl")
PLIST = Path.home() / "Library/LaunchAgents/ai.openclaw.gateway.plist"

CORE_MARKER = "traceclaw.gateway.runtime.v1"
AGENT_MARKER = "traceclaw.agent.runtime.v1"
EMBEDDED_FINAL_REPLY_MARKER = "replyTextSource: traceClawFinalReplySource"

AGENT_RUNTIME_EVENT_MARKERS = (
    "agent_runtime_selected",
    "agent_run_started",
    "tool_started",
    "tool_result",
    "agent_reply_finalized",
    "agent_run_ended",
    "reply_resolver_returned",
)

GATEWAY_STAGE_EVENT_MARKERS = {
    "G0": "connection_auth_state_resolved",
    "G1": "shared_credential_authorized",
    "G2": "connection_authentication_completed",
    "G3": "gateway_method_authorized",
    "G4": "chat_send_request_validated",
    "G5": "chat_message_normalized",
    "G6": "requested_agent_resolved",
    "G7": "session_resolved",
    "G8": "agent_session_validated",
    "G9": "effective_agent_resolved",
    "G10": "session_send_policy_evaluated",
    "G11": "run_idempotency_guard_passed",
    "G12": "work_admission_completed",
    "G13": "runtime_context_constructed",
    "G14": "dispatch_inbound_entered",
    "G15": "inbound_context_finalized",
    "G16": "reply_dispatch_orchestration_entered",
    "G17": "effective_agent_reresolved",
    "G18": "reply_resolver_selected",
}


def contains(root: Path, marker: str, suffixes: tuple[str, ...]) -> list[Path]:
    hits: list[Path] = []
    if not root.exists():
        return hits
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        try:
            if marker in path.read_text(encoding="utf-8", errors="ignore"):
                hits.append(path)
        except OSError:
            continue
        if len(hits) >= 8:
            break
    return hits


def unwrap_program_arguments(args: list[str]) -> list[str]:
    # OpenClaw v2026.7.1-2 can install a generated /bin/sh env wrapper:
    # /bin/sh <wrapper> <env-file> node <dist-entry> gateway --port ...
    if len(args) >= 5 and args[0] == "/bin/sh" and "service-env" in args[1]:
        return args[3:]
    if len(args) >= 4 and "service-env" in args[0]:
        return args[2:]
    return args


def load_plist_args() -> tuple[list[str], dict[str, str]]:
    if not PLIST.exists():
        return [], {}
    with PLIST.open("rb") as fh:
        obj = plistlib.load(fh)
    args = obj.get("ProgramArguments") if isinstance(obj, dict) else None
    env = obj.get("EnvironmentVariables") if isinstance(obj, dict) else None
    return (
        [str(x) for x in args] if isinstance(args, list) else [],
        {str(k): str(v) for k, v in env.items()} if isinstance(env, dict) else {},
    )


def count_jsonl(path: Path) -> dict[str, int]:
    counts = {"gateway": 0, "agent": 0, "other": 0}
    if not path.exists():
        return counts
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    item = json.loads(line)
                except Exception:
                    continue
                if item.get("schema") == CORE_MARKER:
                    counts["gateway"] += 1
                elif item.get("schema") == AGENT_MARKER:
                    counts["agent"] += 1
                else:
                    counts["other"] += 1
    except OSError:
        pass
    return counts


def tree_contains(root: Path, marker: str, suffixes: tuple[str, ...]) -> bool:
    return bool(contains(root, marker, suffixes))


def stage_marker_status(root: Path, suffixes: tuple[str, ...]) -> tuple[list[str], list[str]]:
    present: list[str] = []
    missing: list[str] = []
    for stage, marker in GATEWAY_STAGE_EVENT_MARKERS.items():
        (present if tree_contains(root, marker, suffixes) else missing).append(stage)
    return present, missing


def agent_marker_status(root: Path, suffixes: tuple[str, ...]) -> tuple[list[str], list[str]]:
    present: list[str] = []
    missing: list[str] = []
    for marker in AGENT_RUNTIME_EVENT_MARKERS:
        (present if tree_contains(root, marker, suffixes) else missing).append(marker)
    return present, missing


def embedded_final_reply_placement_status(root: Path) -> tuple[bool, bool, bool]:
    execution = root / "src/auto-reply/reply/agent-runner-execution.ts"
    messages = root / "src/agents/embedded-agent-subscribe.handlers.messages.ts"
    execution_has_new = False
    messages_has_legacy = False
    if execution.exists():
        execution_has_new = EMBEDDED_FINAL_REPLY_MARKER in execution.read_text(
            encoding="utf-8", errors="ignore"
        )
    if messages.exists():
        messages_has_legacy = 'event: "agent_reply_finalized"' in messages.read_text(
            encoding="utf-8", errors="ignore"
        )
    return execution_has_new and not messages_has_legacy, execution_has_new, messages_has_legacy


def g6_chat_send_placement_status(root: Path) -> tuple[bool, int, int]:
    """Return (inside_chat_send, inside_count, outside_count) for the G6 marker."""
    path = root / "src/gateway/server-methods/chat.ts"
    if not path.exists():
        return False, 0, 0
    text = path.read_text(encoding="utf-8", errors="ignore")
    marker = 'event: "requested_agent_resolved"'
    start = text.find('"chat.send": async')
    end = text.find('"chat.inject": async', start + 1) if start >= 0 else -1
    if start < 0 or end < 0:
        return False, 0, text.count(marker)
    inside = text[start:end].count(marker)
    outside = text[:start].count(marker) + text[end:].count(marker)
    return inside == 1 and outside == 0, inside, outside


def g6_dist_placement_status(root: Path) -> tuple[bool, int]:
    """Built output cannot preserve handler slices reliably; require one G6 marker."""
    count = 0
    if root.exists():
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in (".js", ".mjs", ".cjs"):
                continue
            try:
                count += path.read_text(encoding="utf-8", errors="ignore").count(
                    'requested_agent_resolved'
                )
            except OSError:
                continue
    return count >= 1, count


def fmt_hits(hits: Iterable[Path], root: Path) -> str:
    items = []
    for path in hits:
        try:
            items.append(str(path.relative_to(root)))
        except ValueError:
            items.append(str(path))
    return ", ".join(items) if items else "NONE"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_OPENCLAW_ROOT)
    parser.add_argument("--trace", type=Path, default=DEFAULT_TRACE)
    args = parser.parse_args()

    root = args.root.expanduser().resolve()
    trace = args.trace.expanduser().resolve()

    source_hits_core = contains(root / "src", CORE_MARKER, (".ts", ".js", ".mjs"))
    source_hits_agent = contains(root / "src", AGENT_MARKER, (".ts", ".js", ".mjs"))
    dist_hits_core = contains(root / "dist", CORE_MARKER, (".js", ".mjs", ".cjs"))
    dist_hits_agent = contains(root / "dist", AGENT_MARKER, (".js", ".mjs", ".cjs"))
    source_stage_present, source_stage_missing = stage_marker_status(
        root / "src", (".ts", ".js", ".mjs")
    )
    dist_stage_present, dist_stage_missing = stage_marker_status(
        root / "dist", (".js", ".mjs", ".cjs")
    )
    source_agent_present, source_agent_missing = agent_marker_status(
        root / "src", (".ts", ".js", ".mjs")
    )
    dist_agent_present, dist_agent_missing = agent_marker_status(
        root / "dist", (".js", ".mjs", ".cjs")
    )
    embedded_final_source_ok, embedded_final_in_execution, legacy_final_in_messages = (
        embedded_final_reply_placement_status(root)
    )
    embedded_final_dist_ok = tree_contains(
        root / "dist", "replyTextSource", (".js", ".mjs", ".cjs")
    )
    g6_source_ok, g6_source_inside_count, g6_source_outside_count = g6_chat_send_placement_status(root)
    g6_dist_ok, g6_dist_count = g6_dist_placement_status(root / "dist")

    raw_args, plist_env = load_plist_args()
    effective_args = unwrap_program_arguments(raw_args)
    local_root = str(root)
    launch_uses_local = any(local_root in arg for arg in effective_args)

    counts = count_jsonl(trace)

    print("TraceClaw runtime doctor")
    print("=" * 72)
    print("OpenClaw root:", root)
    print("Trace file   :", trace)
    print()
    print("[source]")
    print("Gateway schema marker:", "YES" if source_hits_core else "NO")
    print("  ", fmt_hits(source_hits_core, root))
    print(
        "G0-G18 stage markers:",
        f"{len(source_stage_present)}/19",
        "missing=" + (",".join(source_stage_missing) if source_stage_missing else "none"),
    )
    print(
        "G6 placement   :",
        "chat.send ONLY" if g6_source_ok else "BAD",
        f"(inside={g6_source_inside_count}, outside={g6_source_outside_count})",
    )
    print("Agent marker  :", "YES" if source_hits_agent else "NO")
    print("  ", fmt_hits(source_hits_agent, root))
    print(
        "Agent events  :",
        f"{len(source_agent_present)}/{len(AGENT_RUNTIME_EVENT_MARKERS)}",
        "missing=" + (",".join(source_agent_missing) if source_agent_missing else "none"),
    )
    print(
        "Embedded final:",
        "WINNER RESULT" if embedded_final_source_ok else "BAD",
        f"(execution={embedded_final_in_execution}, legacy_message_handler={legacy_final_in_messages})",
    )
    print()
    print("[built dist]")
    print("Gateway schema marker:", "YES" if dist_hits_core else "NO")
    print("  ", fmt_hits(dist_hits_core, root))
    print(
        "G0-G18 stage markers:",
        f"{len(dist_stage_present)}/19",
        "missing=" + (",".join(dist_stage_missing) if dist_stage_missing else "none"),
    )
    print("G6 built marker:", "YES" if g6_dist_ok else "NO", f"(count={g6_dist_count})")
    print("Agent marker  :", "YES" if dist_hits_agent else "NO")
    print("  ", fmt_hits(dist_hits_agent, root))
    print(
        "Agent events  :",
        f"{len(dist_agent_present)}/{len(AGENT_RUNTIME_EVENT_MARKERS)}",
        "missing=" + (",".join(dist_agent_missing) if dist_agent_missing else "none"),
    )
    print("Embedded final:", "YES" if embedded_final_dist_ok else "NO", "(replyTextSource marker)")
    print()
    print("[LaunchAgent]")
    print("plist        :", PLIST if PLIST.exists() else "NOT INSTALLED")
    print("raw command  :", " ".join(raw_args) if raw_args else "NOT FOUND")
    print("effective cmd:", " ".join(effective_args) if effective_args else "NOT FOUND")
    print("uses local instrumented checkout:", "YES" if launch_uses_local else "NO")
    if plist_env:
        print("plist TRACECLAW_LOG_PATH:", plist_env.get("TRACECLAW_LOG_PATH", "not inline"))
    print()
    print("[trace JSONL]")
    print("gateway events:", counts["gateway"])
    print("agent events  :", counts["agent"])
    print("other records :", counts["other"])
    print()

    problems: list[str] = []
    if not source_hits_core:
        problems.append("local src does not contain the Gateway TraceClaw schema helper")
    if source_stage_missing:
        problems.append(
            "local src is missing Gateway stage instrumentation: " + ", ".join(source_stage_missing)
        )
    if not g6_source_ok:
        problems.append(
            "G6 requested_agent_resolved is not uniquely placed inside chat.send "
            f"(inside={g6_source_inside_count}, outside={g6_source_outside_count})"
        )
    if not source_hits_agent:
        problems.append("local src does not contain post-G18 Agent Runtime instrumentation")
    if source_agent_missing:
        problems.append(
            "local src is missing Agent Runtime event markers: " + ", ".join(source_agent_missing)
        )
    if not embedded_final_source_ok:
        problems.append(
            "embedded final-reply hook is not exclusively at the winning run-result boundary "
            f"(execution={embedded_final_in_execution}, legacy_message_handler={legacy_final_in_messages})"
        )
    if source_hits_core and not dist_hits_core:
        problems.append("Gateway source helper is patched but dist was not rebuilt from it")
    if dist_stage_missing:
        problems.append(
            "built dist is missing Gateway stage instrumentation: " + ", ".join(dist_stage_missing)
        )
    if not g6_dist_ok:
        problems.append("built dist is missing requested_agent_resolved")
    if source_hits_agent and not dist_hits_agent:
        problems.append("Agent Runtime source is patched but dist was not rebuilt from it")
    if dist_agent_missing:
        problems.append(
            "built dist is missing Agent Runtime event markers: " + ", ".join(dist_agent_missing)
        )
    if embedded_final_source_ok and not embedded_final_dist_ok:
        problems.append(
            "embedded final-reply winner-result hook is patched in source but missing from dist"
        )
    if raw_args and not launch_uses_local:
        problems.append(
            "LaunchAgent points to a different OpenClaw install; local pnpm build cannot affect the running Gateway"
        )

    if problems:
        print("DIAGNOSIS: NOT READY")
        for item in problems:
            print(" -", item)
        return 2

    print("DIAGNOSIS: local source, built dist, and LaunchAgent are aligned.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
