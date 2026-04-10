# Workbook Sheet Summaries

This folder contains one comprehensive summary file per sheet from the encrypted legacy Utility Dash workbook:

- Source workbook: `legacy-ud/workbook-exports/Utility Dash 9 Mar 2026.xlsm`
- Workbook password used for decryption: available in the generation logic
- Generator: `DataMigration/logic/generate_workbook_sheet_summaries.py`

## Files

- `*.summary.json`
  One summary file per sheet.

- `summaries-manifest.json`
  Index of all generated summaries, including sheet category and formula counts.

## Summary Contents

Each summary file includes:

- workbook and sheet metadata
- entities and their inferred meanings
- categories and domains
- attributes and time-series structure
- payload data copied from the extracted sheet JSON
- formulas captured from the decrypted workbook, including cached values when available
- related VBA source file references and detected procedures

## Notes

- Building sheets use both the normalized sheet exports and the decrypted workbook formulas.
- Support sheets are summarized from the extracted raw rows, decrypted workbook formulas, and matching VBA modules where available.
- If the workbook, VBA exports, or extracted JSON files change, regenerate this folder by rerunning the generator script.