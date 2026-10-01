# Revision Report

Branch: `revision-r1-r7-controlled`

Current paper commit checked by CI: `4eac6c4caf1ffda4e19681138e98a7ac39ba8e77`

Paper Build CI: `36830890606`

CI URL: https://github.com/Chi123Zhang/openclaw-gateway-trace/actions/runs/36830890606

CI result: `success`

Uploaded artifact: `traceclaw-paper-pdfs`

Artifact status: uploaded and not expired at check time.

## What Was Rebuilt

The appendix was restored from the pre-revision long appendix at
`24aba06^:paper/appendix.tex` and then updated to the controlled R1--R7
evidence model.

The previous long appendix had 15,263 lines. The restored appendix now has
15,198 lines and compiles to 92 PDF pages. This confirms that the detailed
G0--G18 source-level audit was restored rather than replaced by a short
summary.

## Files Modified In The Final Restoration

- `paper/appendix.tex`
- `artifacts/controlled/claim-check.md`
- `artifacts/full-appendix-restoration-report.md`
- `artifacts/revision-report.md`

Earlier commits on the same branch contain the controlled R1--R7 paper
revision, generated controlled tables, source-anchor audit, and main-paper
updates.

## Appendix Content Restored

- Reading guide and evidence-label definitions.
- Concrete R1 value table.
- Detailed G0--G18 stage audit with longtables, pseudocode, source anchors,
  runtime values, branch decisions, not-taken branches, and evidence labels.
- Full G0--G18 framework diagrams.
- Post-G18 AR vocabulary and evidence.
- R1 no-tool AR ledger.
- R3 external-side-effect AR ledger with five `bash` calls.
- Compact AR summaries for R2/R4/R5/R6/R7.
- R1--R7 controlled cohort tables.
- Historical notes for old Cake2 and Weather traces.
- Experimental settings, reproducibility checklist, anonymous artifact notes,
  and figure-improvement notes.

See `artifacts/full-appendix-restoration-report.md` for the itemized
RESTORED / RESTORED+UPDATED / RESTORED+SOURCE ANCHOR CORRECTED inventory.

## Evidence Corrections Applied

- R1 is the detailed case, replacing the old Cake2 case for current
  quantitative claims.
- R1 G0--G3 now use shared-token authentication, `G1 allow`, no device-token
  fallback, role `operator`, scope `operator.write`, and the ordinary G3
  required-scope check.
- Old Cake2 is historical only. Its device-token / `operator.admin` path is
  retained only as provenance context.
- Historical Weather is artifact-only context. Current quantitative claims cite
  the controlled R1--R7 cohort.
- G14/G16/G17/G18 anchors use the upstream 0790d9f source ranges recorded in
  `artifacts/controlled/source-anchor-audit-r1.csv`; broad ranges are no longer
  presented as primary source anchors.
- AR6 is marked source-derived for the G16/G14 resume after
  `reply_resolver_returned`.
- R3 is limited to host-side command completion. The paper does not claim
  downstream email delivery.

## Post-restoration Stale-value Cleanup

After restoring the long appendix, a surgical cleanup pass removed inherited
Cake2 concrete values that had survived inside R1-specific text. This was a
value-correction pass only; the long G0--G18 audit structure, tables, figures,
source anchors, and AR material were preserved.

Cleaned values:

- `deviceTokenCandidate = present` in G0/G2 R1 value blocks was replaced with
  `deviceTokenCandidate = NOT RECORDED`.
- `state.deviceTokenCandidate = present` was replaced with
  `state.deviceTokenCandidate = NOT RECORDED`.
- `R1: isDeviceTokenAuth = True` was replaced with
  `R1: isDeviceTokenAuth = False`, source-derived from the shared-token path and
  not-reached device-token fallback.
- The explicit device-token verification subpath now marks R1 as
  `NOT REACHED`; `tokenCheck.ok` is `NOT RECORDED / NOT APPLICABLE`.
- `session_load_ms = 4.572` and `Session-load duration is 4.572 ms` were
  replaced with `session_load_ms = NOT RECORDED`.
- Hybrid session IDs such as `NOT RECORDED-...` were replaced with plain
  `NOT RECORDED`.
- Redacted local Session store paths were replaced with `store_path = NOT RECORDED`
  / `storePath = NOT RECORDED`.
- Diagram timings `ACK: 0.219 ms` and `title sync: 6655.825 ms` were replaced
  with `NOT RECORDED`.
