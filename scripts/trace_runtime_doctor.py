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
    print("G0-G18 marker :", "YES" if source_hits_core else "NO")
    print("  ", fmt_hits(source_hits_core, root))
    print("Agent marker  :", "YES" if source_hits_agent else "NO")
    print("  ", fmt_hits(source_hits_agent, root))
    print()
    print("[built dist]")
    print("G0-G18 marker :", "YES" if dist_hits_core else "NO")
    print("  ", fmt_hits(dist_hits_core, root))
    print("Agent marker  :", "YES" if dist_hits_agent else "NO")
    print("  ", fmt_hits(dist_hits_agent, root))
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
        problems.append("local src does not contain the G0-G18 TraceClaw instrumentation marker")
    if not source_hits_agent:
        problems.append("local src does not contain post-G18 Agent Runtime instrumentation")
    if source_hits_core and not dist_hits_core:
        problems.append("G0-G18 source is patched but dist was not rebuilt from it")
    if source_hits_agent and not dist_hits_agent:
        problems.append("Agent Runtime source is patched but dist was not rebuilt from it")
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
