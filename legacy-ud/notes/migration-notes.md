# Utility Dash Migration Notes

## Known Goal
Preserve only the business logic we still need in the Meter App.

## Current Scope
- electricity only
- import / filter logic for locating the right scheme, building, unit, and meter records
- previous-reading lookup, consumption calculation, and tolerance / flagging
- proving whether the extracted workbook data is complete enough to build against

## Likely Important Logic
- flagging logic
- previous reading logic
- consumption calculations
- dispute pack logic
- import / cleanup logic

## Ignore For Now
- formatting
- button navigation
- printing setup
- sheet protection
- Excel UI behavior

## VBA Files

### Standard Modules (.bas)
- A_Clear_Variables.bas
- A_Declare_Load.bas
- B_BarGraph.bas
- B_Building_Report.bas
- B_Tariff_Original.bas
- B_Tariff_Other.bas
- B_Tarrif_New.bas
- C_Navigation.bas
- D_BreakDown_Electricity.bas
- D_Breakdown_Data_Load.bas
- D_Breakdown_Water.bas
- E_Invoice.bas
- F_BCM_Out.bas
- F_BCM_Transfer.bas
- G_WCU_Out.bas
- I_CSV_Import.bas
- I_Importing.bas
- J_CVS_Output.bas
- Module1.bas
- New_Tariff_Backup.bas
- Other.bas
- T_Tolorance.bas
- U_FTP.bas
- Z_SAVE_LOAD_DATA.bas

### Class / Workbook / Sheet Modules (.cls)
- Azores_Sheet.cls
- Home_Sheet.cls
- Sheet1.cls
- Sheet12.cls
- Sheet17.cls
- Sheet18.cls
- Sheet19.cls
- Sheet2.cls
- Sheet20.cls
- Sheet21.cls
- Sheet22.cls
- Sheet23.cls
- Sheet24.cls
- Sheet25.cls
- Sheet26.cls
- Sheet27.cls
- Sheet29.cls
- Sheet3.cls
- Sheet30.cls
- Sheet36.cls
- Sheet37.cls
- Sheet38.cls
- Sheet39.cls
- Sheet4.cls
- Sheet40.cls
- Sheet41.cls
- Sheet42.cls
- Sheet43.cls
- Sheet44.cls
- Sheet45.cls
- Sheet46.cls
- Sheet47.cls
- Sheet48.cls
- Sheet49.cls
- Sheet5.cls
- Sheet50.cls
- Sheet51.cls
- Sheet52.cls
- Sheet53.cls
- Sheet6.cls
- Sheet7.cls
- Sheet8.cls
- Sheet9.cls
- ThisWorkbook.cls

### Forms (.frm)
- None found

## Filename Triage

### Important
- D_BreakDown_Electricity.bas
- D_Breakdown_Data_Load.bas
- I_CSV_Import.bas
- I_Importing.bas
- T_Tolorance.bas

### Maybe
- A_Clear_Variables.bas
- A_Declare_Load.bas
- B_Building_Report.bas
- B_Tariff_Original.bas
- B_Tariff_Other.bas
- B_Tarrif_New.bas
- E_Invoice.bas
- Other.bas
- Z_SAVE_LOAD_DATA.bas
- Azores_Sheet.cls
- Home_Sheet.cls
- Sheet1.cls
- Sheet12.cls
- Sheet17.cls
- Sheet18.cls
- Sheet19.cls
- Sheet2.cls
- Sheet20.cls
- Sheet21.cls
- Sheet22.cls
- Sheet23.cls
- Sheet24.cls
- Sheet25.cls
- Sheet26.cls
- Sheet27.cls
- Sheet29.cls
- Sheet3.cls
- Sheet30.cls
- Sheet36.cls
- Sheet37.cls
- Sheet38.cls
- Sheet39.cls
- Sheet4.cls
- Sheet40.cls
- Sheet41.cls
- Sheet42.cls
- Sheet43.cls
- Sheet44.cls
- Sheet45.cls
- Sheet46.cls
- Sheet47.cls
- Sheet48.cls
- Sheet49.cls
- Sheet5.cls
- Sheet50.cls
- Sheet51.cls
- Sheet52.cls
- Sheet53.cls
- Sheet6.cls
- Sheet7.cls
- Sheet8.cls
- Sheet9.cls
- ThisWorkbook.cls