- `available tools: 33` / `availableTools = 33` was replaced with
  `available tools: NOT RECORDED`; the runtime-observed value is only
  `tools invoked in R1: 0`.

Evidence basis:

- `artifacts/controlled/controlled-runs.json`, R1 G0--G3 stage rows.
- R1 run summary fields: `tools=none`, `toolCount=0`, empty `sessionId`.
- `paper/appendix.tex` source branch context for not-reached device-token and
  admin-shortcut branches.

The detailed cleanup table is recorded in
`artifacts/controlled/claim-check.md`.

## Evidence-verification Pass

Saved evidence was checked in this order: raw R1 trace
`data/cases/latest-live.js@a68e6d7`, generated controlled evidence in
`artifacts/controlled/controlled-runs.json`, other saved R1 runtime/native
fields, audit/provenance artifacts, and finally upstream source for
source-derived claims.

Generated verification artifacts:

- `artifacts/controlled/appendix-value-verification.csv`
- `artifacts/controlled/r1-coverage-verification.csv`
- `artifacts/controlled/appendix-value-verification-summary.md`

Verification counts:

- MATCH: 230
- MISMATCH_FIXED: 30
- NOT_RECORDED: 58
- SOURCE_DERIVED: 4
- AUDIT_DERIVED: 0

Corrections made during this pass:

- Removed claims that R1 runtime records `hasDeviceTokenCandidate=False`; raw R1
  runtime events do not contain that field.
- Removed stale G0/G1/G2/G3 figure claims inherited from the old Cake2 path:
  R1 is now consistently written as shared-token `G1 allow`, G2 shared-token
  pass, and G3 `operator.write` authorization with no `operator.admin`
  shortcut.
- Removed remaining G2 device-token residues: the R1 trace does not record a
  concrete `deviceTokenCandidate` or `hasDeviceTokenCandidate`, and
  `token_check.ok` is not applicable because the device-token verification
  branch is not reached.
- Kept `deviceTokenCandidate` as `NOT RECORDED`.
- Kept device-token fallback as not reached only where supported by observed
  shared-auth success plus upstream source.
- Kept Gateway G7 `entry.sessionId`, `session_load_ms`, and `storePath` as
  `NOT RECORDED`.
- Distinguished the AR-layer `sessionId` recorded in Agent Runtime events from
  the Gateway G7 `entry.sessionId`; it is not used to fill G7.
- Kept available-tool inventory as `NOT RECORDED`, while retaining the
  runtime-observed invoked-tool count `0`.

Coverage recomputation from the final per-stage ledger:

- R1 cov: 19/19
- R1 obs: 19/19

The NOT RECORDED subfields do not reduce R1 coverage because each G0--G18 stage
still has a source anchor and at least one concrete case value. Coverage is
stage-level, not a count of every internal predicate or returned field.

## Main-only Completeness Restoration

The main paper was expanded without reintroducing old Cake2 or historical
Weather quantitative claims. The old baseline at `b375dd68:paper/main.tex`
has 56,393 characters; the compressed controlled revision had 29,728
characters; the restored controlled main now has 40,459 characters before
final CI. The added prose restores motivation, related-work positioning,
method semantics, R1-as-baseline explanation, AR-layer interpretation,
R2/R3/R4 experiment analysis, repeatability interpretation, provenance
strength, and limitations.

Specific consistency decisions:

- `cov=19/19` means each Gateway stage has at least one verified source
  anchor and at least one concrete run value. It does not mean every field is
  recorded.
- `obs=19/19` means each Gateway stage outcome is directly observed. R1 still
  has rationale-level gaps; the stage matrix marks 19/19 Gateway stages as
  `partial` rationale visibility.
- R1 `hasDeviceTokenCandidate` is not recorded in the saved trace. The trace
  records `hasDeviceIdentity=False`; those fields are not interchangeable.
- R1 Gateway `sessionKey` is recorded. Gateway `sessionId` is empty/not
  recorded; AR-layer `sessionId` exists but is not used to fill Gateway G7.
- R6/R7 have direct before/after OpenClaw fingerprint checks. R1--R5 are
  verified from TraceClaw repository history and saved traces, with
  OpenClaw-side provenance reconstructed from audit notes and the saved patch.
- The long appendix keeps both per-stage ledgers and flow diagrams. Duplicate
  outline titles for G3--G18 were renamed so the second occurrence is labeled
  `Flow Diagram`.

