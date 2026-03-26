# Historical Import Model

Historical cleanup should treat source material as four linked layers rather than one mixed spreadsheet view.

## Layers

1. Master asset register
   - `meters`
   - `meter_relationships`
2. Reading history
   - `readings`
3. Billing and charge history
   - `meter_charges`
4. Evidence, flags, and review workflow
   - `meter_evidence`
   - `meter_flags`
   - `legacy_meter_map`
   - `import_batches`
   - `raw_import_rows`
   - `import_review_queue`
   - `dispute_cases`
   - `dispute_pack_exports`

## Canonical meter identity

Every live meter record should carry at least:

- `id`
- `scheme_id`
- `meter_number` or a controlled legacy label
- `meter_role`: `bulk`, `common_property`, `unit`, `submeter`, `check_meter`, `legacy_unknown`
- `service_type`
- `unit_id` or `unit_number` when applicable
- `parent_meter_id` when hierarchy is known
- `source_confidence`

The existing UI still reads `meter_type`, so storage normalization keeps `meter_type` for backward compatibility while adding canonical `meter_role`.

## Import flow

1. Capture raw files and rows into `import_batches` and `raw_import_rows`
2. Normalize source fields without assigning identity yet
3. Match to a known meter using `meter_number`, scheme, unit, location, and `legacy_meter_map`
4. Route uncertain matches into `import_review_queue`
5. Post only approved rows into `readings`, `meter_charges`, and `meter_evidence`

## Starter templates

Use these files first before building any direct importer:

- [source-documents/03-extracted-outputs/templates/meter-register-template.csv](source-documents/03-extracted-outputs/templates/meter-register-template.csv)
- [source-documents/03-extracted-outputs/templates/historical-reading-import-template.csv](source-documents/03-extracted-outputs/templates/historical-reading-import-template.csv)
- [source-documents/03-extracted-outputs/templates/legacy-meter-map-template.csv](source-documents/03-extracted-outputs/templates/legacy-meter-map-template.csv)