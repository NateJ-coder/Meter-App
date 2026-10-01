# Capture Logic Review

## Current Mobile Capture Reconciliation - 2026-10-01

The workbook cleaning pipeline produces review artifacts; it does not reconcile
the live `mobile_captures` collection. The historical web-module description
below is not the active Android capture implementation.

Genesis reconciliation run `genesis-2026-10-01-label-reconciliation` updated
75 existing captures transactionally, after checking their pre-change state:

- 74 label changes across 31 August (62) and 30 September (12).
- Six changes supported by photo serial comparisons: the Unit 30 and Unit 61
  August typos, E1822 spacing, both hydrant aliases, and the main-water alias.
- The other 68 changes normalize existing unit-label formatting only. They
  are not claims that those photos were individually identity-verified.
- Three pending-review flags cover August/September Unit 9 and September
  Unit 61. No replacement readings were approved: display OCR was inconclusive.
- No numeric readings, original photos, photo links or capture timestamps
  were changed. All 209 records were re-read from the server to verify this.

The private Downloads backup `genesis-before-reconciliation-2026-10-01.json`
contains all 209 original records and matches the independently saved snapshot.
It contains photo access links, not image bytes; do not publish it to GitHub.
Original labels and readings are also retained on corrected documents, with
author, reason, timestamp and before/after values in `officeCorrections`.

Pending numeric checks:

- Unit 61: raw September `0813240.9` versus August `081015.2`, serial `06053001`.
- Unit 9: raw September `053048.8` versus August `083018.5`, serial `06069090`.
- A likely typo is not sufficient evidence to rewrite a meter reading.

The local dashboard now uses `assets/capture-corrections.mjs` to retain raw
evidence and reject stale edits. History checks run across the loaded building's
captures before month filtering, distinguish meter types, and flag decreasing,
unchanged and tenfold readings. Genesis unit electricity comparisons retain
the established whole-number policy on both sides of the comparison. Duplicate
timestamps are flagged rather than used as an arbitrary baseline.

Office warnings and correction history are displayed and included in the
review export. These checks are dashboard-side, not an automatic backend OCR
or reconciliation job. The source changes must be deployed before users receive
the new dashboard behavior; the live data repair is already applied.

Validation: `node scripts/check-capture-corrections.mjs` passed. Isolated browser
tests with mocked Firebase verified warning rendering, audited edits, raw-value
retention, stale-edit rejection, HTML escaping and audit export. No test writes
were made to production.

## Historical Web Modules

This review compares old capture behavior in reader-old.html with the active capture stack in reader.html, assets/on-site-mode.js, and assets/capture-shared.js.

## Strengths retained from old logic

- Sequential workflow continuity:
  - Meter-to-meter flow is retained and still supports fast field operation.
- Reader-driven correction capability:
  - Current flow preserves user ability to correct capture context while submitting (previous baseline override, meter-replaced toggle, meter info correction, skip/issue capture).
- Simple capture completion model:
  - Save -> sync -> move next is still preserved, now with stronger sync guarantees.

## Weaknesses intentionally removed

- Hard requirement for text photo reference:
  - Old flow forced text-only photo references and had no resilient media handling.
  - New flow uses real file capture with Firebase/local fallback and explicit no-photo controls.
- Rigid baseline assumptions:
  - Old flow always assumed previous reading baseline with limited correction controls.
  - New flow supports meter replacement and explicit previous-reading correction before consumption calculation.
- Single-path skip handling:
  - Old flow had limited issue modeling.
  - New flow supports structured skip reasons, issue flags, and traceable review metadata.

## Workbook intelligence pushed into phone capture

The phone app now consumes workbook-derived policy hints from:

- source-documents/03-extracted-outputs/gemini-cleaning/ud-extraction-and-data-check-normalized-latest.json

via:

- assets/workbook-capture-policy.js

Applied behavior in both reader and on-site flows:

- Displays capture policy hints (capture_required / skip_allowed / client_submitted) per meter match.
- Keeps reader autonomy (no hard lock), but requires notes when user intentionally overrides skip/client-submitted policy by entering a manual reading.
- Writes policy metadata and override/conflict flags onto reading records for audit and downstream review.

## Current design stance

- Keep strengths: rapid field capture plus user-driven correction at point of capture.
- Discard weaknesses: brittle assumptions, missing context, and non-audited overrides.
- Enforce traceability: every policy-informed override is captured as structured metadata, not hidden behavior.