## Main Paper References

`paper/main.tex` refers to the supplementary appendix as the home of the
detailed R1 per-stage source audit and upstream 0790d9f source anchors. Those
references are true after this restoration: `paper/appendix.tex` contains full
G0--G18 stage subsections and corrected source anchors.

## Local Validation

Passed:

- `python3 scripts/validate_repeated_weather_runs.py`
- `python3 -m json.tool artifacts/controlled/controlled-runs.json`
- generated and parsed `artifacts/controlled/appendix-value-verification.csv`
- generated and parsed `artifacts/controlled/r1-coverage-verification.csv`
- CSV parse check for:
  - `artifacts/controlled/controlled-runs.csv`
  - `artifacts/controlled/stage-matrix.csv`
  - `artifacts/repeated-run-validation.csv`
- `git diff --check`
- Source grep over `paper/`, `artifacts/controlled/`, and
  `artifacts/full-appendix-restoration-report.md` for old run/session IDs,
  real recipient email, local absolute path prefix, personal names, and invalid
  R1 device-token leftovers.
- Post-cleanup stale-value grep for `deviceTokenCandidate = present`,
  `isDeviceTokenAuth = True`, `tokenCheck.ok = True`,
  `session_load_ms = 4.572`, `4.572`, `0.219`, `6655.825`,
  `available tools: 33`, `NOT RECORDED-`, `2e18`, and `432df4352674`.
  No invalid hits remained. The only remaining primary grep hits were source
  branch definitions for `explicit-device-token` and `admin_scope_required`.

Local PDF build was not run because `xelatex`, `latexmk`, and `tectonic` are
not installed on this machine. Docker is installed but the current process
cannot connect to the Docker API socket. No `latexmk -f` or error-suppression
path was used.

## CI Validation

GitHub Actions Paper Build run `36830890606` passed on commit `4eac6c4`.

The workflow completed:

- checkout
- Python setup
- repeated-run validation regeneration
- generated artifact checks
- XeLaTeX build of `paper/main.tex`
- XeLaTeX build of `paper/appendix_main.tex`
- upload of `traceclaw-paper-pdfs`

Downloaded CI artifact page counts:

- `main.pdf`: 12 pages
- `appendix_main.pdf`: 92 pages

PDF text extraction found no unresolved `??`, old Cake2 run/session IDs, real
recipient email, local absolute paths, personal names, or stale R1 branch
claims such as `G1 = deny`, `authResult.ok = False`,
`admin_scope_present = True`, and `admin_shortcut_taken = True` in the
generated PDFs.

## Grep Classification

No invalid hits remain for:

- `808b4380`
- `af48dd1c`
- `f73617ed`
- real recipient email
- local absolute path prefix
- author-identifying personal names
- `not_authorized`
- `G1 result deny`
- `authMethod = "device-token"` as an R1 value
- `device_token_candidate = present`
- `hasDeviceTokenCandidate=True`
- runtime claims that `hasDeviceTokenCandidate=False` is recorded by R1
- `explicit device token is present`

Remaining `device-token`, `operator.admin`, and `admin shortcut` source hits are
legitimate because they are either source-code branch conditions, R1 not-taken
branch evidence, or the explicitly marked historical Cake2 note.

Stages with at least one `NOT RECORDED` / not-recorded field in the restored
appendix:

- G0
- G1
- G2
- G4
- G7
- G8
- G12

## Open Issues

- Future traces should embed `openclawCommit`, `traceclawCommit`,
  `traceSchemaVersion`, and `configFingerprint` directly in the trace metadata.
- The current controlled cohort contains successful requests only. Rejected,
  failed, retried, cancelled, and cross-version paths are still needed before
  broader claims.
- The missing `artifacts/audit/anchor-content-audit.csv` was not present in this
  branch or reachable git history inspected here. Current anchor claims are
  therefore tied to `artifacts/controlled/source-anchor-audit-r1.csv`.
- If any raw audit working directory is packaged for submission, rerun the same
  privacy scan over the package before release.

## Reviewer-Critique Cleanup

Applied after the successful `4eac6c4` CI build:

- Removed paper-facing commit hashes, branch names, and run-ID prefixes from
  `paper/main.tex` and the main-paper cohort tables. The main text now refers
  to saved trace artifacts and anonymous artifact metadata instead.
- Reworded R3/R6 tool-policy claims so observed evidence is limited to
  `bash` execution and command completion; the effective tool-policy permission
  is marked source-derived.
