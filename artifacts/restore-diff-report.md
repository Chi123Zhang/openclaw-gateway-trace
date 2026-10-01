# Restore Diff Report

Branch: `revision-r1-r7-controlled`

Completeness baseline: `24aba06^`

Evidence/correction baseline before restoration: `ad58771`

## Prerequisite Verification

Status: PASS.

- R1--R7 exist in `artifacts/controlled/controlled-runs.json` and
  `artifacts/controlled/controlled-runs.csv`.
- R6 exactly repeats R5 at the prompt level and keeps the same Gateway branch
  sequence, Agent, resolver, no-tool class, stop reason, and AR structure.
- R7 exactly repeats R1 at the prompt level and keeps the same Gateway branch
  sequence, Agent, resolver, no-tool class, stop reason, and AR structure.
- The R6/R7 collection report records PASS for the frozen environment:
  OpenClaw HEAD stayed `0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`, the
  instrumentation patch hash stayed
  `6736a6be821ae927ebb112328d9552386684d5cbd8090975f52cc8666d8ef11f`,
  and only trace data files plus `index.html` changed in the collection
  worktree.
- The trace artifacts still do not embed `openclawCommit`, `traceclawCommit`,
  or `configFingerprint`; the paper must keep distinguishing trace-native
  provenance from reconstructed source/audit provenance.

The audit source files used for this verification are in the working audit
checkout under `artifacts/audit/` in the original research worktree, not in the
public controlled revision branch.

## Main Paper Item Comparison

| Item | Status | Change / reason |
|---|---|---|
| Abstract | MODIFIED | Old abstract centered on old Cake2 and historical Weather. Current abstract correctly uses R1--R7. Keep current evidence, but restore some specificity from old motivation where safe. |
| Introduction | MODIFIED | Shortened substantially. The old motivation and control-plane framing remain correct. UNINSTRUCTED DELETION of explanatory material; restore selectively. |
| Research Questions and Contributions | MODIFIED | Current contribution wording is evidence-correct but shorter. Old nontriviality subsection was deleted without an evidence reason. Restore the nontriviality discussion with R1--R7 wording. |
| Related Work | MODIFIED | Kept Dapper, OpenTelemetry, PROV, slicing, dynamic slicing, Daikon, agent-debugging work, and Fangcun Observer, but shortened. No required deletion. Restore only where it improves distinction from tracing/provenance. |
| Method | MODIFIED | Current method keeps the formulas but removed the fuller step-by-step method, model explanation, trace-model figure, and positioning table. These were not obsolete. UNINSTRUCTED DELETION. Restore with controlled-cohort wording. |
| Trace model equations | KEPT | Current formulas remain, with corrected `obs` semantics. |
| Trace model figure | DELETED | Old `fig:trace-model` was removed without instruction. Restore with neutral request wording. |
| Positioning Against Common Approaches table | DELETED | Removed without instruction. Restore and update "Cake2" wording to R1/current controlled case. |
| Framework section | MODIFIED | Current section keeps a simple figure, but old framework prose and central figure were richer. Restore the richer discussion and keep R1/AR wording. |
| Case Study / Primary Case | MODIFIED | Old Cake2 primary case replaced by R1 as required. Keep current evidence-correct R1 version; do not restore old device-token/operator-admin claims. |
| Post-G18 / AR section | MODIFIED | Current AR section is evidence-correct but shorter. Restore the boundary explanation while preserving AR6 as SourceDerived and R3 caveats. |
| Experiments | MODIFIED | Old Cake2/Weather quantitative sections were intentionally removed/replaced by R1--R7 controlled evidence. Keep current controlled structure. |
| Weather quantitative tables | DELETED | Intentional deletion. Historical Weather must not be mixed with R1--R7 quantitative results. |
| Stage matrix | MODIFIED | Current compressed matrix retained; appendix must contain detailed evidence. |
| Limitations | MODIFIED | Current limitations correctly reflect controlled cohort and provenance caveats. Keep and enrich only if needed. |
| Reproducibility / Artifact Availability | MODIFIED | Old section was longer; current privacy/provenance wording is safer. Restore useful reproducibility detail in appendix, not identifying links. |
| References | KEPT | Current reference set keeps tracing/provenance/dynamic-analysis references. |

