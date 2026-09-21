#!/usr/bin/env python3
"""Publish the newest completed live run and the five most recent completed runs.

Usage:
    python3 scripts/publish_latest_run.py
    python3 scripts/publish_latest_run.py --push
    python3 scripts/publish_latest_run.py --run collector/runs/<file>.json --push

The collector keeps full local archives under collector/runs/. Public GitHub
Pages gets:
  - data/cases/latest-live.js: rolling latest successful run
  - data/cases/recent-runs.js: latest + four previous successful runs

The local archives are never deleted or rewritten by this publisher.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "collector" / "runs"
LATEST_OUTPUT = REPO_ROOT / "data" / "cases" / "latest-live.js"
RECENT_OUTPUT = REPO_ROOT / "data" / "cases" / "recent-runs.js"
INDEX_OUTPUT = REPO_ROOT / "index.html"
LATEST_CASE_ID = "latest-live"
PUBLIC_HISTORY_LIMIT = 5


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=check,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def ensure_synced_main() -> None:
    """Sync remote main before generating/pushing public snapshots.

    The viewer repo can be updated remotely while the local collector keeps
    running. Without this step, a later auto-publish can create a valid local
    commit but fail to push because local main is behind origin/main.
    """
    branch = git("branch", "--show-current").stdout.strip()
    if branch != "main":
        raise SystemExit(
            f"Refusing to auto-publish from branch {branch or '<detached>'!r}; "
            "switch the local viewer checkout to main first."
        )

    result = git("pull", "--rebase", "--autostash", "origin", "main", check=False)
    if result.returncode != 0:
        raise SystemExit(
            "Could not sync origin/main before publishing.\n"
            + (result.stdout.strip() or "git pull --rebase --autostash failed")
        )


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


def is_publishable(payload: dict[str, Any]) -> bool:
    return (
        str(payload.get("status") or "").strip().lower() == "complete"
        and isinstance(payload.get("trace"), dict)
        and bool(payload.get("response"))
    )


def case_id_for_archive(path: Path, payload: dict[str, Any]) -> str:
    run_id = str(payload.get("runId") or "").strip()
    stamp = path.stem.split("_", 1)[0].lower()
    suffix = run_id.replace("-", "")[:12] or path.stem[-12:].lower()
    return f"saved-{stamp}-{suffix}"


def normalized_trace(
    payload: dict[str, Any],
    *,
    case_id: str,
    published_at: str,
) -> dict[str, Any]:
    trace = payload.get("trace")
    if not isinstance(trace, dict):
        raise SystemExit("Saved run has no normalized 'trace' object.")

    published = json.loads(json.dumps(trace, ensure_ascii=False))
    meta = published.setdefault("meta", {})
    if not isinstance(meta, dict):
        meta = {}
        published["meta"] = meta

    prompt = str(payload.get("prompt") or meta.get("prompt") or meta.get("title") or "Saved live run")
    response = str(payload.get("response") or meta.get("response") or "")
    saved_at = str(payload.get("savedAt") or "")
    started_at = str(payload.get("startedAt") or "")

    meta["id"] = case_id
    meta["title"] = prompt
    meta["prompt"] = prompt
    meta["response"] = response
    meta["publishedFromLiveRun"] = True
    meta["publishedAt"] = published_at
    if saved_at:
        meta["savedAt"] = saved_at
    if started_at:
        meta["startedAt"] = started_at

    return published


def recent_completed_archives(selected: Path, limit: int = PUBLIC_HISTORY_LIMIT) -> list[tuple[Path, dict[str, Any]]]:
    selected = selected.resolve()
    collected: list[tuple[Path, dict[str, Any]]] = []
    seen_run_ids: set[str] = set()

    ordered = sorted(
        (path for path in RUNS_DIR.glob("*.json") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    # The exact run that triggered publishing is always considered first.
    ordered = [selected] + [path for path in ordered if path.resolve() != selected]

    for path in ordered:
        try:
            payload = load_archive(path)
        except SystemExit:
            continue
        if not is_publishable(payload):
            continue
        run_id = str(payload.get("runId") or path.stem)
        if run_id in seen_run_ids:
            continue
        seen_run_ids.add(run_id)
        collected.append((path, payload))
        if len(collected) >= limit:
            break

    return collected


def write_js_case(path: Path, case_id: str, trace: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(trace, ensure_ascii=False, separators=(",", ":"))
    path.write_text(
        "window.GATEWAY_CASES=window.GATEWAY_CASES||{};\n"
        f"window.GATEWAY_CASES[{json.dumps(case_id)}]={encoded};\n",
        encoding="utf-8",
    )


def write_recent_cases(records: list[tuple[Path, dict[str, Any]]], published_at: str) -> None:
    RECENT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "window.GATEWAY_CASES=window.GATEWAY_CASES||{};",
        "window.GATEWAY_PUBLIC_RUNS=window.GATEWAY_PUBLIC_RUNS||[];",
    ]
    public_items: list[dict[str, Any]] = []

    for index, (path, payload) in enumerate(records):
        unique_id = case_id_for_archive(path, payload)
        trace = normalized_trace(payload, case_id=unique_id, published_at=published_at)
        lines.append(
            f"window.GATEWAY_CASES[{json.dumps(unique_id)}]="
            + json.dumps(trace, ensure_ascii=False, separators=(",", ":"))
            + ";"
        )

        public_items.append(
            {
                # The newest item points to the compatibility rolling alias.
                "id": LATEST_CASE_ID if index == 0 else unique_id,
                "archiveCaseId": unique_id,
                "savedAt": payload.get("savedAt") or "",
                "startedAt": payload.get("startedAt") or "",
                "prompt": payload.get("prompt") or trace.get("meta", {}).get("prompt") or "",
                "runId": payload.get("runId") or "",
                "latest": index == 0,
            }
        )

    lines.append(
        "window.GATEWAY_PUBLIC_RUNS="
        + json.dumps(public_items, ensure_ascii=False, separators=(",", ":"))
        + ";"
    )
    RECENT_OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def refresh_public_case_cache_versions() -> None:
    """Force GitHub Pages visitors to fetch the newest published run bundle."""
    if not INDEX_OUTPUT.is_file():
        return
    text = INDEX_OUTPUT.read_text(encoding="utf-8")
    token = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    text = re.sub(
        r'data/cases/latest-live\.js\?v=[^"\\]+',
        f"data/cases/latest-live.js?v={token}",
        text,
    )
    text = re.sub(
        r'data/cases/recent-runs\.js\?v=[^"\\]+',
        f"data/cases/recent-runs.js?v={token}",
        text,
    )
    INDEX_OUTPUT.write_text(text, encoding="utf-8")


def push_cases(prompt: str) -> None:
    git(
        "add",
        str(LATEST_OUTPUT.relative_to(REPO_ROOT)),
        str(RECENT_OUTPUT.relative_to(REPO_ROOT)),
        str(INDEX_OUTPUT.relative_to(REPO_ROOT)),
    )
    diff = git("diff", "--cached", "--quiet", check=False)
    if diff.returncode == 0:
        print("No public-run change to publish.")
        return

    short_prompt = " ".join(prompt.split())[:55] or "latest live run"
    git("commit", "-m", f"Publish live trace: {short_prompt}")

    result = git("push", "origin", "main", check=False)
    if result.returncode != 0:
        raise SystemExit(
            "Public trace commit was created, but push failed.\n"
            + (result.stdout.strip() or "git push origin main failed")
        )
    if result.stdout.strip():
        print(result.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, help="Specific saved run JSON; defaults to newest")
    parser.add_argument("--push", action="store_true", help="Commit public run files and push main")
    args = parser.parse_args()

    if args.push:
        ensure_synced_main()

    path = args.run.expanduser().resolve() if args.run else newest_run()
    if not path.exists():
        raise SystemExit(f"Saved run does not exist: {path}")

    payload = load_archive(path)
    if not is_publishable(payload):
        raise SystemExit("Selected run is not a completed run with an assistant response.")

    published_at = datetime.now(timezone.utc).isoformat()
    latest_trace = normalized_trace(
        payload,
        case_id=LATEST_CASE_ID,
        published_at=published_at,
    )
    write_js_case(LATEST_OUTPUT, LATEST_CASE_ID, latest_trace)

    recent = recent_completed_archives(path, PUBLIC_HISTORY_LIMIT)
    write_recent_cases(recent, published_at)
    refresh_public_case_cache_versions()

    prompt = str(latest_trace.get("meta", {}).get("prompt") or "Saved live run")
    print(f"Published local snapshot: {path.name}")
    print(f"Rolling latest: {LATEST_OUTPUT.relative_to(REPO_ROOT)}")
    print(f"Public history: {RECENT_OUTPUT.relative_to(REPO_ROOT)} ({len(recent)} run(s), max {PUBLIC_HISTORY_LIMIT})")
    print("Share URL after push:")
    print("https://chi123zhang.github.io/openclaw-gateway-trace/")

    if args.push:
        push_cases(prompt)
    else:
        print("\nNot pushed yet. Re-run with --push when ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
