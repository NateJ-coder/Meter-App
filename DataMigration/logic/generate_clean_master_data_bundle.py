from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
NORMALIZED_DIR = WORKSPACE_ROOT / 'DataMigration' / 'outputs' / 'sheet-normalized'
APP_PAYLOAD_DIR = WORKSPACE_ROOT / 'DataMigration' / 'outputs' / 'app-payloads'
BUILDINGS_DIR = WORKSPACE_ROOT / 'Buildings' / 'buildings'
ASSET_MODULE_PATH = WORKSPACE_ROOT / 'assets' / 'generated-clean-master-data.js'

IGNORED_BUILDING_DIRS = {'cleaned images'}

SCHEME_NAME_ALIASES = {
    'the azores': 'azores',
    'bonifay court': 'bonifay',
    'genesis': 'genisis on fairmount',
    'l montagne': 'la montagne',
    'lmontagne': 'la montagne',
    'queensgate': 'queensgate',
    'rivonia gate': 'rivonia gates',
    'vilino glen': 'villino glen',
    'villino glen': 'villino glen',
}

METER_ROLE_BY_TYPE = {
    'BULK': 'bulk',
    'COMMON': 'common_property',
    'UNIT': 'unit',
    'SUBMETER': 'submeter',
    'CHECK': 'check_meter',
}


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_name(value: str | None) -> str:
    normalized = re.sub(r"['’]", '', str(value or '').strip().lower())
    normalized = re.sub(r'[^a-z0-9]+', ' ', normalized).strip()
    return SCHEME_NAME_ALIASES.get(normalized, normalized)


def slugify(value: str | None) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', str(value or '').strip().lower())
    return slug.strip('-') or 'unknown'


def deterministic_id(prefix: str, *parts: str) -> str:
    tokens = [slugify(part) for part in parts if str(part or '').strip()]
    return f"{prefix}-{'-'.join(tokens)}"


def get_active_building_map() -> dict[str, str]:
    building_map: dict[str, str] = {}

    for child in BUILDINGS_DIR.iterdir():
        if not child.is_dir() or child.name in IGNORED_BUILDING_DIRS:
            continue
        building_map[normalize_name(child.name)] = child.name

    return building_map


def derive_unit_number(legacy_label: str, entity_reference: dict[str, Any]) -> str:
    canonical_label = str(entity_reference.get('canonical_unit_label') or '').strip()
    if canonical_label:
        return canonical_label

    slash_parts = [part.strip() for part in re.split(r'\s*/\s*', legacy_label) if part.strip()]
    if len(slash_parts) >= 2:
        return slash_parts[-1]

    flat_match = re.search(r'\b((?:FL|FLAT|UNIT|APT|APARTMENT|SHOP|OFFICE)\s*[A-Z0-9-]+)\b', legacy_label, re.IGNORECASE)
    if flat_match:
        return re.sub(r'\s+', ' ', flat_match.group(1).upper()).strip()

    compact_match = re.search(r'\b([A-Z]{1,4}\s*\d+[A-Z]?)\b', legacy_label, re.IGNORECASE)
    if compact_match:
        return re.sub(r'\s+', ' ', compact_match.group(1).upper()).strip()

    return legacy_label.strip()


def coerce_finite_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def get_latest_valid_reading(row: dict[str, Any]) -> tuple[float | None, str | None]:
    best_date: str | None = None
    best_value: float | None = None

    for reading in row.get('readings', []):
        reading_date = reading.get('reading_date')
        reading_value = coerce_finite_number(reading.get('reading_value'))

        if reading_date is None or reading_value is None:
            continue

        if best_date is None or reading_date > best_date:
            best_date = reading_date
            best_value = reading_value

    return best_value, best_date