### Ignore for now
- B_BarGraph.bas
- C_Navigation.bas
- D_Breakdown_Water.bas
- F_BCM_Out.bas
- F_BCM_Transfer.bas
- G_WCU_Out.bas
- J_CVS_Output.bas
- Module1.bas
- New_Tariff_Backup.bas
- U_FTP.bas

## Opened First

- D_BreakDown_Electricity.bas
- D_Breakdown_Data_Load.bas
- I_CSV_Import.bas
- I_Importing.bas
- T_Tolorance.bas

## Module: I_CSV_Import.bas

### What it seems to do
- Imports a month-specific CSV file for the selected building into the active worksheet.
- Splits imported data into sections that can later be matched to electricity bulk and electricity unit rows.

### Inputs it uses
- Active sheet name.
- Active cell row and column.
- Building name from cell `A1`.
- Base folder from `Settings` cell `(5, 3)`.
- File name pattern `YYYY-MM BuildingName.csv`.
- CSV row text containing markers such as `ELECTRICITY` and `BULK`.

### Outputs it creates / updates
- Writes imported reading values into the selected month column of the current worksheet.
- Updates bulk and unit reading rows for electricity.

### Business rules worth keeping
- Import only proceeds when a valid month column is selected and the selected row is the top month row.
- Source file path is derived from building name plus selected month.
- CSV values are read line by line and quotes are stripped before parsing.
- For the current migration slice, only electricity rows matter.
- Bulk rows are inferred by the presence of `BULK`; non-bulk electricity rows are treated as unit rows.
- The imported reading value is taken as the text after the first comma in each CSV line.

### Ignore / Excel-only behavior
- Screen updating toggles.
- Selection checks and message boxes.
- Exact worksheet row positioning and `.Find(...)` navigation mechanics.

## Module: I_Importing.bas

### What it seems to do
- Starts a more generic import flow that reads a CSV into in-memory arrays before matching it back to workbook rows.
- Builds a title list for workbook rows under the electricity section.

### Inputs it uses
- Active sheet name.
- Active cell row and column.
- Building name from cell `A1`.
- Base folder from `Settings` cell `(5, 3)`.
- File name pattern `YYYY-MM BuildingName.csv`.
- Section header `ELECTRICITY` already present in the worksheet.

### Outputs it creates / updates
- Populates the `RawData` array with imported rows.
- Populates the `UnitTitles` array with workbook row titles.
- Appears intended to match imported rows to workbook rows, but the write-back logic is incomplete or broken.

### Business rules worth keeping
- Import file naming follows the same month-plus-building convention as `I_CSV_Import.bas`.
- Imported text is uppercased and stripped of quotes before use.
- For the current migration slice, imported rows only need to be matched inside the electricity section.
- Workbook-side row titles are derived by reading rows under the `ELECTRICITY` heading.
- The intended matching strategy appears to be title-based rather than purely positional.

### Ignore / Excel-only behavior
- Screen updating toggles.
- Message boxes.
- Broken/incomplete workbook matching statements.

## Module: D_Breakdown_Data_Load.bas

### What it seems to do
- Loads the selected building/month data into working arrays used by later electricity calculation modules.
- Separates rows into bulk, common-property, and unit readings.
- Calculates base consumption totals and shared charge allocations before breakdown sheets are built.

### Inputs it uses
- Active sheet and selected month column.
- Building name from `A1`.
- Selected date and previous date from row `2`.
- Tariff reference from row `3` of the selected month column.
- `Settings` values for VAT and whether negative common-property differences should be ignored.
- Row labels such as `Electricity`, `BULK`, and `COM`.
- Column `2` prepaid marker, column `3` percentage quota (`PQ`), and rows `4` to `11` for option amounts.
- Tariff-loading functions and cost-calculation functions.

