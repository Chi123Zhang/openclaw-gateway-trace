#!/usr/bin/env python3
"""Recover and validate repeated New York weather traces from git history.

The script intentionally counts a run only when it can recover an embedded
case object with complete G0--G18 stages and observed Agent Runtime events.
Run-history metadata alone is preserved as metadata, but is not promoted to
experimental evidence.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import pathlib
import re
import subprocess
from typing import Any


EXPECTED_STAGES = [f"G{i}" for i in range(19)]


def git(repo: pathlib.Path, args: list[str], check: bool = True) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        check=False,
    )
    if check and proc.returncode:
        raise RuntimeError(proc.stderr.strip())
    return proc.stdout


def parse_balanced(text: str, start: int) -> str:
    open_ch = text[start]
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return text[start : idx + 1]
    raise ValueError("unbalanced JavaScript literal")


def extract_cases(text: str) -> dict[str, dict[str, Any]]:
    cases: dict[str, dict[str, Any]] = {}
    pattern = r"window\.GATEWAY_CASES\[(\"(?:\\.|[^\"])*\")\]\s*="
    for match in re.finditer(pattern, text):
        case_id = json.loads(match.group(1))
        literal_start = text.find("{", match.end())
        if literal_start < 0:
            continue
        cases[case_id] = json.loads(parse_balanced(text, literal_start))
    return cases


def extract_public_runs(text: str) -> list[dict[str, Any]]:
    match = re.search(r"window\.GATEWAY_PUBLIC_RUNS\s*=", text)
    if not match:
        return []
    literal_start = text.find("[", match.end())
    if literal_start < 0:
        return []
    return json.loads(parse_balanced(text, literal_start))


def is_new_york_weather(prompt: str | None) -> bool:
    normalized = (prompt or "").lower()
    return "weather" in normalized and (
        "newyork" in normalized or "new york" in normalized
    )


def iso_from_ms(value: Any) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    return (
        dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def summarize_case(
    case: dict[str, Any],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    meta = case.get("meta") or {}
    stages = case.get("stages") or {}
    collector = case.get("_collector") or {}
    runtime = case.get("agentRuntime") or {}
    events = runtime.get("events") or []
    tools = runtime.get("tools") or []

    observed_stages = collector.get("traceStagesObserved") or list(stages.keys())
    ordered_gateway_stages = [
        stage for stage in observed_stages if re.fullmatch(r"G\d+", stage)
    ]
    stage_order_ok = (
        [int(stage[1:]) for stage in ordered_gateway_stages[:19]]
        == list(range(19))
        if len(ordered_gateway_stages) >= 19
        else False
    )

    session_key = meta.get("sessionKey") or next(
        (event.get("sessionKey") for event in events if event.get("sessionKey")),
        None,
    )
    session_id = meta.get("sessionId") or next(
        (event.get("sessionId") for event in events if event.get("sessionId")),
        None,
    )
    web_search_tools = [tool for tool in tools if tool.get("name") == "web_search"]
    g0_g18_complete = all(stage in observed_stages for stage in EXPECTED_STAGES)
    runtime_observed = bool(runtime.get("observed"))
    final_reply_observed = bool(runtime.get("finalReply"))
    final_reply_event_observed = any(
        event.get("event") == "agent_reply_finalized" for event in events
    )
    reply_resolver_returned = any(
        event.get("event") == "reply_resolver_returned" for event in events
    )
    return_to_g16_observed = bool(runtime.get("returnToG16Observed"))
    web_search_observed = any(
        tool.get("started") and tool.get("resultObserved")
        for tool in web_search_tools
    )

    return {
        **provenance,
        "classification": (
            "genuine_independent_saved_trace"
            if g0_g18_complete and runtime_observed and bool(events)
            else "partial_or_missing_runtime_evidence"
        ),
        "prompt": meta.get("prompt"),
        "runId": meta.get("runId"),
        "sessionKey": session_key,
        "sessionId": session_id,
        "savedAt": meta.get("savedAt"),
        "startedAt": meta.get("startedAt") or iso_from_ms(runtime.get("startedAt")),
        "agent": meta.get("agent") or runtime.get("finalAgent"),
        "g0_g18_complete": g0_g18_complete,
        "stage_order_ok": stage_order_ok,
        "runtimeObserved": runtime_observed,
        "provider": runtime.get("provider"),
        "model": runtime.get("model"),
        "runner": runtime.get("runner"),
        "resolver": runtime.get("resolver"),
        "resolverSource": runtime.get("resolverSource") or meta.get("resolverSource"),
        "toolCalls": [
            {
                "name": tool.get("name"),
                "started": tool.get("started"),
                "resultObserved": tool.get("resultObserved"),
                "status": tool.get("status"),
                "query": (tool.get("result") or {}).get("query"),
            }
            for tool in tools
        ],
        "webSearchObserved": web_search_observed,
        "finalReplyObserved": final_reply_observed,
        "finalReplyEventObserved": final_reply_event_observed,
        "replyResolverReturned": reply_resolver_returned,
        "returnToG16Observed": return_to_g16_observed,
        "eventNames": [event.get("event") for event in events],
        "stagesObserved": observed_stages,
    }


def weather_publish_commits(repo: pathlib.Path) -> list[tuple[str, str, str, str]]:
    log = git(
        repo,
        [
            "log",
            "--all",
            "--date=iso-strict",
            "--pretty=format:%H%x09%h%x09%ad%x09%s",
            "--",
            "data/cases/latest-live.js",
        ],
    )
    commits = []
    for line in log.splitlines():
        full, short, date, subject = line.split("\t", 3)
        if (
            date.startswith("2026-09-21")
            and "Publish live trace:" in subject
            and is_new_york_weather(subject)
        ):
            commits.append((full, short, date, subject))
    return commits


def build_artifact(repo: pathlib.Path) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for full, short, commit_date, subject in weather_publish_commits(repo):
        text = git(repo, ["show", f"{full}:data/cases/latest-live.js"], check=False)
        for case_id, case in extract_cases(text).items():
            if is_new_york_weather((case.get("meta") or {}).get("prompt")):
                rows.append(
                    summarize_case(
                        case,
                        {
                            "caseId": case_id,
                            "sourceFile": "data/cases/latest-live.js",
                            "commit": short,
                            "commitFull": full,
                            "commitDate": commit_date,
                            "subject": subject,
                            "provenanceType": "historical_latest_live",
                        },
                    )
                )

    recent_path = repo / "data" / "cases" / "recent-runs.js"
    public_metadata = []
    if recent_path.exists():
        recent_text = recent_path.read_text(encoding="utf-8")
        public_metadata = [
            {
                key: run.get(key)
                for key in [
                    "id",
                    "savedAt",
                    "startedAt",
                    "prompt",
                    "runId",
                    "agent",
                    "resolverSource",
                    "runner",
                    "provider",
                    "model",
                    "tools",
                    "finalReplyObserved",
                    "returnToG16Observed",
                ]
            }
            for run in extract_public_runs(recent_text)
            if is_new_york_weather(run.get("prompt"))
        ]
        known_run_ids = {row.get("runId") for row in rows}
        head_commit = git(repo, ["rev-parse", "HEAD"]).strip()
        for case_id, case in extract_cases(recent_text).items():
            if not is_new_york_weather((case.get("meta") or {}).get("prompt")):
                continue
            row = summarize_case(
                case,
                {
                    "caseId": case_id,
                    "sourceFile": "data/cases/recent-runs.js",
                    "commit": "HEAD",
                    "commitFull": head_commit,
                    "commitDate": None,
                    "subject": "current public archived case",
                    "provenanceType": "current_public_archive",
                },
            )
            if row.get("runId") not in known_run_ids:
                rows.append(row)

    rows.sort(key=lambda row: row.get("startedAt") or row.get("commitDate") or "")
    unique_rows = []
    seen_run_ids = set()
    for row in rows:
        run_id = row.get("runId")
        if run_id in seen_run_ids:
            continue
        seen_run_ids.add(run_id)
        unique_rows.append(row)
    rows = unique_rows

    valid = [
        row for row in rows if row["classification"] == "genuine_independent_saved_trace"
    ]
    validation = {
        "independentRunCount": len({row.get("runId") for row in valid}),
        "allExpectedStagesPresent": bool(valid)
        and all(row["g0_g18_complete"] for row in valid),
        "stageOrderingStable": bool(valid)
        and all(row["stage_order_ok"] for row in valid),
        "agentStable": bool(valid) and len({row.get("agent") for row in valid}) == 1,
        "resolverStable": bool(valid)
        and len({row.get("resolverSource") or row.get("resolver") for row in valid})
        == 1,
        "runSpecificIdentifiersDiffer": bool(valid)
        and len({row.get("runId") for row in valid}) == len(valid)
        and len({row.get("sessionId") for row in valid}) == len(valid)
        and len({row.get("sessionKey") for row in valid}) == len(valid),
        "webSearchCaptured": bool(valid)
        and all(row["webSearchObserved"] for row in valid),
        "finalReplyCapturedAfterTool": bool(valid)
        and all(
            row["webSearchObserved"] and row["finalReplyEventObserved"]
            for row in valid
        ),
        "resolverReturnLinkedToG16": bool(valid)
        and all(
            row["replyResolverReturned"] and row["returnToG16Observed"]
            for row in valid
        ),
    }
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "repository": str(repo),
        "scope": (
            "Sep. 21 local-time New York weather traces. Historical "
            "latest-live.js is used for publish-time evidence; current "
            "recent-runs.js is only added when it embeds a non-duplicate case."
        ),
        "recoverableRuns": rows,
        "currentPublicRunMetadata": public_metadata,
        "validation": validation,
        "unsupportedClaims": [
            "No rejected, failed, retried, cancelled, or cross-version weather paths are evidenced by this audit.",
            "UI history entries alone are not counted without an embedded case object and runtime events.",
            "Cake2 does not yet provide a full top-level post-G18 agentRuntime object.",
        ],
    }


def write_csv(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "provenanceType",
        "classification",
        "commit",
        "commitDate",
        "caseId",
        "startedAt",
        "savedAt",
        "prompt",
        "runId",
        "sessionKey",
        "sessionId",
        "agent",
        "g0_g18_complete",
        "stage_order_ok",
        "runtimeObserved",
        "provider",
        "model",
        "runner",
        "resolverSource",
        "webSearchObserved",
        "finalReplyEventObserved",
        "replyResolverReturned",
        "returnToG16Observed",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column) for column in columns})


def latex_bool(value: bool, true_label: str = "observed") -> str:
    return true_label if value else "missing"


def write_latex_table(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    lines = [
        "% Auto-generated by scripts/validate_repeated_weather_runs.py.",
        "{\\scriptsize",
        "\\begin{longtable}{",
        "    @{}",
        "    >{\\raggedright\\arraybackslash}p{0.18\\linewidth}",
        "    >{\\raggedright\\arraybackslash}p{0.76\\linewidth}",
        "    @{}",
        "}",
        "\\caption{Weather-run comparison table generated from historical",
        "\\texttt{latest-live.js} snapshots. The table includes only fields that are",
        "present in the saved trace artifacts.}",
        "\\label{tab:repeated-run-validation}\\\\",
        "\\toprule",
        "\\textbf{Field} & \\textbf{Verified value} \\\\",
        "\\midrule",
        "\\endfirsthead",
        "\\toprule",
        "\\textbf{Field} & \\textbf{Verified value} \\\\",
        "\\midrule",
        "\\endhead",
    ]
    valid_rows = [
        row for row in rows if row["classification"] == "genuine_independent_saved_trace"
    ]
    for idx, row in enumerate(valid_rows):
        if idx:
            lines.append("\\midrule")
        run_label = f"Weather run {idx + 1}"
        runtime_return = (
            "\\texttt{reply\\_resolver\\_returned}; G16 observed"
            if row["replyResolverReturned"] and row["returnToG16Observed"]
            else "missing"
        )
        values = [
            ("Run", f"\\textbf{{{run_label}}}"),
            ("Run ID", f"\\texttt{{\\seqsplit{{{row['runId']}}}}}"),
            ("Prompt", f"\\texttt{{{escape_latex(row['prompt'] or '')}}}"),
            ("G0--G18", "complete" if row["g0_g18_complete"] else "missing"),
            ("Tool", "\\texttt{web\\_search}" if row["webSearchObserved"] else "missing"),
            ("Agent", f"\\texttt{{{escape_latex(row['agent'] or '')}}}"),
            (
                "Resolver",
                f"\\texttt{{\\seqsplit{{{escape_latex(row['resolverSource'] or '')}}}}}",
            ),
            ("Final reply", latex_bool(row["finalReplyEventObserved"])),
            ("Runtime return", runtime_return),
        ]
        for field, value in values:
            lines.append(f"\\textbf{{{field}}} & {value} \\\\")
    lines.extend(
        [
            "\\bottomrule",
            "\\end{longtable}",
            "}",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def escape_latex(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "_": r"\_",
        "%": r"\%",
        "&": r"\&",
        "#": r"\#",
        "{": r"\{",
        "}": r"\}",
    }
    return "".join(replacements.get(ch, ch) for ch in value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo",
        type=pathlib.Path,
        default=pathlib.Path(__file__).resolve().parents[1],
    )
    parser.add_argument(
        "--out-dir",
        type=pathlib.Path,
        default=None,
    )
    args = parser.parse_args()

    repo = args.repo.resolve()
    out_dir = args.out_dir or repo / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)

    artifact = build_artifact(repo)
    rows = artifact["recoverableRuns"]

    json_path = out_dir / "repeated-run-validation.json"
    csv_path = out_dir / "repeated-run-validation.csv"
    tex_path = out_dir / "weather-run-comparison-table.tex"

    json_path.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_csv(csv_path, rows)
    write_latex_table(tex_path, rows)

    print(
        json.dumps(
            {
                "recoverableRuns": len(rows),
                "genuineRuns": artifact["validation"]["independentRunCount"],
                "validation": artifact["validation"],
                "json": str(json_path),
                "csv": str(csv_path),
                "latexTable": str(tex_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