def build_payload() -> tuple[dict[str, Any], dict[str, Any]]:
    generated_at = current_timestamp()
    active_buildings = get_active_building_map()

    schemes: list[dict[str, Any]] = []
    buildings: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    meters: list[dict[str, Any]] = []
    seen_schemes: set[str] = set()
    seen_buildings: set[str] = set()
    seen_units: set[str] = set()
    seen_meters: set[str] = set()
    skipped_sheets: list[str] = []
    matched_sheets: list[str] = []
    matched_building_names: set[str] = set()
    building_summaries: list[dict[str, Any]] = []

    for normalized_path in sorted(NORMALIZED_DIR.glob('*.normalized.json')):
        payload = json.loads(normalized_path.read_text(encoding='utf-8'))
        if payload.get('sheet_category') != 'building':
            continue

        scheme_name = str(payload.get('scheme_name') or payload.get('sheet_name') or '').strip()
        normalized_scheme_name = normalize_name(scheme_name)
        building_name = active_buildings.get(normalized_scheme_name)
        if not building_name:
            skipped_sheets.append(normalized_path.name)
            continue

        matched_sheets.append(normalized_path.name)
        matched_building_names.add(building_name)
        scheme_slug = slugify(building_name)
        scheme_id = deterministic_id('scheme', building_name)
        building_id = deterministic_id('building', building_name, 'main')

        if scheme_id not in seen_schemes:
            schemes.append({
                'id': scheme_id,
                'name': building_name,
                'created_at': generated_at,
                'imported_from': 'clean_normalized_bundle',
                'initialized_from': 'clean_normalized_bundle',
                'source_reference': str(normalized_path.relative_to(WORKSPACE_ROOT)).replace('\\', '/'),
                'source_confidence': 'high',
            })
            seen_schemes.add(scheme_id)

        if building_id not in seen_buildings:
            buildings.append({
                'id': building_id,
                'scheme_id': scheme_id,
                'name': building_name,
                'created_at': generated_at,
                'imported_from': 'clean_normalized_bundle',
                'source_reference': str(normalized_path.relative_to(WORKSPACE_ROOT)).replace('\\', '/'),
                'source_confidence': 'high',
            })
            seen_buildings.add(building_id)

        building_unit_count = 0
        building_meter_count = 0

        for row in payload.get('electricity_rows', []):
            legacy_label = str(row.get('legacy_label') or '').strip()
            if not legacy_label:
                continue

            meter_type = str(row.get('meter_type') or 'UNKNOWN').strip().upper() or 'UNKNOWN'
            entity_reference = row.get('entity_reference') or {}

            unit_id = None
            if meter_type == 'UNIT':
                unit_number = derive_unit_number(legacy_label, entity_reference)
                unit_id = deterministic_id('unit', scheme_slug, unit_number)
                if unit_id not in seen_units:
                    units.append({
                        'id': unit_id,
                        'building_id': building_id,
                        'unit_number': unit_number,
                        'status': 'occupied',
                        'created_at': generated_at,
                        'imported_from': 'clean_normalized_bundle',
                        'source_reference': f"{normalized_path.relative_to(WORKSPACE_ROOT).as_posix()}:{legacy_label}",
                        'source_confidence': 'high',
                    })
                    seen_units.add(unit_id)
                    building_unit_count += 1

            meter_id = deterministic_id('meter', scheme_slug, meter_type.lower(), legacy_label)
            if meter_id in seen_meters:
                continue

            last_reading, last_reading_date = get_latest_valid_reading(row)
            meters.append({
                'id': meter_id,
                'scheme_id': scheme_id,
                'unit_id': unit_id,
                'meter_number': legacy_label,
                'meter_type': meter_type,
                'meter_role': METER_ROLE_BY_TYPE.get(meter_type, 'legacy_unknown'),
                'service_type': 'electricity',
                'location_description': building_name if unit_id is None else units[-1]['unit_number'] if units and units[-1]['id'] == unit_id else '',
                'last_reading': last_reading,
                'last_reading_date': last_reading_date,
                'pq_factor': row.get('pq_factor'),
                'prepaid_marker': row.get('prepaid_marker'),
                'hierarchy_level': 0 if meter_type == 'BULK' else 1,
                'reconciliation_group': scheme_id,
                'is_active': True,
                'created_at': generated_at,
                'imported_from': 'clean_normalized_bundle',
                'source_reference': f"{normalized_path.relative_to(WORKSPACE_ROOT).as_posix()}:{legacy_label}",
                'source_confidence': 'high',
            })
            seen_meters.add(meter_id)
            building_meter_count += 1

        building_summaries.append({
            'scheme_name': building_name,
            'source_file': str(normalized_path.relative_to(WORKSPACE_ROOT)).replace('\\', '/'),
            'units': building_unit_count,
            'meters': building_meter_count,
        })

    for building_name in sorted(active_buildings.values()):
        if building_name in matched_building_names:
            continue

        scheme_id = deterministic_id('scheme', building_name)
        building_id = deterministic_id('building', building_name, 'main')

        if scheme_id not in seen_schemes:
            schemes.append({
                'id': scheme_id,
                'name': building_name,
                'created_at': generated_at,
                'imported_from': 'clean_normalized_bundle',
                'initialized_from': 'buildings_folder_placeholder',
                'source_reference': 'Buildings/buildings',
                'source_confidence': 'low',
            })
            seen_schemes.add(scheme_id)

        if building_id not in seen_buildings:
            buildings.append({
                'id': building_id,
                'scheme_id': scheme_id,
                'name': building_name,
                'created_at': generated_at,
                'imported_from': 'clean_normalized_bundle',
                'source_reference': 'Buildings/buildings',
                'source_confidence': 'low',
            })
            seen_buildings.add(building_id)

        building_summaries.append({
            'scheme_name': building_name,
            'source_file': None,
            'units': 0,
            'meters': 0,
        })

    summary = {
        'generated_at': generated_at,
        'active_buildings': sorted(active_buildings.values()),
        'matched_sheets': matched_sheets,
        'skipped_sheets': skipped_sheets,
        'counts': {
            'schemes': len(schemes),
            'buildings': len(buildings),
            'units': len(units),
            'meters': len(meters),
        },
        'buildings': building_summaries,
    }

    payload = {
        'metadata': {
            'version': generated_at,
            'generated_at': generated_at,
            'source': 'reconciled_sheet_normalized',
            'notes': [
                'Master data bundle generated from DataMigration/outputs/sheet-normalized building sheets.',
                'Only active building folders under Buildings/buildings are included.',
                'This bundle seeds schemes, buildings, units, and meters only. Cycles and readings remain untouched.',
                'Unit-meter numbers currently mirror the cleaned legacy labels where no distinct serial register exists in the finalized data.',
            ],
        },
        'schemes': schemes,
        'buildings': buildings,
        'units': units,
        'meters': meters,
    }

    return payload, summary


def write_outputs(payload: dict[str, Any], summary: dict[str, Any]) -> None:
    APP_PAYLOAD_DIR.mkdir(parents=True, exist_ok=True)

    json_path = APP_PAYLOAD_DIR / 'clean-master-data-bundle.json'
    summary_path = APP_PAYLOAD_DIR / 'clean-master-data-summary.json'

    json_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')

    module_contents = (
        '/**\n'
        ' * generated-clean-master-data.js\n'
        ' * Generated by DataMigration/logic/generate_clean_master_data_bundle.py\n'
        ' */\n\n'
        f"export const cleanMasterDataVersion = {json.dumps(payload['metadata']['version'])};\n"
        f"export const cleanMasterDataSummary = {json.dumps(summary, indent=2)};\n\n"
        f"export const cleanMasterData = {json.dumps(payload, indent=2)};\n"
    )
    ASSET_MODULE_PATH.write_text(module_contents, encoding='utf-8')


def main() -> None:
    payload, summary = build_payload()
    write_outputs(payload, summary)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()