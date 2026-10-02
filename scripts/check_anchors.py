#!/usr/bin/env python3
"""Validate appendix source anchors against upstream OpenClaw 0790d9f.

The checker validates source-anchor fidelity only. It does not validate saved
runtime evidence or TraceClaw instrumentation semantics.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import tempfile
import ssl
import urllib.request
from collections import Counter
from pathlib import Path

COMMIT = "0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c"
CSV_PATH = Path("artifacts/controlled/source-anchor-check-all.csv")
PAPER_PATH = Path("paper/appendix.tex")
RAW_BASE = f"https://raw.githubusercontent.com/openclaw/openclaw/{COMMIT}"
LOCAL_SOURCE_ROOT = Path("/private/tmp/openclaw-0790d9f")
TREE_CACHE = Path(tempfile.gettempdir()) / "traceclaw-openclaw-0790d9f-tree.json"
SOURCE_CACHE = Path(tempfile.gettempdir()) / "traceclaw-openclaw-0790d9f"
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
ANCHOR_RE = re.compile(
    r"(?P<file>[\w./-]+\.(?:ts|tsx|js|jsx)):(?P<start>\d+)"
    r"(?:(?:--(?P<end>\d+))|(?:\s*(?P<onward>onward))|(?P<plus>\+))?"
)
IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]{1,}")

G0_START_RE = re.compile(r"^\\subsection\*\{G0:")
POST_SECTION_RE = re.compile(r"^\\section\{Post-G18 Agent Runtime Source and Runtime Evidence\}")
POST_B_RE = re.compile(r"^\\subsection\*\{B\. Source Anchors\}")
NEXT_SUBSECTION_RE = re.compile(r"^\\subsection\*\{[C-Z]\. ")
NEXT_SECTION_RE = re.compile(r"^\\section\{")

ALIAS = {
    "auth-context.ts": "src/gateway/server/ws-connection/auth-context.ts",
    "message-handler.ts": "src/gateway/server/ws-connection/message-handler.ts",
    "chat.ts": "src/gateway/server-methods/chat.ts",
    "chat-send.ts": "ui/src/pages/chat/chat-send.ts",
    "session-utils.ts": "src/gateway/session-utils.ts",
    "agent-scope.ts": "src/agents/agent-scope.ts",
    "send-policy.ts": "src/sessions/send-policy.ts",
    "auth.ts": "src/gateway/auth.ts",
    "logs-chat.ts": "packages/gateway-protocol/src/schema/logs-chat.ts",
    "chat-input-sanitize.ts": "src/gateway/chat-input-sanitize.ts",
    "agent-events.ts": "src/infra/agent-events.ts",
    "dispatch.ts": "src/auto-reply/dispatch.ts",
    "dispatch-from-config.ts": "src/auto-reply/reply/dispatch-from-config.ts",
    "inbound-context.ts": "src/auto-reply/reply/inbound-context.ts",
}


def load_tree() -> list[str]:
    if not TREE_CACHE.exists():
        url = f"https://api.github.com/repos/openclaw/openclaw/git/trees/{COMMIT}?recursive=1"
        with urllib.request.urlopen(url, timeout=30, context=ssl._create_unverified_context()) as response:
            TREE_CACHE.write_bytes(response.read())
    data = json.loads(TREE_CACHE.read_text(encoding="utf-8"))
    return [item["path"] for item in data.get("tree", []) if item.get("type") == "blob"]


def normalize_source_file(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("src/") or raw.startswith("ui/") or raw.startswith("packages/") or raw.startswith("extensions/"):
        return raw
    if raw in ALIAS:
        return ALIAS[raw]
    tree = load_tree()
    matches = [path for path in tree if path.endswith("/" + raw) or path == raw]
    if len(matches) == 1:
        return matches[0]
    if matches:
        raise ValueError(f"ambiguous source file {raw}: {matches[:8]}")
    return raw


def read_source(source_file: str) -> list[str]:
    local_path = LOCAL_SOURCE_ROOT / source_file
    if local_path.exists():
        return local_path.read_text(encoding="utf-8").splitlines()
    cache_path = SOURCE_CACHE / source_file
    if not cache_path.exists():
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        url = f"{RAW_BASE}/{source_file}"
        with urllib.request.urlopen(url, timeout=30, context=ssl._create_unverified_context()) as response:
            cache_path.write_bytes(response.read())
    return cache_path.read_text(encoding="utf-8").splitlines()


def target_line_numbers(lines: list[str]) -> set[int]:
    gateway_start = next(i for i, line in enumerate(lines, start=1) if G0_START_RE.match(line))
    post_start = next(i for i, line in enumerate(lines, start=1) if POST_SECTION_RE.match(line))
    post_b_start = next(i for i, line in enumerate(lines, start=1) if POST_B_RE.match(line))
    post_b_end = len(lines)
    for i in range(post_b_start + 1, len(lines) + 1):
        line = lines[i - 1]
        if NEXT_SUBSECTION_RE.match(line) or (NEXT_SECTION_RE.match(line) and i != post_b_start):
            post_b_end = i - 1
            break
    return set(range(gateway_start, post_start)) | set(range(post_b_start, post_b_end + 1))


def enumerate_paper_anchors(lines: list[str]) -> list[dict[str, str]]:
    target = target_line_numbers(lines)
    anchors: list[dict[str, str]] = []
    current_stage = "frontmatter"
    occurrence_counter: Counter[int] = Counter()
    for line_no, line in enumerate(lines, start=1):
        stage_match = re.search(r"\\subsection\*\{([^}:]+)", line)
        if stage_match:
            current_stage = stage_match.group(1).strip()
        if line_no not in target:
            continue
        for match in ANCHOR_RE.finditer(line):
            occurrence_counter[line_no] += 1
            raw_file = match.group("file")
            start_line = int(match.group("start"))
            if match.group("end"):
                end_line = int(match.group("end"))
            else:
                end_line = start_line
            if match.group("onward") or match.group("plus"):
                # Filled later with source length during validation.
                end_line = -1
            source_file = normalize_source_file(raw_file)
            anchors.append(
                {
                    "paper_line": str(line_no),
                    "paper_occurrence": str(occurrence_counter[line_no]),
                    "paper_location": f"line {line_no} occurrence {occurrence_counter[line_no]}",
                    "stage": current_stage,
                    "source_file": source_file,
                    "source_ref": match.group(0),
                    "start_line": str(start_line),
                    "end_line": str(end_line),
                }
            )
    return anchors


def parse_paper_location(location: str) -> tuple[int, int, int]:
    match = re.search(r"line\s+(\d+)(?:--(\d+))?(?:\s+occurrence\s+(\d+))?", location)
    if not match:
        raise ValueError(f"unsupported paper_location: {location}")
    start = int(match.group(1))
    end = int(match.group(2) or match.group(1))
    occurrence = int(match.group(3) or 1)
    return start, end, occurrence


def paper_text_for_location(lines: list[str], location: str) -> str:
    start, end, _ = parse_paper_location(location)
    # A logical LaTeX table row is often split across several physical lines:
    # the pseudocode text, &, the source cell, and the row terminator. Use a
    # compact row window rather than only the source-reference line.
    lo = max(1, start - 12)
    hi = min(len(lines), end + 12)
    return "\n".join(lines[lo - 1 : hi])


def normalize_paper_text(text: str) -> str:
    """Normalize common TeX escapes so code tokens can be compared literally."""
    return (
        text.replace(r"\_", "_")
        .replace(r"\{", "{")
        .replace(r"\}", "}")
        .replace(r"\#", "#")
        .replace(r"\$", "$")
        .replace(r"\&", "&")
    )


def anchor_key(row: dict[str, str]) -> tuple[str, str, str, str, str, str]:
    return (
        row["paper_line"],
        row["paper_occurrence"],
        row["source_file"],
        row["source_ref"],
        row["start_line"],
        row["end_line"],
    )


def parse_hint(hint: str) -> tuple[str, str]:
    if not hint:
        return "", ""
    if "=" not in hint:
        return "contains", hint
    key, value = hint.split("=", 1)
    return key.strip(), value.strip()


def shorten_source(line: str) -> str:
    return line if len(line) <= 120 else line[:120] + "..."


def validate_row(row: dict[str, str], paper_lines: list[str]) -> dict[str, str]:
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

    paper_text = normalize_paper_text(paper_text_for_location(paper_lines, row["paper_location"]))
    if handling == "token" and token not in paper_text:
        result["status"] = "FAIL"
        result["source_text"] = f"expected_token not found in paper_location: {token}"
        return result

    try:
        source_lines = read_source(source_file)
    except Exception as exc:
        result["status"] = "FAIL"
        result["source_text"] = f"could not read source: {exc}"
        return result

    effective_end_line = len(source_lines) if end_line == -1 else end_line

    candidates = [i for i, line in enumerate(source_lines, start=1) if token in line]
    key, value = parse_hint(hint)
    if key == "line" and value:
        hinted = int(value)
        candidates = [hinted] if 1 <= hinted <= len(source_lines) and token in source_lines[hinted - 1] else []
    elif key == "contains" and value:
        candidates = [i for i in candidates if value in source_lines[i - 1]]
    elif key == "startswith" and value:
        candidates = [i for i in candidates if source_lines[i - 1].lstrip().startswith(value)]
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
    result["source_text"] = shorten_source(source_lines[actual_line - 1])
    result["status"] = "PASS" if start_line <= actual_line <= effective_end_line else "FAIL"
    return result


def load_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])
    return rows, fieldnames


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(CSV_PATH))
    parser.add_argument("--paper", default=str(PAPER_PATH))
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--list-missing", action="store_true")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    paper_path = Path(args.paper)
    paper_lines = paper_path.read_text(encoding="utf-8").splitlines()
    paper_anchors = enumerate_paper_anchors(paper_lines)

    rows, fieldnames = load_csv(csv_path)
    required = {
        "stage",
        "paper_location",
        "paper_line",
        "paper_occurrence",
        "source_ref",
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
    missing_columns = sorted(required - set(fieldnames))
    if missing_columns:
        print(f"Missing CSV columns: {', '.join(missing_columns)}", file=sys.stderr)
        return 2

    paper_keys = {anchor_key(row) for row in paper_anchors}
    csv_keys = {anchor_key(row) for row in rows}
    missing_from_csv = [row for row in paper_anchors if anchor_key(row) not in csv_keys]
    extra_csv = [row for row in rows if anchor_key(row) not in paper_keys]

    checked = [validate_row(row, paper_lines) for row in rows]
    counts = {status: sum(1 for row in checked if row["status"] == status) for status in STATUS_ORDER}
    stage_counts = Counter(row["stage"] for row in checked)

    print(f"Upstream commit: {COMMIT}")
    print("Anchor parser regex: " + ANCHOR_RE.pattern)
    print(f"PAPER_ANCHORS_FOUND={len(paper_anchors)}")
    print(f"CSV_ANCHORS={len(rows)}")
    for status in STATUS_ORDER:
        print(f"{status}={counts[status]}")
    print(f"MISSING_FROM_CSV={len(missing_from_csv)}")
    print(f"EXTRA_CSV_ROWS={len(extra_csv)}")
    print("STAGE_COUNTS=" + json.dumps(dict(sorted(stage_counts.items())), sort_keys=True))
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

    if args.list_missing and missing_from_csv:
        print("\nMissing anchors:")
        for row in missing_from_csv[:200]:
            print(row)

    if args.write:
        with csv_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(checked)

    return 1 if counts["FAIL"] or counts["AMBIGUOUS"] or missing_from_csv else 0


if __name__ == "__main__":
    raise SystemExit(main())