### Outputs it creates / updates
- Sets working values such as `BuildingName`, `SelDate`, `PrevDate`, and `TotalUnitCount`.
- Populates arrays for unit names, previous readings, current readings, consumption, prepaid markers, and percentage quotas.
- Populates electricity counts/totals for bulk, common-property, and unit categories.
- Populates shared charge arrays such as `ElecBulkDiff` and `OptionCharge2` to `OptionCharge8`.
- Calculates chargeable-unit counts, actual common-property consumption, tariff totals, and difference totals.

### Business rules worth keeping
- Data must be loaded before later breakdown modules can calculate totals.
- The selected month determines both the current reading column and the previous reading column.
- For the current migration slice, only electricity rows are loaded forward into app-native rules.
- Row type is determined from the first three characters of the entry name: `BUL` for bulk, `COM` for common-property, otherwise unit.
- Unit consumption is calculated from current and previous readings via `GetConsumption(...)`.
- If a prepaid marker contains `*factor`, the calculated consumption is multiplied by that factor.
- If calculated consumption is negative, it is treated as a rollover and `1000000` is added.
- Electricity common-property actual consumption is calculated as `bulk total - unit total`, floored at `0` when negative.
- Units marked with code `** ` are excluded from `ChargeableUnitCount`.
- Shared charges are distributed by option mode: `EVEN`, `PQ`, `FIXED`, `NONE`, and `SANWATER`.
- `GetConsumption(...)` treats a digit-length drop with a previous reading starting in `9` as a meter rollover and adds `10^(previous_length - 1)`.

### Ignore / Excel-only behavior
- Sheet activation and navigation.
- Debug comments and message boxes.
- Cell-by-cell placement details on summary sheets.

## Module: D_BreakDown_Electricity.bas

### What it seems to do
- Builds the electricity breakdown view for the selected period.
- Calculates per-unit electricity charges, aggregate unit income, bulk-vs-unit differences, and prepaid electricity totals.

### Inputs it uses
- Loaded electricity arrays such as unit names, previous readings, current readings, consumption, percentage quotas, and prepaid markers.
- Tariff tier quantities and prices.
- Shared charge arrays populated earlier.
- VAT percentage.
- `IgnoreNegComP` and `NewCalc` toggles.

### Outputs it creates / updates
- Populates the `ElecBreakDown` worksheet.
- Updates `UnitElecCost(UnitNo)` for each unit.
- Updates aggregate tariff buckets and `ElecActualTotCharge`.
- Updates `ElecDifference`, `RemElecDiff`, prepaid counts, converted prepaid usage totals, and prepaid total cost values.

### Business rules worth keeping
- Previous reading and selected reading are shown per unit and consumption is based on the preloaded `ElecUnitCons` values.
- Per-unit electricity cost is calculated from consumption using either `GetElecCosts(...)` or `GetElecCostsNew(...)`.
- Per-unit grand total is `base electricity cost + common-property allocation + option charge 2 + option charge 3`.
- Inclusive VAT total is `excl VAT total * (1 + VatPercent)`.
- Aggregate actual electricity income is the sum of tariff-cost buckets across all units.
- `ElecActualTotCharge` is the total of the accumulated tariff buckets.
- `ElecDifference` is calculated as `ElecBulkTotCharge - ElecActualTotCharge`.
- If negative common-property differences are configured to be ignored, a negative `ElecDifference` is clamped to `0`.
- Units marked as prepaid are tracked separately, and prepaid total cost is calculated from combined prepaid converted usage and prepaid unit count.

### Ignore / Excel-only behavior
- Breakdown sheet layout.
- Cell formatting, display text, and highlighting.
- Sanitization/refuse display placement.

## Module: T_Tolorance.bas

