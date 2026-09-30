# TraceClaw Paper Sources

This directory mirrors the paper sources used for the current draft.

- `main.tex` builds the main paper.
- `appendix_main.tex` builds the supplementary appendix and inputs `appendix.tex`.
- `references.bib` stores anonymized bibliography entries for double-blind review.

The GitHub Actions workflow `.github/workflows/paper-build.yml` checks the
repeated-weather-run evidence and then compiles both PDFs with XeLaTeX.

When editing the paper outside this repository, sync the changed `.tex` and
`.bib` files back into this directory before relying on CI.