- Added the R1 `hasDeviceIdentity=False` device-identity clarification in the
  main R1 case and corrected the appendix G2 device-identity line to
  `not applicable`.
- Replaced the low-information main-paper stage matrix with a compact
  rationale-gap table. The full matrix remains appendix material.
- Added an appendix rationale-visibility summary for G0--G18.
- Expanded R2/R4 runtime analysis with concrete tool sequences and timestamps,
  and recorded those statements in `artifacts/controlled/claim-check.md`.
- Reordered references so tracing, provenance, slicing, and invariant-mining
  literature appears before OpenClaw background articles.

Local LaTeX build is still unavailable because no TeX executable is installed.
GitHub Actions Paper Build run `36836680584` passed on commit `9bf75dd` and
uploaded `traceclaw-paper-pdfs`.

Downloaded CI artifact page counts:

- `main.pdf`: 12 pages
- `appendix_main.pdf`: 93 pages

PDF text scans found no hits in the main PDF for commit hashes, the temporary
branch name, run-ID prefixes, the old AI-style phrases listed in the critique,
or the overstated tool-authorization wording. Appendix PDF scans found no hits
for the stale R1 device-token/admin claims, old Cake2 timings, real email,
local absolute paths, or personal names.

## Targeted Completion and Style Pass

### Checklist

1. DONE / VERIFIED
   - File: `paper/main.tex`
   - Section: `Controlled Experiments / Cohort and Provenance`
   - Description: R1--R5 inclusion basis now rests on unchanged TraceClaw
     collection/instrumentation code and saved trace artifacts. Matching
     G0--G18 branch structure is described only as an experimental result.
   - Evidence source: `git diff --name-status a68e6d7 7d742df`; `git log
     --name-only a68e6d7..7d742df`, which showed only
     `data/cases/latest-live.js`, `data/cases/recent-runs.js`, and `index.html`.

2. DONE / VERIFIED
   - File: `paper/main.tex`
   - Section: `Controlled Experiments / Historical Weather Supplement`
   - Description: Added a small supplementary historical Weather analysis
     without mixing Weather into R1--R7 quantitative scores.
   - Evidence source: `artifacts/repeated-run-validation.csv`,
     `artifacts/repeated-run-validation.json`, and
     `git show 0369051:data/cases/latest-live.js`.
   - Verified counts: New York Weather = 6 saved traces; 4 use only
     `web_search`; 2 use `bash + web_search`. Beijing Weather = 1 separate
     historical trace with `bash + web_search`; it is excluded from the New
     York count.

3. CORRECTED
   - File: `paper/appendix.tex`
   - Sections: `G7`, `G8`, `G12`
   - Description: Corrected unsupported SessionEntry wording. The final R1
     SessionEntry evidence status is: Gateway canonical Session key and G7/G8/G12
     outcomes are runtime-observed; loaded `entry`, `entry.sessionId`,
     `storePath`, Gateway `sessionId`, backing Session ID, and admitted Session
     ID are `NOT RECORDED`; continued G8/G12 control flow is source-derived
     evidence only. AR-layer Session ID remains separate.
   - Evidence source: R1 rows in `artifacts/controlled/controlled-runs.json`,
     raw saved R1 trace, and upstream source anchors in the appendix.

4. DONE / VERIFIED
   - Files: `paper/main.tex`, `paper/appendix.tex`,
     `artifacts/controlled/rationale-visibility-summary.csv`,
     `artifacts/controlled/claim-check.md`
   - Section: `Gateway Coverage and Observation`; appendix reading guide
   - Description: Re-evaluated G0--G18 rationale visibility. Final counts:
     `full=0/19`, `partial=19/19`, `source-derived=0/19`.
   - Evidence source: `artifacts/controlled/rationale-visibility-summary.csv`
     and R1 stage rows in `artifacts/controlled/controlled-runs.json`.

5. DONE / VERIFIED
   - Files: `paper/main.tex`, `paper/appendix.tex`
   - Sections: title page, execution-class table, limitations, introduction,
     references
   - Description: Date remains October 2026; Table 3 uses short labels rather
     than truncated prompts; the appendix-length meta-commentary remains removed;
     introduction provenance detail stays in the controlled-cohort subsection;
     scholarly references remain before informal OpenClaw background articles.
   - Evidence source: source scan over `paper/main.tex` and generated table inputs.

