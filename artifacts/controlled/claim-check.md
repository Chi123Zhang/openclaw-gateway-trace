# Controlled Claim Check

Base branch: `revision-r1-r7-controlled`

Base commit used for revision: `b375dd68ee6af1adfa49d8148e14eba3041d14e9`

## Environment and Provenance

| Claim | Artifact field / command | Status |
|---|---|---|
| R6/R7 were collected after `7d742df` in the temporary worktree branch `collect-r6-r7`. | `artifacts/audit/r6-r7-collection.md` in the source audit checkout; the temporary worktree is referred to as `<r6-r7-worktree>`. | Supported by audit report. |
| OpenClaw HEAD for the frozen environment was `0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`. | `artifacts/audit/r6-r7-collection.md`, before/after fingerprint output. | Supported by audit report. |
| OpenClaw patch hash was unchanged before and after R6/R7: `6736a6be821ae927ebb112328d9552386684d5cbd8090975f52cc8666d8ef11f`. | `artifacts/audit/r6-r7-collection.md`, before/after fingerprint output. | Supported by audit report. |
| Traces do not record `openclawCommit`, `traceclawCommit`, or `configFingerprint`. | `artifacts/audit/follow-up-audit.md`; saved trace `meta` fields inspected in `artifacts/controlled/controlled-runs.json`. | Supported. |

## Controlled Runs

| Run | Commit | Run ID | Prompt / class | Artifact source |
|---|---|---|---|---|
| R1 | `a68e6d7` | `8d07c88e-188f-4347-9f9a-7fc90412c604` | `How to make a cake?`; no-tool | `data/cases/latest-live.js@a68e6d7`, summarized in `artifacts/controlled/controlled-runs.json`. |
| R2 | `96ae1af` | `fba117de-41bb-4b71-bd7b-e73f57f661d6` | OpenTelemetry tracing documentation search; read-only retrieval | `data/cases/latest-live.js@96ae1af`. |
| R3 | `44809cf` | `5eb26fda-84fd-4b39-b482-9fe2d7dba6e4` | email draft-and-send prompt; external side effect via host app | `data/cases/latest-live.js@44809cf`; paper-facing prompt is redacted. |
| R4 | `4f6bde9` | `37bf6523-4daa-44c9-b8ab-f914ac855289` | Fibonacci script prompt; local file write | `data/cases/latest-live.js@4f6bde9`. |
| R5 | `7d742df` | `42b573dc-2f1d-4fb4-b4ba-e5af4b33fb67` | tracing vs provenance prompt; no-tool | `data/cases/latest-live.js@7d742df`. |
| R6 | `1e5549f00052dd32edea579d11f0483df5a2213c` | `3eb51151-c37c-4996-ac18-e410bf2e0fe5` | exact repeat of R5; no-tool | `data/cases/latest-live.js@1e5549f`. |
| R7 | `b375dd68ee6af1adfa49d8148e14eba3041d14e9` | `02225265-5122-423f-ad75-1a08188cfc23` | exact repeat of R1; no-tool | `data/cases/latest-live.js@b375dd6`. |

## Quantitative Statements

| Paper statement | Artifact field | Value |
|---|---|---|
| Every controlled run covers all G0--G18 Gateway stages. | `artifacts/controlled/controlled-runs.json`, `runs[].cov`; stage extraction from `trace.stages.G0...G18`. | `19/19` for R1--R7. |
| Every controlled run directly observes stage outcomes. | `artifacts/controlled/controlled-runs.json`, `runs[].obs`; stage evidence/runtime flags. | `19/19` for R1--R7. |
| R1/R7 and R5/R6 have no G0--G18 branch differences. | `artifacts/controlled/controlled-runs.json`, `repeatability[].stageBranchDiff`. | Empty for both pairs. |
| Agent, resolver, tool/no-tool class, stop reason, and AR structure match for both repeated prompt pairs. | `artifacts/controlled/controlled-runs.json`, `repeatability[]`. | `true` for all listed checks. |
| AR6 is source-derived by design. | `artifacts/controlled/controlled-runs.json`, `agentRuntime[].arStage.AR6`. | `SourceDerived` for R1--R7. |
| No-tool runs are R1, R5, R6, and R7. | `artifacts/controlled/controlled-runs.json`, `runs[].class` and `runs[].tools`. | `no-tool`, `none`. |
| R2 is read-only retrieval. | `artifacts/controlled/controlled-runs.json`, R2 `class`, `tools`. | `read-only retrieval`, six `web_search` calls. |
| R4 is local file write. | `artifacts/controlled/controlled-runs.json`, R4 `class`, `tools`. | `local file write`, `bash + bash + apply_patch + bash`. |
| R3 is external side effect via host app. | `artifacts/controlled/controlled-runs.json`, R3 `class`, `tools`. | `external side effect via host app`, five `bash` calls. |

