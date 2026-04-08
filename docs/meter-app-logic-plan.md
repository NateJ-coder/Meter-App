# Meter App Logic Plan

## Import workflow

Goal: import one reading row into the app in a controlled, repeatable way.

Current scope: electricity only.

Planned behavior:

1. Accept one source row from an import batch.
2. Normalize raw values from the source file.
3. Resolve scheme, building, unit, meter, utility type, and row type.
4. Reject or hold rows that are missing required identifiers.
5. Store source metadata so imported records can be traced back to the source batch and file.

Initial rebuild priority:

1. Import rules
2. Previous reading logic
3. Consumption calculation
4. Tolerance / flagging

## Previous reading workflow

Goal: determine the correct comparison baseline for a reading.

Planned behavior:

1. Find the most recent valid prior reading for the same meter.
2. Allow for missing cycles rather than assuming the immediately prior cycle always exists.
3. Preserve the ability to handle corrected or imported history later.
4. Keep the previous-reading lookup separate from UI behavior and import-file layout.

Working rule:

- Previous reading = most recent valid prior reading for the same meter or meter-history chain.

## Consumption workflow

Goal: calculate consumption consistently after the previous reading is known.

Planned behavior:

1. Use current reading and previous reading to calculate consumption.
2. Apply rollover handling before treating the result as invalid.
3. Store both the raw readings and the derived consumption on the reading record.
4. Keep utility-specific tariffs separate from the base consumption calculation.

Working rules:

- Consumption = current reading - previous reading.
- If rollover explains an apparent negative result, adjust consumption instead of treating it as a normal negative reading.

## Tolerance / flagging workflow

Goal: mark suspicious readings for review without blocking normal data capture.

Planned behavior:

1. Compare the new reading's usage against prior usage history.
2. Use a configurable tolerance threshold.
3. Mark abnormal readings with flags rather than silently accepting them.
4. Flag current readings that are lower than the previous reading when rollover does not explain the result.

Working rules:

- If current reading is lower than previous reading and rollover does not explain it, flag for review.
- If tolerance threshold is exceeded, mark the reading as abnormal.
- Tolerance checks use prior usage history as the comparison baseline.

## Not rebuilding from Excel

The following should not drive the new app design:

- sheet navigation
- cell selection behavior
- formatting
- print setup
- message boxes
- workbook protection
- Excel-specific layouts

## Reading record shape

Minimum reading record fields to design around before coding:

- schemeId
- buildingId
- unitId
- meterId
- cycleId
- readingDate
- currentReading
- previousReading
- consumption
- status
- flags[]
- sourceType
- sourceFile
- importedAt

Recommended additional fields:

- utilityType
- rowType
- importBatchId
- sourceRowReference
- rolloverApplied
- validationStatus
- validationReason

## First feature slice

Build only this first end-to-end path:

1. Import one reading row
2. Resolve meter and cycle context
3. Find previous reading
4. Calculate consumption
5. Apply rollover logic
6. Apply tolerance / flagging
7. Store the result with flags and source metadata

Do not expand this first slice yet into:

- dispute packs
- full reporting
- QR capture workflows
- non-electricity utilities unless required later

## Next Build Target

- Single electricity import screen
- Preview table with flags
- Approve and persist reviewed rows
- Import batch audit record