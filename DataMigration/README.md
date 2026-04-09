# DataMigration

This folder is the dedicated workspace for sheet-by-sheet JSON migration from the legacy Utility Dash workbook into Meter App data.

## Purpose

Use this folder when extracting, cleaning, transforming, and validating per-sheet JSON before loading app-native payloads into the app.

## Structure

- `inputs/sheet-json/`
  Place one workbook-clean JSON file per sheet here.
  Example: `hazelmere.sheet.json`

- `logic/`
  Place sheet-to-app transformation scripts here.
  This is the working area for migration code that consumes the per-sheet JSON files.

- `outputs/sheet-normalized/`
  Place cleaned and normalized per-sheet JSON here after your transformation logic runs.
  Example: `hazelmere.normalized.json`

- `outputs/app-payloads/`
  Place final app-native payload JSON files here when they are ready for import into the app.
  Example: `utility-dash-app-payload.json`

- `outputs/reviews/`
  Place review artifacts here, such as unresolved-date files, mismatch reports, and manual-check CSVs.

## Recommended Workflow

1. Export one workbook sheet to JSON.
2. Save that file into `inputs/sheet-json/`.
3. Run migration logic from `logic/`.
4. Save the cleaned sheet result into `outputs/sheet-normalized/`.
5. Save final import-ready app payloads into `outputs/app-payloads/`.
6. Save anything requiring human review into `outputs/reviews/`.

## Current Scope

- electricity only
- legacy Utility Dash workbook migration
- per-sheet JSON normalization
- app-native payload generation
- review and reconciliation artifacts

## Notes

- Keep raw workbook JSON close to the workbook structure.
- Preserve source sheet names, row numbers, raw dates, and raw labels.
- Do not calculate app IDs manually in the input files.
- Use `outputs/reviews/` for anything ambiguous rather than dropping it.
