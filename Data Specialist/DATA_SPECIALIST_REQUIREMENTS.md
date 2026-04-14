# Data Specialist Requirements

## Goal

We need clean, structured JSON files that can be used as the authoritative source for:

- app register import
- future Firebase collection import
- scheme/building/unit/meter rendering in the UI
- later historical reading import work

The data should be organized for deterministic import, not for human reading only.

## Recommended delivery format

Deliver separate JSON files by entity type.

Recommended file set:

- `schemes.json`
- `buildings.json`
- `units.json`
- `meters.json`
- `meter_relationships.json` if applicable
- `metadata.json`

Optional later-phase files:

- `latest_readings.json`
- `historical_readings.json`
- `meter_notes.json`
- `aliases.json`

Do not mix unrelated record types into one large unstructured JSON blob.

## General data rules

All files should follow these rules:

- UTF-8 encoded JSON
- one top-level array per entity file, except `metadata.json`
- stable IDs provided explicitly in the data
- references must point to existing IDs in related files
- dates must use ISO format: `YYYY-MM-DD` or full ISO datetime when needed
- numeric values must be real JSON numbers, not strings
- unknown values must be `null`, not placeholder text like `N/A`, `unknown`, `########`, or empty strings used inconsistently
- booleans must be real JSON booleans
- field names must be consistent across all files

## Required entity structures

### `schemes.json`

Each scheme should include at least:

```json
{
  "id": "scheme-azores",
  "name": "Azores",
  "code": "AZORES",
  "status": "active",
  "notes": null,
  "source_reference": null
}
```

Required fields:

- `id`
- `name`

Recommended fields:

- `code`
- `status`
- `notes`
- `source_reference`

### `buildings.json`

Each building should include at least:

```json
{
  "id": "building-azores-main",
  "scheme_id": "scheme-azores",
  "name": "Azores",
  "code": "AZ-MAIN",
  "address": null,
  "notes": null
}
```

Required fields:

- `id`
- `scheme_id`
- `name`

### `units.json`

Each unit should include at least:

```json
{
  "id": "unit-azores-01a",
  "building_id": "building-azores-main",
  "unit_number": "AZ 01A",
  "display_name": "AZ 01A",
  "status": "active",
  "notes": null
}
```

Required fields:

- `id`
- `building_id`
- `unit_number`

Recommended fields:

- `display_name`
- `status`
- `notes`
- `occupancy_type`
- `owner_label`

### `meters.json`

Each meter should include at least:

```json
{
  "id": "meter-azores-unit-az-01a",
  "scheme_id": "scheme-azores",
  "building_id": "building-azores-main",
  "unit_id": "unit-azores-01a",
  "meter_number": "AZ 01A",
  "serial_number": null,
  "meter_type": "UNIT",
  "service_type": "electricity",
  "location_description": "Unit AZ 01A",
  "status": "active",
  "last_known_reading": null,
  "last_known_reading_date": null,
  "notes": null,
  "source_confidence": "high"
}
```

Required fields:

- `id`
- `scheme_id`
- `building_id`
- `meter_number`
- `meter_type`
- `service_type`

For `UNIT` meters:

- `unit_id` should be present and valid

Allowed meter types should be restricted to a controlled list:

- `UNIT`
- `BULK`
- `COMMON`
- `SUBMETER`
- `CHECK`

## Relationship rules

The specialist should ensure these rules hold:

- every building belongs to one valid scheme
- every unit belongs to one valid building
- every meter belongs to one valid scheme
- every `UNIT` meter belongs to one valid unit
- `BULK` and `COMMON` meters may have `unit_id = null`
- meter numbers should be unique within a scheme unless a deliberate documented exception exists

## Descriptive information we want preserved

Where available, preserve clean descriptive information in structured fields rather than burying it in notes:

- aliases or alternate labels
- serial numbers
- physical location descriptions
- meter role or usage description
- building codes
- unit display labels
- occupancy or property-use category if reliable
- confidence level for uncertain source values

If something is uncertain, mark it explicitly with a confidence field instead of mixing guesswork into the primary identifier fields.

## What not to do

Please do not deliver data in these forms:

- one giant mixed JSON file with schemes, buildings, units, and meters all interleaved without clear typing
- Excel-shaped JSON with row/column semantics preserved as the main structure
- OCR dump JSON as the final authoritative format
- placeholder strings instead of proper `null` values
- duplicate IDs or inconsistent foreign-key references

## Metadata file

`metadata.json` should describe the handoff batch.

Suggested structure:

```json
{
  "dataset_name": "meter-app-master-data",
  "version": "2026-04-13",
  "prepared_by": "data-specialist-name",
  "generated_at": "2026-04-13T12:00:00Z",
  "notes": [
    "IDs are stable across re-deliveries.",
    "All meter numbers were de-duplicated within each scheme."
  ]
}
```

## Future import expectation

If the JSON is delivered in this structure, the next implementation phase can do both of the following from the same source:

1. Import the entities into Firebase collections.
2. Populate the app UI with schemes, buildings, units, meters, and related descriptive data.

That is the target contract for the specialist handoff.