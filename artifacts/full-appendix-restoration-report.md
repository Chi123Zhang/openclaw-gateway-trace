# Full Appendix Restoration Report

Branch: `revision-r1-r7-controlled`

Base restored from: `24aba06^:paper/appendix.tex`

Old appendix size: 15,263 lines.

Restored appendix size before PDF build: 15,197 lines.

## Evidence Sources Used

- Old appendix content and structure: `git show 24aba06^:paper/appendix.tex`.
- Current controlled run facts: `artifacts/controlled/controlled-runs.json`.
- Current source-anchor audit: `artifacts/controlled/source-anchor-audit-r1.csv`.
- Current claim ledger: `artifacts/controlled/claim-check.md`.

`artifacts/audit/anchor-content-audit.csv` is not present in this branch or in the reachable git history inspected here. I did not invent values from that missing file. The line-anchor corrections below use the current checked source-anchor audit for R1.

## Restoration Inventory

| Old appendix item | Status | Notes |
|---|---|---|
| Gateway Source-Level Trace | RESTORED + UPDATED TO R1 | Main appendix section restored from old long appendix. |
| Appendix Reading Guide | RESTORED + UPDATED TO R1 | Terminology updated from Cake2 to R1 and current evidence labels. |
| Concrete runtime values and exact sources | RESTORED + UPDATED TO R1 | R1 run ID, session key, prompt, auth, scope, resolver, provider/model retained; missing session ID marked `NOT RECORDED`. |
| G0 detailed table and diagram | RESTORED + UPDATED TO R1 | Shared-token path, `authOk=True`, no device-token candidate used. |
| G1 detailed table and diagram | RESTORED + UPDATED TO R1 | G1 is `allow`, not deny; no denial reason claimed. |
| G2 detailed table and diagram | RESTORED + UPDATED TO R1 | Shared-token success; device-token fallback and rate-limit guard are not reached. |
| G3 detailed table and diagram | RESTORED + UPDATED TO R1 | Role `operator`, scope `operator.write`; admin shortcut condition shown as source branch not taken. |
| G4 detailed table and diagram | RESTORED + UPDATED TO R1 | R1 request validation path preserved. |
| G5 detailed table and diagram | RESTORED + UPDATED TO R1 | Message sanitization path preserved for R1 prompt. |
| G6 detailed table and diagram | RESTORED + UPDATED TO R1 | Requested-Agent override values updated to R1. |
| G7 detailed table and diagram | RESTORED + UPDATED TO R1 | R1 session key retained; session ID marked not recorded. |
| G8 detailed table and diagram | RESTORED + UPDATED TO R1 | Agent/session validation path retained. |
| G9 detailed table and diagram | RESTORED + UPDATED TO R1 | Effective Agent is `main`. |
| G10 detailed table and diagram | RESTORED + UPDATED TO R1 | Send policy outcome is allow; rationale gaps retained where branch internals are not logged. |
| G11 detailed table and diagram | RESTORED + UPDATED TO R1 | New dispatch path, R1 run ID. |
| G12 detailed table and diagram | RESTORED + UPDATED TO R1 | Work admission path retained. |
| G13 detailed table and diagram | RESTORED + UPDATED TO R1 | Runtime context values updated to R1. |
| G14 detailed table and diagram | RESTORED + SOURCE ANCHOR CORRECTED | Canonical upstream anchors use `chat.ts:4788--4797` and `dispatch.ts:528--583`. |
| G15 detailed table and diagram | RESTORED + UPDATED TO R1 | Context finalization path retained; full context marked not recorded where applicable. |
| G16 detailed table and diagram | RESTORED + SOURCE ANCHOR CORRECTED | Broad `1215--4080` primary anchor replaced with the checked entry anchor `1215--1228`; later flow described as surrounding source flow. |
| G17 detailed table and diagram | RESTORED + SOURCE ANCHOR CORRECTED | Canonical upstream anchor uses `dispatch-from-config.ts:1422--1427`. |
| G18 detailed table and diagram | RESTORED + SOURCE ANCHOR CORRECTED | Resolver selection anchor uses `dispatch-from-config.ts:3381--3384`; broad invocation flow is described separately. |
| Full G0--G18 framework figures | RESTORED + UPDATED TO R1 | Old figure labels retained in structure; R1 label names cleaned where visible. |
| Post-G18 source path | RESTORED + UPDATED TO R1-R7 | AR vocabulary preserved; evidence now comes from controlled runs. |
| Repeated Weather runtime evidence | RESTORED AS HISTORICAL NOTE | Old quantitative weather table intentionally replaced; Weather is artifact-only context in this revision. |
| Cake2 boundary status | RESTORED AS HISTORICAL NOTE | Old Cake2 is historical/provenance only, not current quantitative evidence. |
| Controlled cohort tables | RESTORED + UPDATED TO R1-R7 | Current generated R1-R7 tables included in the appendix after the detailed audit. |
| Experimental settings | RESTORED + UPDATED TO R1 | Environment wording uses `OpenClaw v2026.7.1-2 (0790d9f) with a TraceClaw instrumentation patch applied`. |
| Reproduction parameters | RESTORED + UPDATED TO R1 | Authentication mode corrected to shared-token/operator.write. |
| Artifact checklist | RESTORED + PRIVACY REDACTED | Author-identifying repository and demo links remain anonymized. |
| Figure improvement notes | RESTORED | Kept from old appendix with current wording. |

## References From Main Text

The main paper refers to the supplementary appendix as the location of the detailed R1 per-stage source audit and upstream 0790d9f source anchors. Those references are now true: `paper/appendix.tex` contains full G0--G18 subsections and corrected G14/G16/G17/G18 anchors.

## Items Intentionally Not Restored Verbatim

- The old Cake2 quantitative treatment was not restored as the current case study because R1 is now the controlled detailed case.
- The old Weather repeated-run quantitative table was not restored because Weather is historical context, while R1--R7 are the controlled cohort.
- Author-identifying links, raw recipient email, local absolute paths, and personal names remain redacted.