## Appendix Item Comparison

| Item | Status | Change / reason |
|---|---|---|
| Appendix Reading Guide | DELETED / PARTLY REPLACED | Current appendix has a short convention but not the old evidence-reading guide. UNINSTRUCTED DELETION. Restore with corrected labels. |
| Concrete runtime values | MODIFIED | Old Cake2 values removed. Correct action is to replace with an R1 concrete-value table. |
| Detailed G0--G18 source-level audit | DELETED | Old 15,000-line Cake2 audit was removed. It should not be restored as old Cake2 evidence, but the detailed audit function was required. UNINSTRUCTED DELETION of the evidence backbone. Rebuild for R1. |
| G0--G3 auth detail | DELETED / PARTLY REPLACED | Current appendix has only four bullets. Rebuild from R1 shared-token/operator.write path. |
| G4--G18 detail | DELETED / PARTLY REPLACED | Current appendix has only compressed ledger rows. Rebuild stage subsections using current R1 values and verified upstream anchors. |
| Post-G18 source/runtime evidence | DELETED / PARTLY REPLACED | Current AR definitions/metrics remain, but detailed AR evidence was lost. Rebuild AR ledgers for R1 and R3, keep compact tables for R2/R4/R5/R6/R7. |
| Full stage matrix | KEPT | Current controlled R1--R7 matrix is useful and should remain. |
| AR metrics | KEPT | Current AR denominator and AR6 SourceDerived treatment are corrected and should remain. |
| Execution classes | KEPT | Current execution-class table is useful and should remain. |
| Exact-prompt repeatability | NEW | Correct controlled evidence; keep. |
| Historical Cake2 detailed audit | DELETED | Intentional. Old Cake2 stays historical note only. |
| Historical Weather quantitative tables | DELETED | Intentional. Weather stays qualitative historical note only. |
| Experimental settings | DELETED | Useful old structure deleted without instruction. Restore with current provenance and "not recorded in trace" fields. |
| Artifact checklist | DELETED | Useful old structure deleted without instruction. Restore with anonymized/sanitized wording. |
| Figure improvement notes | DELETED | Not essential to evidence; may be omitted or kept as an open issue. |
| Privacy boundary | NEW | Correct and should remain. |

## Uninstructed Deletions

- Main trace-model figure.
- Main positioning-against-common-approaches table.
- Main "Why This Is Nontrivial" discussion.
- Most of the appendix evidence-reading guide.
- The functional role of the detailed G0--G18 source-level audit.
- The detailed AR source/runtime evidence.
- Experimental setting and artifact checklist details.

## Restoration Plan

- Restore main-paper explanatory material locally, without reviving old Cake2 or
  historical Weather quantitative claims.
- Rebuild appendix around R1, not old Cake2.
- Keep current controlled cohort tables, AR metrics, execution classes,
  repeatability, provenance caveats, G3 wording, R3 delivery caveat, and privacy
  boundary.
- Recreate stage-level evidence with concise longtables that cite upstream
  `0790d9f` anchors and current R1 values.

## Final Restoration Status

Restored in the working tree.

- `paper/main.tex` now restores the method steps, claim-level framing, trace
  model figure, positioning table, and richer framework discussion while keeping
  the corrected R1--R7 evidence model.
- `paper/appendix.tex` now contains a detailed R1 G0--G18 audit, a detailed
  AR-layer audit for R1 and R3, compact AR tables for R2/R4/R5/R6/R7, the full
  stage matrix, repeatability table, settings checklist, historical notes, and
  privacy boundary.
- `artifacts/controlled/source-anchor-audit-r1.csv` records the source anchors
  used by the restored R1 appendix.
- Old Cake2 remains historical only; historical Weather remains qualitative
  artifact context only.
- Local XeLaTeX could not be run because `latexmk` and `xelatex` are not on
  PATH. The next validation step is Paper Build CI after pushing the revision
  branch.
