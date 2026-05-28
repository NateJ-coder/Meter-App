# Capture Logic Review (Old Web Module -> Current Phone Capture)

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