## Restored Appendix Checks

| Appendix statement | Artifact / source | Status |
|---|---|---|
| The appendix contains a detailed R1 G0--G18 source audit. | `paper/appendix.tex`, label `app:detailed-gateway-audit`. | Restored. All stages G0--G18 appear in `tab:app-detailed-gateway-audit`. |
| R1 G0--G3 use shared-token auth, role `operator`, scope `operator.write`, and ordinary `chat.send` authorization. | `artifacts/controlled/controlled-runs.json`, R1 stage rows G0--G3. | Supported. |
| R1 does not take the device-token fallback path. | R1 G0/G2 values: `hasDeviceIdentity=False`, `authMethod=token`, `sharedAuthOk=True`, `role=operator`, `scopes=["operator.write"]`. | Supported for R1. Historical Cake2 is explicitly separate. |
| G3 source claim is limited to admin shortcut versus required `operator.write`. | `artifacts/controlled/source-anchor-audit-r1.csv`, G3 rows; upstream `server-methods.ts:262-299`, `core-descriptors.ts:231`, `method-scopes.ts:257-274`. | Supported. No causal claim that auth method alone determines scope. |
| Corrected G14/G16/G17/G18 anchors use upstream 0790d9f line ranges, not the old conflicting ranges. | `artifacts/controlled/source-anchor-audit-r1.csv`, G14--G18 and post-G18 rows; original priority audit in `artifacts/audit/anchor-content-audit.csv` from the source audit checkout. | Supported. |
| R1 has at least one `not recorded` or equivalent gap in multiple stages. | `paper/appendix.tex`, detailed audit gap fields. | Supported; gaps include raw tokens, complete config/session objects, full dispatch results, full `replyResult`, and full lock/cache state. |
| AR6 is not directly observed as a full Gateway resume. | `artifacts/controlled/controlled-runs.json`, `agentRuntime[].arStage.AR6`; `paper/appendix.tex`, AR table. | Supported as `SourceDerived` for R1--R7. |

## R3 Side-Effect Evidence

| Claim | Artifact field | Status |
|---|---|---|
| R3 has four concurrent capability probes. | `artifacts/controlled/controlled-runs.json`, R3 `agentRuntime.tools[].args.command`. | Commands are `command -v osascript || true`, `command -v mutt || true`, `command -v mail || true`, and `command -v msmtp || true`. |
| Probe stdout is not recorded, so the reason for choosing Apple Mail is not directly visible. | R3 tool result fields include exit code and timing but no stdout. | Supported as rationale-level gap. |
| R3 invokes Apple Mail through `osascript`. | R3 fifth `bash` tool command in raw trace; redacted in submitted materials. | Supported. |
| The host-side command completed; downstream delivery is not verified. | R3 fifth tool result has `exitCode=0`; no delivery receipt field exists. | Supported. |
| No separate approval/confirmation event is observed. | R3 runtime events and Agent Runtime tool events. | Supported; user prompt is the only explicit user-intent context in trace. |

## Claims Removed or Weakened

| Earlier claim type | Current treatment |
|---|---|
| Old Cake2 as primary quantitative case. | Replaced by R1 as the primary controlled case. Old Cake2 is historical only. |
| Cake2-specific post-G18 tool-loop claim. | Removed. AR claims are based on R1--R7 controlled traces. |
| Weather quantitative repeatability table in main paper. | Removed from main paper. Weather is historical note only. |
| Causal claim that authentication method determines authorization scope. | Weakened: source only establishes `operator.admin` shortcut vs `operator.write` requirement; old Cake2 vs R1 is observed difference, not causality. |
| Email delivery. | Weakened to host-side command completion with no downstream delivery verification. |

## Privacy

Paper and `artifacts/controlled/` were scanned for the raw recipient email, absolute local paths, and sender name. No hits remained after redaction.
