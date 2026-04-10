# Normalized Sheet Flag List

Generated: 2026-04-10

## Validation Summary
- Files reviewed: 43
- Parse errors: 0
- Schema issues: 0
- Building sheets: 23
- Support sheets: 20
- Files with at least one flag: 20
- Files with no detected flags: 23

## Headline Flags
- 125 embedded review flags were already present in the normalized exports: 85 `unresolved-reading-date` and 40 `row-with-no-readings`.
- 117 non-numeric reading cells were found across 8 building sheets. 24 are raw Excel formula strings and 93 are literal text values.
- Sensitive login rows were removed from the settings export on 2026-04-10.
- No JSON parse failures or schema-shape failures were found in this folder.

## File-by-File Flag List

| File | Unresolved month dates | Empty reading rows | Non-numeric reading rows | Non-numeric cells | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| akasia.normalized.json | 7 | 1 | 90 | 90 | 90 literal text cells |
| bonifay-court.normalized.json | 5 | 1 | 3 | 5 | 2 formula strings; 3 literal text cells |
| carissa-lane.normalized.json | 5 | 0 | 2 | 2 | 2 formula strings |
| genesis.normalized.json | 1 | 5 | 0 | 0 | embedded review_flags only |
| granistar-heights.normalized.json | 0 | 3 | 4 | 4 | 4 formula strings |
| haven-court.normalized.json | 5 | 16 | 0 | 0 | embedded review_flags only |
| hazelmere.normalized.json | 6 | 0 | 0 | 0 | embedded review_flags only |
| l-montagne.normalized.json | 4 | 0 | 0 | 0 | embedded review_flags only |
| mang-court.normalized.json | 0 | 7 | 0 | 0 | embedded review_flags only |
| new-poort.normalized.json | 6 | 7 | 0 | 0 | embedded review_flags only |
| phanda-lodge.normalized.json | 4 | 0 | 0 | 0 | embedded review_flags only |
| queensgate.normalized.json | 7 | 0 | 3 | 5 | 5 formula strings |
| riviera-villas.normalized.json | 1 | 0 | 0 | 0 | embedded review_flags only |
| rivonia-gate.normalized.json | 4 | 0 | 1 | 1 | 1 formula strings |
| suncrest.normalized.json | 11 | 0 | 0 | 0 | embedded review_flags only |
| taragona.normalized.json | 4 | 0 | 0 | 0 | embedded review_flags only |
| the-azores.normalized.json | 3 | 0 | 4 | 8 | 8 formula strings |
| transvalia.normalized.json | 4 | 0 | 0 | 0 | embedded review_flags only |
| vilino-glen.normalized.json | 5 | 0 | 1 | 2 | 2 formula strings |
| vista-del-monte.normalized.json | 3 | 0 | 0 | 0 | embedded review_flags only |

## Interpretation
- Unresolved month dates are missing or malformed date cells in the month header area. These are mostly trailing future months where a display label exists but row 2 has no valid reading date.
- Empty reading rows are electricity rows that carry a meter label but contain no numeric readings at all. `haven-court.normalized.json` is the largest concentration.
- Formula-string readings are a pipeline flag: `DataMigration/logic/export_workbook_sheet_json.py` opens the workbook with `data_only=False`, so some reading cells are exported as formula text instead of calculated values.
- The Akasia sheet has a separate literal-text issue: the first reading column includes floor markers such as `FL 16`, which are not meter readings and are being captured as raw reading content.

## Highest-Priority Follow-Up
1. Decide whether formula cells should be exported as computed values. If yes, rerun normalization from evaluated workbook values rather than formula text.
2. Clean the unresolved month-date columns before relying on automated historical imports for the affected buildings.
3. Manually review the empty electricity rows in `haven-court.normalized.json`, `mang-court.normalized.json`, and `new-poort.normalized.json`.
4. If the credentials are still required operationally, move them to an `.env` file or a proper secrets manager before the next export cycle.