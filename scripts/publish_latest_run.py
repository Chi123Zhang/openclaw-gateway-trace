#!/usr/bin/env python3
"""Publish the newest locally saved live run as a static GitHub Pages case.

Usage:
    python3 scripts/publish_latest_run.py
    python3 scripts/publish_latest_run.py --push
    python3 scripts/publish_latest_run.py --run collector/runs/<file>.json --push

The collector keeps live runs under collector/runs/. This script takes one saved
run, writes only its normalized trace snapshot to data/cases/latest-live.js, and
optionally commits/pushes that generated static case. The original local archive
remains untouched.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "collector" / "runs"
OUTPUT = REPO_ROOT / "data" / "cases" / "latest-live.js"
CASE_ID = "latest-live"


def newest_run() -> Path:
    candidates = [path for path in RUNS_DIR.glob("*.json") if path.is_file()]
    if not candidates:
        raise SystemExit(
            f"No saved live runs found in {RUNS_DIR}. Run a live trace first."
        )
    return max(candidates, key=lambda path: path.stat().st_mtime)


def load_archive(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Could not read {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"Saved run {path} is not a JSON object.")
    return payload


def normalized_trace(payload: dict[str, Any]) -> dict[str, Any]:
    trace = payload.get("trace")
    if not isinstance(trace, dict):
        raise SystemExit("Saved run has no normalized 'trace' object.")

    # Copy through JSON so publishing cannot mutate the loaded archive object.
    published = json.loads(json.dumps(trace, ensure_ascii=False))
    meta = published.setdefault("meta", {})
    if not isinstance(meta, dict):
        meta = {}
        published["meta"] = meta

    prompt = str(payload.get("prompt") or meta.get("prompt") or meta.get("title") or "Saved live run")
    response = str(payload.get("response") or meta.get("response") or "")
    saved_at = str(payload.get("savedAt") or "")

    meta["id"] = CASE_ID
    meta["title"] = prompt
    meta["prompt"] = prompt
    meta["response"] = response
    meta["publishedFromLiveRun"] = True
    meta["publishedAt"] = datetime.now(timezone.utc).isoformat()
    if saved_at:
        meta["savedAt"] = saved_at

    # Keep the exact run/session/source-aligned stage data already produced by the
    # collector. Do not synthesize missing runtime fields during publication.
    return published


def write_case(trace: dict[str, Any]) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(trace, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        "window.GATEWAY_CASES=window.GATEWAY_CASES||{};\n"
        f"window.GATEWAY_CASES[{json.dumps(CASE_ID)}]={encoded};\n",
        encoding="utf-8",
    )


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=check,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def push_case(prompt: str) -> None:
    # Only stage the generated public case. Local collector/runs files stay ignored.
    git("add", str(OUTPUT.relative_to(REPO_ROOT)))
    diff = git("diff", "--cached", "--quiet", check=False)
    if diff.returncode == 0:
        print("No change to publish; latest-live.js already matches the selected run.")
        return

    short_prompt = " ".join(prompt.split())[:55] or "latest live run"
    git("commit", "-m", f"Publish live trace: {short_prompt}")
    result = git("push", "origin", "main")
    if result.stdout.strip():
        print(result.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, help="Specific saved run JSON; defaults to newest")
    parser.add_argument("--push", action="store_true", help="Commit latest-live.js and push main")
    args = parser.parse_args()

    path = args.run.expanduser().resolve() if args.run else newest_run()
    if not path.exists():
        raise SystemExit(f"Saved run does not exist: {path}")

    payload = load_archive(path)
    trace = normalized_trace(payload)
    write_case(trace)

    prompt = str(trace.get("meta", {}).get("prompt") or "Saved live run")
    print(f"Published local snapshot: {path.name}")
    print(f"Static case written: {OUTPUT.relative_to(REPO_ROOT)}")
    print("Share URL after push:")
    print("https://chi123zhang.github.io/openclaw-gateway-trace/?case=latest-live&reference=1")

    if args.push:
        push_case(prompt)
    else:
        print("\nNot pushed yet. Re-run with --push when ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
