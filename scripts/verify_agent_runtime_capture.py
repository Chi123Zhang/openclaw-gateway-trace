#!/usr/bin/env python3
"""Verify that the newest saved run contains post-G18 Agent Runtime evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "collector" / "runs"


def newest_run() -> Path:
    candidates = [path for path in RUNS_DIR.glob("*.json") if path.is_file()]
    if not candidates:
        raise SystemExit(f"No saved runs found in {RUNS_DIR}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def yn(value: Any) -> str:
    return "YES" if bool(value) else "NO"


def shown(value: Any) -> str:
    if value in (None, "", [], {}):
        return "NOT CAPTURED"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, help="Saved run JSON; defaults to newest")
    args = parser.parse_args()

    path = args.run.expanduser().resolve() if args.run else newest_run()
    payload = json.loads(path.read_text(encoding="utf-8"))
    trace = payload.get("trace") if isinstance(payload, dict) else None
    runtime = trace.get("agentRuntime") if isinstance(trace, dict) else None
    if not isinstance(runtime, dict):
        raise SystemExit(
            "This run has no trace.agentRuntime object. Pull/restart the collector "
            "and run a fresh trace after applying the v2026.7.1-2 instrumentation."
        )

    print(f"Run: {path.name}")
    print(f"Agent Runtime observed: {yn(runtime.get('observed'))}")
    print()
    print("final Agent       :", shown(runtime.get("finalAgent")))
    print("resolver          :", shown(runtime.get("resolverSource") or runtime.get("resolver")))
    print("runner            :", shown(runtime.get("runner")))
    print("provider          :", shown(runtime.get("provider")))
    print("model             :", shown(runtime.get("model")))
    print("Agent run started :", yn(runtime.get("runStarted")))
    print("Agent run ended   :", yn(runtime.get("runEnded")))
    print("tool called       :", yn(runtime.get("toolCalled")))
    print("tool count        :", shown(runtime.get("toolCount")))
    print("return to G16     :", yn(runtime.get("returnToG16Observed")))
    print("final reply       :", shown(runtime.get("finalReply")))
    print("reply evidence    :", shown(runtime.get("finalReplyEvidence")))

    tools = runtime.get("tools")
    if isinstance(tools, list) and tools:
        print()
        print("Tools:")
        for index, tool in enumerate(tools, start=1):
            if not isinstance(tool, dict):
                print(f"  {index}. {shown(tool)}")
                continue
            print(
                f"  {index}. {shown(tool.get('name'))} "
                f"[{shown(tool.get('status') or ('started' if tool.get('started') else 'observed'))}]"
            )
            if "result" in tool:
                print("     result:", shown(tool.get("result")))
            elif tool.get("resultObserved"):
                print("     result: observed (no serialized result field)")
            else:
                print("     result: NOT CAPTURED")

    events = runtime.get("events")
    print()
    print("Agent Runtime event count:", len(events) if isinstance(events, list) else 0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
