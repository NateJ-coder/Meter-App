# Legacy Utility Dash Working README

## Files Currently In Scope

- legacy-ud/notes/migration-notes.md
- legacy-ud/vba-source/modules/I_CSV_Import.bas
- legacy-ud/vba-source/modules/I_Importing.bas
- legacy-ud/vba-source/modules/D_Breakdown_Data_Load.bas
- legacy-ud/vba-source/modules/D_BreakDown_Electricity.bas
- legacy-ud/vba-source/modules/T_Tolorance.bas
- source-documents/03-extracted-outputs/utility-dash/utility-dash-summary.csv
- source-documents/03-extracted-outputs/utility-dash/utility-dash-meter-register.csv
- source-documents/03-extracted-outputs/utility-dash/utility-dash-electricity-history.ndjson
- source-documents/03-extracted-outputs/utility-dash/utility-dash-charge-components.csv

## What We Have Done So Far

1. Cleaned up the extracted Utility Dash assets into a clearer folder structure under `legacy-ud/`.
2. Moved the decrypted workbook into `legacy-ud/workbook-exports/`.
3. Moved the exported VBA source into `legacy-ud/vba-source/`.
4. Added notes scaffolding in `legacy-ud/notes/`.
5. Created `migration-notes.md` to track migration-focused findings.
6. Listed all exported `.bas` and `.cls` files and confirmed that no `.frm` files were found.
7. Performed a filename-only triage of the VBA files into `Important`, `Maybe`, and `Ignore for now`.
8. Limited the first detailed pass to six important modules only.
9. Refocused the active migration slice to electricity only.
10. Located the existing Utility Dash extracted-output set under `source-documents/03-extracted-outputs/utility-dash/`.
11. Verified that the electricity history export contains embedded meter histories rather than only latest rows.
12. Quantified the current extraction risk: 56,543 electricity history points are present, but many dates are placeholders and some meters have no history array.
13. Extracted plain-English notes for each reviewed module using the following headings:
   - what the module seems to do
   - inputs it uses
   - outputs it creates or updates
   - business rules worth keeping
   - ignore / Excel-only behavior
14. Compiled a `Rules to Keep` section that captures the reusable migration logic without carrying over Excel UI behavior.

## Current Focus

The current focus is the migration of business logic from the legacy Utility Dash workbook into the Meter App, specifically around:

- imports
- readings
- previous readings
- consumption calculations
- tolerance / flag-like review logic
- electricity filter logic
- electricity historical-data completeness assessment

## Working Migration Folder

The canonical working folder for sheet-by-sheet JSON migration is now [DataMigration/README.md](../DataMigration/README.md).

Use it for:

- per-sheet workbook JSON inputs
- migration scripts and transformation logic
- normalized sheet outputs
- app-ready payload outputs
- review and reconciliation artifacts

## Out of Scope For Now

- Excel formatting
- sheet navigation
- print behavior
- workbook UI actions
- protection behavior
- non-essential export/output modules