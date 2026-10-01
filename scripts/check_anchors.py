#!/usr/bin/env python3
"""Validate paper source anchors against upstream OpenClaw 0790d9f.

The checker validates source-anchor fidelity only. It does not validate runtime
trace evidence or TraceClaw instrumentation.
"""

from __future__ import annotations

import argparse
import csv
import sys
import tempfile
import urllib.request
from pathlib import Path


COMMIT = "0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c"
CSV_PATH = Path("artifacts/controlled/source-anchor-check-g14-g18.csv")
RAW_BASE = f"https://raw.githubusercontent.com/openclaw/openclaw/{COMMIT}"
LOCAL_SOURCE_ROOT = Path("/private/tmp/openclaw-0790d9f")
STATUS_ORDER = ("PASS", "FAIL", "AMBIGUOUS")
GENERIC_TOKENS = {
    "ctx",
    "params",
    "cfg",
    "result",
    "return",
    "run",
    "state",
    "value",
    "entry",
}


def read_source(source_file: str) -> list[str]:
    local_path = LOCAL_SOURCE_ROOT / source_file
    if local_path.exists():
        return local_path.read_text(encoding="utf-8").splitlines()

    cache_path = Path(tempfile.gettempdir()) / "traceclaw-openclaw-0790d9f" / source_file
    if not cache_path.exists():
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        url = f"{RAW_BASE}/{source_file}"
        with urllib.request.urlopen(url, timeout=30) as response:
            cache_path.write_bytes(response.read())
    return cache_path.read_text(encoding="utf-8").splitlines()


def parse_hint(hint: str) -> tuple[str, str]:
    if not hint:
        return "", ""
    if "=" not in hint:
        return "contains", hint
    key, value = hint.split("=", 1)
    return key.strip(), value.strip()


def shorten_source(line: str) -> str:
    return line if len(line) <= 120 else line[:120] + "..."


def validate_row(row: dict[str, str]) -> dict[str, str]:
    source_file = row["source_file"]
    token = row["expected_token"].strip()
    hint = row.get("occurrence_hint", "").strip()
    handling = row.get("handling", "token").strip()
    start_line = int(row["start_line"])
    end_line = int(row["end_line"])

    result = dict(row)
    result["actual_line"] = ""
    result["status"] = ""
    result["source_text"] = ""

    if handling not in {"token", "function-range-line-not-pinned"}:
        result["status"] = "FAIL"
        result["source_text"] = f"invalid handling: {handling}"
        return result
    if not token:
        result["status"] = "FAIL"
        result["source_text"] = "missing expected_token"
        return result
    if token in GENERIC_TOKENS:
        result["status"] = "FAIL"
        result["source_text"] = f"generic expected_token is disallowed: {token}"
        return result

    try:
        lines = read_source(source_file)
    except Exception as exc:  # pragma: no cover - diagnostic path
        result["status"] = "FAIL"
        result["source_text"] = f"could not read source: {exc}"
        return result

    candidates = [i for i, line in enumerate(lines, start=1) if token in line]
    key, value = parse_hint(hint)
    if key == "line" and value:
        hinted = int(value)
        candidates = [hinted] if 1 <= hinted <= len(lines) and token in lines[hinted - 1] else []
    elif key == "contains" and value:
        candidates = [i for i in candidates if value in lines[i - 1]]
    elif key == "startswith" and value:
        candidates = [i for i in candidates if lines[i - 1].lstrip().startswith(value)]
    elif key:
        result["status"] = "FAIL"
        result["source_text"] = f"unknown occurrence_hint: {hint}"
        return result

    if not candidates:
        result["status"] = "FAIL"
        result["source_text"] = "no matching source line"
        return result
    if len(candidates) > 1:
        result["status"] = "AMBIGUOUS"
        result["actual_line"] = ";".join(str(line) for line in candidates)
        result["source_text"] = "candidate lines: " + result["actual_line"]
        return result

    actual_line = candidates[0]
    result["actual_line"] = str(actual_line)
    result["source_text"] = shorten_source(lines[actual_line - 1])
    result["status"] = "PASS" if start_line <= actual_line <= end_line else "FAIL"
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(CSV_PATH))
    parser.add_argument("--write", action="store_true", help="write computed status fields back to CSV")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    required = {
        "stage",
        "paper_identifier",
        "source_file",
        "start_line",
        "end_line",
        "expected_token",
        "occurrence_hint",
        "handling",
        "status",
        "actual_line",
        "source_text",
    }
    missing = sorted(required - set(fieldnames))
    if missing:
        print(f"Missing CSV columns: {', '.join(missing)}", file=sys.stderr)
        return 2

    checked = [validate_row(row) for row in rows]
    counts = {status: sum(1 for row in checked if row["status"] == status) for status in STATUS_ORDER}

    print(f"Upstream commit: {COMMIT}")
    print(f"Rows checked: {len(checked)}")
    for status in STATUS_ORDER:
        print(f"{status}={counts[status]}")
    print()
    print("stage,expected_token,source_file,verified_line_or_range,source_text,status")
    for row in checked:
        verified = f"{row['start_line']}--{row['end_line']}"
        if row["actual_line"]:
            verified += f" (actual {row['actual_line']})"
        print(
            f"{row['stage']},{row['expected_token']},{row['source_file']},"
            f"{verified},{row['source_text']},{row['status']}"
        )

    if args.write:
        with csv_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(checked)

    return 1 if counts["FAIL"] or counts["AMBIGUOUS"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
