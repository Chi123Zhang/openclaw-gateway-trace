# Revision Report

Branch: `revision-r1-r7-controlled`

Revision base: `b375dd68ee6af1adfa49d8148e14eba3041d14e9`

Push status: branch pushed to `origin/revision-r1-r7-controlled`.

Latest paper CI: GitHub Actions run `36814141719` succeeded on commit
`7a3c52e`. The workflow compiled both `paper/main.tex` and
`paper/appendix_main.tex` and uploaded the `traceclaw-paper-pdfs` artifact.

## Modified Files

- `paper/main.tex`
- `paper/appendix.tex`
- `paper/appendix_main.tex`
- `artifacts/controlled/controlled-runs.json`
- `artifacts/controlled/controlled-runs.csv`
- `artifacts/controlled/stage-matrix.csv`
- `artifacts/controlled/controlled-cohort-table.tex`
- `artifacts/controlled/execution-classes-table.tex`
- `artifacts/controlled/stage-run-matrix-r1-r7.tex`
- `artifacts/controlled/ar-metrics-table.tex`
- `artifacts/controlled/repeatability-table.tex`
- `artifacts/controlled/r1-stage-ledger-table.tex`
- `artifacts/controlled/claim-check.md`

Follow-up layout fix:

- `artifacts/controlled/controlled-cohort-table.tex`
- `artifacts/controlled/execution-classes-table.tex`
- `paper/main.tex`

## Sections Changed

- Main paper rewritten around the controlled R1--R7 cohort.
- R1 replaces the old Cake2 trace as the primary controlled case.
- Experiments now use the requested structure: cohort/provenance, Gateway coverage and observation, execution classes, R2 retrieval, R4 local mutation, R3 external side effect, exact-prompt repeatability, stage matrix, audit findings, and coverage limits.
- Appendix rewritten as controlled cohort evidence rather than a long old-Cake2 source note.
- Appendix title changed to `Controlled Cohort Evidence`.

## Claims Removed or Weakened

- Removed old Weather quantitative tables from the main paper.
- Removed old Cake2 from quantitative scoring.
- Old Cake2 is now historical only: earlier instrumentation, device-token/operator-admin path, excluded from R1--R7 quantitative results.
- Weather is historical only: useful note about tool-path variation, no scores.
- Removed any claim that R3 proves email delivery. It now says only that the host-side Apple Mail command completed with exit code 0; downstream delivery was not verified.
- Weakened G3 scope wording: source establishes an administrator-scope shortcut and an `operator.write` requirement, but the traces do not prove authentication method alone determines scope.
- Clarified that `obs=19/19` means stage-outcome observation, not full predicate/rationale visibility.

## Evidence and Metrics

- Generated controlled cohort data from saved trace commits R1--R7.
- R1--R7 all have `cov=19/19` and `obs=19/19` at Gateway stage-outcome level.
- Rationale visibility is treated as partial for controlled Gateway stages.
- R1/R7 and R5/R6 exact-prompt repeatability checks show no G0--G18 branch differences, with matching Agent, resolver, tool/no-tool choice, stop reason, and AR structure.
- AR-layer metrics are reported over AR0--AR6 separately from the Gateway 19-stage denominator.
- AR2 treats no-tool as an observed no-tool outcome and reports tool-call-level result ratios separately.
- AR6 is marked source-derived.
- Full quantitative mapping is in `artifacts/controlled/claim-check.md`.

## Redactions

- Paper and `artifacts/controlled/` redacted the real recipient email, sender name, usernames, hostnames, and absolute local paths.
- `artifacts/audit/` is described as a working audit directory, not a submission bundle.
- If audit-derived files are copied into a submitted artifact, they must be redacted before packaging.

## Validation Results

Passed:

- `python3 scripts/validate_repeated_weather_runs.py`
- `python3 -m json.tool artifacts/repeated-run-validation.json`
- `test -s artifacts/repeated-run-validation.csv`
- `test -s artifacts/weather-run-comparison-table.tex`
- `test -s artifacts/coverage-observation-table.tex`
- `test -s artifacts/stage-run-matrix.tex`
- `python3 -m py_compile scripts/*.py collector/*.py instrumentation/openclaw-v2026.7.1-2/*.py`
- `node --check` for `config.js`, `data/*.js`, `data/cases/*.js`, and `assets/*.js`
- `git diff --check`
- Privacy grep for real recipient email, absolute local path prefix, sender name, old Cake2 run ID, old Cake2 session ID, and the old administrator-shortcut wording in `paper/` and `artifacts/controlled/`

Not completed locally:

- Local PDF build could not run because this machine does not have `latexmk` or `xelatex` on PATH.
- Docker was present but the Docker daemon was not running, so a LaTeX container could not be used locally.
- No `latexmk -f` or error-suppression path was used.

Completed through CI:

- Paper Build run `36813656470` first compiled both PDFs and uploaded
  `traceclaw-paper-pdfs`.
- Visual PDF smoke check found that the controlled-cohort tables on main page 5
  and appendix page 1 extended too far horizontally.
- Commit `7a3c52e` shortened the tool columns to count summaries and clarified
  the main-table caption.
- Paper Build run `36814141719` then compiled both PDFs and uploaded
  `traceclaw-paper-pdfs`.
- Downloaded artifact: `/tmp/traceclaw-paper-pdfs-36814141719/`.
- Downloaded files: `main.pdf` (8 pages, A4) and `appendix_main.pdf` (6 pages, A4).
- Rendered and visually checked representative pages: main page 5, main page 6,
  appendix page 1, appendix page 3, and appendix page 6. The checked tables no
  longer overflow the page.

## Open Issues

- Add trace-embedded `openclawCommit`, `traceclawCommit`, and `configFingerprint` in future collection code.
- Run rejected, failed, retried, cancelled, and cross-version cases before making broader coverage claims.
- If the submitted artifact includes any raw audit material, run the same privacy redaction scan over that package.