6. DONE
   - Files: `paper/main.tex`; prose-only edits in `paper/appendix.tex`
   - Sections: main prose and appendix prose paragraphs
   - Description: Performed a constrained style pass after factual edits. The
     pass removed targeted rhetorical patterns, used active voice where natural,
     and preserved claims, counts, labels, equations, tables, and section
     structure.
   - Evidence source: `rg` scan for the targeted style phrases returned no hits
     in `paper/main.tex` or `paper/appendix.tex`.

### Style Pass

1.
BEFORE:
"An LLM agent request is not just a model call."
AFTER:
"An LLM agent request includes more than a model call."
Reason:
removed rhetorical "not just" setup.

2.
BEFORE:
"This is the motivation for the paper."
AFTER:
"We start from a simple concern: a final answer can be acceptable while the path
that produced it remains hard to justify."
Reason:
clearer subject and first-person plural.

3.
BEFORE:
"Its core idea is simple: each stage of a concrete request should be a small
claim that can be checked."
AFTER:
"We write each stage of a concrete request as a small checkable claim."
Reason:
active voice and fewer formulaic words.

4.
BEFORE:
"TraceClaw does not only ask what executed or where an artifact came from; it
asks which concrete value selected a control-plane branch..."
AFTER:
"TraceClaw asks which concrete value selected a control-plane branch..."
Reason:
removed "not only" contrast while preserving the distinction.

5.
BEFORE:
"This distinction is important because it is exactly the kind of mistake a
source-anchored ledger is meant to prevent."
AFTER:
"The source-anchored ledger prevents a common mistake here."
Reason:
clearer subject and less rhetorical framing.

6.
BEFORE:
"The relevant runtime evidence is not just the final summary."
AFTER:
"The runtime evidence extends beyond the final summary."
Reason:
removed "not just" pattern.

7.
BEFORE:
"This demonstrates why a Gateway-only ledger is incomplete."
AFTER:
"A Gateway-only ledger can say how the request reached the resolver. The AR
layer shows that the answer used external retrieval events..."
Reason:
replaced "This demonstrates" with concrete subjects.

8.
BEFORE:
"The important evidence in R4 is the boundary between permission and effect."
AFTER:
"R4 separates permission from effect."
Reason:
shorter sentence with concrete subject.

9.
BEFORE:
"A normal success log might tempt a reader to say the email was sent."
AFTER:
"A normal success log might invite a downstream-delivery inference."
Reason:
removed over-specific phrasing that could be read as a delivery claim.

10.
BEFORE:
"This limitation is not cosmetic."
AFTER:
"This provenance limit affects the strength of the claims."
Reason:
more precise subject and less rhetorical emphasis.

### Validation Before CI

- `python3 scripts/validate_repeated_weather_runs.py`: passed; recovered 6
  historical New York Weather traces.
- JSON parse checks passed for `artifacts/repeated-run-validation.json` and
  `artifacts/controlled/controlled-runs.json`.
- CSV parse checks passed for `artifacts/repeated-run-validation.csv`,
  `artifacts/controlled/rationale-visibility-summary.csv`,
  `artifacts/controlled/appendix-value-verification.csv`, and
  `artifacts/controlled/r1-coverage-verification.csv`.
- `git diff --check`: passed.
- Privacy/stale-claim scans over main paper, appendix, and generated table
  inputs found no main-paper commit hashes, branch names, run-ID prefixes,
  local paths, personal email addresses, stale device-token/admin claims,
  unsupported SessionEntry claims, or targeted style phrases.

Local LaTeX build remains unavailable because no TeX executable is installed.
GitHub Actions Paper Build is required for final PDF validation.

### Final CI Validation

Content commits:

- `99b6b4e`: completed evidence cleanup and style pass.
- `61d2a01`: fixed the standalone appendix draft date to October 2026.

GitHub Actions Paper Build run `36839715469` passed on commit `61d2a01`.

CI URL:

- https://github.com/Chi123Zhang/openclaw-gateway-trace/actions/runs/36839715469

Downloaded CI artifact page counts:

- `main.pdf`: 13 pages
- `appendix_main.pdf`: 93 pages

Final PDF text scans found no unresolved `??`, author-identifying commit hashes,
temporary branch names, controlled run-ID prefixes, local `/Users/` paths,
personal email addresses, personal names, stale R1/Cake2 device-token/admin
claims, unsupported SessionEntry claims, the old August 2026 date, or the
targeted style-pass phrases.