### What it seems to do
- Checks the current month’s electricity usage against a historic average and marks exceptions outside a tolerance band.
- Adds per-cell commentary describing the lookback history and current usage.

### Inputs it uses
- Selected month column from the top row.
- `Settings` values for `ErrorTolPercentage`, `ErrorCheckMonths`, and `ErrorTolColor`.
- Electricity rows in the active worksheet.
- Current and prior reading columns across the lookback period.

### Outputs it creates / updates
- Adds or updates a comment on each checked reading cell.
- Clears or applies a flag color to the reading cell depending on whether it falls inside tolerance.

### Business rules worth keeping
- The check only runs when the selected cell is on the month header row.
- The check requires enough historic columns to cover the configured lookback window.
- Current month usage is `current reading - previous reading`.
- Historic monthly usages are calculated the same way for each month in the lookback window.
- Historic average is derived from the total usage over the lookback period divided by the number of months.
- Tolerance bounds are `average * (1 - tolerance)` and `average * (1 + tolerance)`.
- If current usage falls outside the tolerance range, the record is marked for attention; otherwise it is left unflagged.

### Ignore / Excel-only behavior
- Cell comments as UI artifacts.
- Fill colors as Excel presentation.
- Message boxes.

## Rules to Keep

1. Import skips rows missing required identifiers.
2. Import classifies each row by electricity row type.
3. Bulk, common-property, and unit readings must be separated before calculation.
4. Previous reading should come from the most recent valid prior reading for the same meter.
5. Consumption = current reading - previous reading.
6. If a meter rolls over, consumption must be adjusted instead of treated as a simple negative value.
7. If current reading is lower than previous reading and rollover does not explain it, flag for review.
8. Common-property usage = bulk usage - unit usage.
9. If configured to ignore negative common-property differences, clamp them to zero.
10. Shared charges can be allocated by equal split, percentage quota, fixed amount, or no allocation.
11. If tolerance threshold is exceeded, mark the reading as abnormal for review.
12. Tolerance checks use prior usage history as the comparison baseline.

## Rules to Rebuild First

### A. Import rules
- Import skips rows missing required identifiers.
- Import classifies each row by electricity row type.
- Bulk, common-property, and unit readings must be separated before calculation.

### B. Reading calculation rules
- Consumption = current reading - previous reading.
- If a meter rolls over, consumption must be adjusted instead of treated as a simple negative value.
- Common-property usage = bulk usage - unit usage.
- If configured to ignore negative common-property differences, clamp them to zero.
- Shared charges can be allocated by equal split, percentage quota, fixed amount, or no allocation.

### C. Previous reading rules
- Previous reading should come from the most recent valid prior reading for the same meter.

### D. Tolerance / flagging rules
- If current reading is lower than previous reading and rollover does not explain it, flag for review.
- If tolerance threshold is exceeded, mark the reading as abnormal for review.
- Tolerance checks use prior usage history as the comparison baseline.

## Extracted Data Assessment

Current extracted electricity artifacts under `source-documents/03-extracted-outputs/utility-dash/` are substantial enough to design import/filter logic against, but not yet clean enough to certify as a perfect historical source.

### What appears to be present
- 23 schemes in summary, meter register, and history exports.
- 1123 registered meters across `BULK`, `COMMON`, and `UNIT` row types.
- 56543 embedded electricity history points across the meter history export.
- tariff, charge-component, summary, latest-reading, and register exports already produced.

### What still blocks a completeness claim
- 10331 history points use `#########` instead of a real date value.
- 38 meters have an empty history array.
- the workbook file itself could not be directly validated with `openpyxl` because the `.xlsm` artifact is not readable as a normal ZIP-based workbook.
- without a second trustworthy extraction path or direct workbook validation, we cannot yet say that no historical entries are missing.

### Working conclusion
- The extracted dataset is good enough for electricity-first filter-logic design.
- It is not yet good enough for a zero-loss historical migration claim.
- If zero-loss matters now, the next task is a stronger workbook extraction and reconciliation pass, not more rule archaeology.