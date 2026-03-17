# Source Documents Intake

## Purpose

This folder is the staging area for historical company documents that will be used to:

1. Identify the export document layout the app should reproduce.
2. Pull operational data for schemes, buildings, units, meters, and latest readings.

## Folder Structure

### `01-export-layout-reference`

Place examples of the historical reports, statements, schedules, exports, or summary packs that represent the layout the app should prepare during export.

Use this folder for documents that show:

- report headings
- section order
- categories and grouping rules
- totals and statistics
- scheme-level summaries
- unit-level tables
- branding or formatting expectations
- notes, footers, disclaimers, or sign-off sections

### `02-meter-source-records`

Place the historical source records that contain the actual operational data to pull into the app context.

Use this folder for documents that may contain:

- scheme names
- building names
- unit numbers
- bulk meter names
- meter numbers
- meter types
- previous readings
- latest readings from the last month
- reading dates
- occupancy or tenant references if present
- anomalies, notes, or meter status information

### `03-extracted-outputs`

This folder is reserved for extracted outputs after analysis begins.

Expected future outputs include:

- export-layout-summary.md
- scheme-building-unit-meter-register.csv
- latest-readings-import.csv
- extraction-notes.md
- unresolved-items.md

## Recommended Upload Approach

Upload the latest and most representative files first.

Priority order:

1. The most recent export/report pack that best shows the final document layout.
2. The most recent meter reading source documents from last month.
3. Any supporting scheme registers, building registers, or meter schedules.
4. Older historical files only if the newer files are incomplete.

## Preferred File Types

Best case:

- PDF
- XLSX
- XLS
- CSV
- DOCX

Usable if necessary:

- JPG
- JPEG
- PNG
- scanned PDF

Note:

Scanned images and scanned PDFs are still usable, but extraction will be slower and may require OCR cleanup.

## What Will Be Extracted

### A. Export Layout Blueprint

From the files in `01-export-layout-reference`, I will identify:

- document title patterns
- heading hierarchy
- section sequence
- table structures
- category labels
- statistics shown per report
- summary totals
- sort order
- repeated footnotes or business rules
- any required export variants

### B. Operational Meter Data

From the files in `02-meter-source-records`, I will pull and normalize:

- scheme
- building
- unit
- bulk meter name where applicable
- meter number
- meter classification if shown
- latest reading value
- prior reading value if available
- reading date
- source file reference
- notes requiring human confirmation

## Planned Pull Operation

Once documents are uploaded, the work will proceed in this order:

1. Inventory every file and classify it as layout-reference or operational-source.
2. Extract the export layout requirements from the layout-reference documents.
3. Extract scheme, building, unit, and meter information from the operational-source documents.
4. Build a normalized meter register and latest-reading dataset.
5. Flag duplicates, missing identifiers, unreadable values, and conflicts across files.
6. Produce a final extraction pack in `03-extracted-outputs` for review before app import/export changes are made.

## Expected Deliverables After Upload

After analysis starts, I will prepare:

- a document-layout summary for the export screens and generated files
- a clean register of schemes, buildings, units, meters, and meter numbers
- a latest-reading extract tied to each meter
- a list of ambiguous or missing data that needs manual confirmation
- recommendations for how the app export should map to the historical document structure

## Suggested Naming Conventions

If practical, use descriptive names such as:

- `2026-02-export-pack-scheme-a.pdf`
- `2026-02-meter-readings-block-b.xlsx`
- `scheme-register-main-estate.pdf`
- `bulk-meter-schedule-february.xlsx`

If the files already have internal business names, that is acceptable. Do not rename them if it risks confusion.

## Ready State

When documents have been uploaded, the next prompt can simply be:

`Analyze the files in source-documents and start the pull operation.`