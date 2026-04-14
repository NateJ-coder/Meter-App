from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from shutil import which
from typing import Any

from PIL import Image, ImageFilter, ImageOps
import pytesseract


ROOT_DIR = Path(__file__).resolve().parents[1]
BUILDINGS_DIR = ROOT_DIR / 'Buildings' / 'buildings'
NORMALIZED_DIR = ROOT_DIR / 'DataMigration' / 'outputs' / 'sheet-normalized'
OUTPUT_DIR_NAME = 'cleaned images'
OUTPUT_FILE_NAME = 'meter-image-extractions.json'
CAPTURE_OUTPUT_FILE_NAME = 'meter-capture-readings.json'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}
DOCUMENT_EXTENSIONS = {'.pdf'}
COMMON_TESSERACT_PATHS = [
    Path(r'C:\Program Files\Tesseract-OCR\tesseract.exe'),
    Path(r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe'),
]
SCHEME_ALIASES = {
    'the azores': 'Azores',
    'genesis': 'Genisis on Fairmount',
    'bonifay court': 'Bonifay',
    'vilino glen': 'VILLINO GLEN',
    'l montagne': 'La Montagne',
    'lmontagne': 'La Montagne',
    "l'montagne": 'La Montagne',
    'rivonia gate': 'Rivonia Gates',
    'queensgate': 'QueensGate',
}
FOLDER_NOISE_TOKENS = {
    'completed', 'complete', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december', 'january', 'february', 'mar',
    'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
}

DATE_PATTERNS = [
    re.compile(r'(?P<value>20\d{2}[./-]\d{2}[./-]\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)'),
    re.compile(r'(?P<value>\d{2}[./-]\d{2}[./-]20\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)'),
    re.compile(r'(?P<value>20\d{2}\d{2}\d{2}(?:_\d{6})?)'),
    re.compile(r'(?P<value>\d{1,2}\s*(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s*20\d{2})', re.IGNORECASE),
]
UNIT_LABEL_PATTERNS = [
    re.compile(r'\b(?:flat|unit|door)\s*(?P<value>[a-z]{0,4}\s*\d+[a-z]?)\b', re.IGNORECASE),
    re.compile(r'\b(?P<value>[A-Z]{1,4}\s*\d{1,3}[A-Z]?)\b'),
]
SERIAL_PATTERNS = [
    re.compile(r'\b(?:no|nr|serial|meter(?:\s+no)?)\s*[:,.#-]?\s*(?P<value>[0-9A-Z]{5,})\b', re.IGNORECASE),
    re.compile(r'\bN[Ooº]\s*[:,.#-]?\s*(?P<value>\d{5,})\b', re.IGNORECASE),
]
READING_PATTERN = re.compile(r'\b(?P<value>\d{4,6})(?:[.,](?P<decimal>\d))?\b')
TIME_PATTERN = re.compile(r'\b\d{1,2}:\d{2}(?::\d{2})?\b')


@dataclass(frozen=True)
class Candidate:
    value: str
    source: str
    score: int


@dataclass
class ReferenceMeter:
    meter_number: str
    meter_type: str
    latest_reading: float | None
    latest_reading_date: str | None


@dataclass
class BuildingReference:
    scheme_name: str
    sheet_name: str
    sheet_slug: str
    source_path: str
    meters: dict[str, ReferenceMeter]
    exact_alias_map: dict[str, tuple[str, ...]]
    base_alias_map: dict[str, tuple[str, ...]]


def configure_tesseract() -> str:
    resolved = which('tesseract')
    if resolved:
        pytesseract.pytesseract.tesseract_cmd = resolved
        return resolved
    for candidate in COMMON_TESSERACT_PATHS:
        if candidate.exists():
            pytesseract.pytesseract.tesseract_cmd = str(candidate)
            return str(candidate)
    raise RuntimeError('Tesseract executable was not found on this machine.')


def slugify(value: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', value.strip().lower())
    return slug.strip('-') or 'unknown'


def normalize_text(value: Any) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', str(value or '').strip().lower()).strip()


def normalize_compact_text(value: Any) -> str:
    return re.sub(r'[^a-z0-9]+', '', str(value or '').strip().lower())


def canonical_scheme_name(value: str) -> str:
    normalized = normalize_text(value)
    return SCHEME_ALIASES.get(normalized, value.strip())


def clean_building_folder_name(value: str) -> str:
    tokens = [token for token in normalize_text(value).split() if token not in FOLDER_NOISE_TOKENS]
    return ' '.join(tokens).strip()


def parse_unit_label_parts(value: str) -> tuple[str, int, str] | None:
    compact = normalize_compact_text(value)
    match = re.fullmatch(r'(?P<prefix>[a-z]+)(?P<number>\d+)(?P<suffix>[a-z]?)', compact)
    if not match:
        return None
    prefix = match.group('prefix').upper()
    number = int(match.group('number'))
    suffix = match.group('suffix').upper()
    return prefix, number, suffix


def unit_exact_key(value: str) -> str | None:
    parts = parse_unit_label_parts(value)
    if parts is None:
        return None
    prefix, number, suffix = parts
    return f'{prefix}|{number}|{suffix}'


def unit_base_key(value: str) -> str | None:
    parts = parse_unit_label_parts(value)
    if parts is None:
        return None
    prefix, number, _suffix = parts
    return f'{prefix}|{number}'


def build_label_aliases(label: str, meter_type: str) -> tuple[set[str], set[str]]:
    exact_aliases = {
        f'text:{normalize_text(label)}',
        f'compact:{normalize_compact_text(label)}',
    }
    base_aliases: set[str] = set()
    if meter_type == 'UNIT':
        exact_key = unit_exact_key(label)
        base_key = unit_base_key(label)
        if exact_key:
            exact_aliases.add(f'unit:{exact_key}')
        if base_key:
            base_aliases.add(f'unit-base:{base_key}')
    return exact_aliases, base_aliases


def latest_reference_reading(readings: list[dict[str, Any]]) -> tuple[float | None, str | None]:
    latest_value: float | None = None
    latest_date: str | None = None
    for reading in readings:
        value = reading.get('reading_value')
        date_value = reading.get('reading_date')
        if value is None:
            continue
        latest_value = float(value)
        latest_date = date_value
    return latest_value, latest_date


@lru_cache(maxsize=1)
def load_building_references() -> tuple[BuildingReference, ...]:
    references: list[BuildingReference] = []
    for path in sorted(NORMALIZED_DIR.glob('*.normalized.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        if payload.get('sheet_category') != 'building':
            continue

        electricity_rows = payload.get('electricity_rows') or []
        if not electricity_rows:
            continue

        meters: dict[str, ReferenceMeter] = {}
        exact_alias_map: dict[str, set[str]] = {}
        base_alias_map: dict[str, set[str]] = {}

        for row in electricity_rows:
            meter_type = row.get('meter_type') or 'UNIT'
            entity_reference = row.get('entity_reference') or {}
            meter_number = entity_reference.get('canonical_unit_label') or row.get('legacy_label')
            if not meter_number:
                continue

            latest_reading, latest_reading_date = latest_reference_reading(row.get('readings') or [])
            meters[meter_number] = ReferenceMeter(
                meter_number=meter_number,
                meter_type=meter_type,
                latest_reading=latest_reading,
                latest_reading_date=latest_reading_date,
            )

            exact_aliases, base_aliases = build_label_aliases(meter_number, meter_type)
            legacy_label = row.get('legacy_label')
            if legacy_label and legacy_label != meter_number:
                legacy_exact_aliases, legacy_base_aliases = build_label_aliases(legacy_label, meter_type)
                exact_aliases.update(legacy_exact_aliases)
                base_aliases.update(legacy_base_aliases)

            for alias in exact_aliases:
                exact_alias_map.setdefault(alias, set()).add(meter_number)
            for alias in base_aliases:
                base_alias_map.setdefault(alias, set()).add(meter_number)

        if not meters:
            continue

        references.append(BuildingReference(
            scheme_name=canonical_scheme_name(str(payload.get('scheme_name') or payload.get('sheet_name') or '')),
            sheet_name=str(payload.get('sheet_name') or ''),
            sheet_slug=str(payload.get('sheet_slug') or path.stem.replace('.normalized', '')),
            source_path=str(path),
            meters=meters,
            exact_alias_map={key: tuple(sorted(value)) for key, value in exact_alias_map.items()},
            base_alias_map={key: tuple(sorted(value)) for key, value in base_alias_map.items()},
        ))

    return tuple(references)


def reference_name_score(candidate_name: str, reference_name: str) -> int:
    if not candidate_name or not reference_name:
        return -1
    if candidate_name == reference_name:
        return 200 + len(reference_name)
    if candidate_name in reference_name or reference_name in candidate_name:
        return 150 + min(len(candidate_name), len(reference_name))

    candidate_tokens = set(candidate_name.split())
    reference_tokens = set(reference_name.split())
    overlap = candidate_tokens & reference_tokens
    if not overlap:
        return -1
    return (len(overlap) * 25) - (abs(len(candidate_tokens) - len(reference_tokens)) * 3) + min(len(candidate_name), len(reference_name))


def resolve_building_reference(building_dir: Path) -> BuildingReference | None:
    candidate_names = {
        normalize_text(building_dir.name),
        clean_building_folder_name(building_dir.name),
    }
    candidate_names = {name for name in candidate_names if name}

    best_reference: BuildingReference | None = None
    best_score = -1
    has_tie = False
    for reference in load_building_references():
        reference_names = {
            normalize_text(reference.scheme_name),
            normalize_text(reference.sheet_name),
            normalize_text(canonical_scheme_name(reference.sheet_name)),
        }
        score = max(
            reference_name_score(candidate_name, reference_name)
            for candidate_name in candidate_names
            for reference_name in reference_names
        )
        if score > best_score:
            best_reference = reference
            best_score = score
            has_tie = False
        elif score == best_score and score > 0:
            has_tie = True

    if best_score < 40 or has_tie:
        return None
    return best_reference


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def iter_building_dirs(requested_buildings: list[str] | None) -> list[Path]:
    all_buildings = sorted(
        path
        for path in BUILDINGS_DIR.iterdir()
        if path.is_dir() and path.name.lower() != OUTPUT_DIR_NAME.lower()
    )
    if not requested_buildings:
        return all_buildings

    requested_lookup = {slugify(value): value for value in requested_buildings}
    selected = [path for path in all_buildings if slugify(path.name) in requested_lookup]
    missing = sorted(set(requested_lookup) - {slugify(path.name) for path in selected})
    if missing:
        missing_labels = ', '.join(requested_lookup[item] for item in missing)
        raise ValueError(f'Requested building folders were not found: {missing_labels}')
    return selected


def is_output_path(path: Path) -> bool:
    lowered_parts = {part.lower() for part in path.parts}
    return OUTPUT_DIR_NAME.lower() in lowered_parts


def collect_image_files(building_dir: Path) -> list[Path]:
    image_files = []
    for path in building_dir.rglob('*'):
        if is_output_path(path):
            continue
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            image_files.append(path)
    return sorted(image_files)


def collect_document_files(building_dir: Path) -> list[Path]:
    document_files = []
    for path in building_dir.rglob('*'):
        if is_output_path(path):
            continue
        if path.is_file() and path.suffix.lower() in DOCUMENT_EXTENSIONS:
            document_files.append(path)
    return sorted(document_files)


def collect_flagged_folders(building_dir: Path, tracked_files: list[Path]) -> list[dict[str, Any]]:
    folders_with_tracked_descendants: set[Path] = set()
    for tracked_path in tracked_files:
        current = tracked_path.parent
        while True:
            folders_with_tracked_descendants.add(current)
            if current == building_dir:
                break
            current = current.parent

    flagged = []
    for folder in sorted(path for path in building_dir.rglob('*') if path.is_dir() and not is_output_path(path)):
        if folder not in folders_with_tracked_descendants:
            flagged.append({
                'folder': str(folder.relative_to(building_dir)).replace('\\', '/'),
                'reason': 'folder-has-no-reading-file-descendants',
            })
    return flagged


def normalize_date_text(raw_value: str) -> str | None:
    text = raw_value.strip().replace('_', ' ')
    if not text:
        return None

    patterns = [
        ('%Y/%m/%d %H:%M:%S', False),
        ('%Y/%m/%d %H:%M', False),
        ('%Y-%m-%d %H:%M:%S', False),
        ('%Y-%m-%d %H:%M', False),
        ('%d/%m/%Y %H:%M:%S', False),
        ('%d/%m/%Y %H:%M', False),
        ('%d-%m-%Y %H:%M:%S', False),
        ('%d-%m-%Y %H:%M', False),
        ('%Y.%m.%d', True),
        ('%Y/%m/%d', True),
        ('%Y-%m-%d', True),
        ('%d.%m.%Y', True),
        ('%d/%m/%Y', True),
        ('%d-%m-%Y', True),
        ('%d %B %Y', True),
        ('%d %b %Y', True),
        ('%d%B%Y', True),
        ('%d%b%Y', True),
        ('%Y%m%d %H%M%S', False),
        ('%Y%m%d', True),
    ]
    compact_text = text.replace(' ', '')
    for fmt, date_only in patterns:
        try:
            candidate = compact_text if '%Y%m%d' in fmt else text
            parsed = datetime.strptime(candidate, fmt)
            return parsed.date().isoformat() if date_only else parsed.isoformat(timespec='seconds')
        except ValueError:
            continue
    return None


def add_candidate(candidates: list[Candidate], value: str | None, source: str, score: int) -> None:
    if not value:
        return
    normalized = value.strip()
    if not normalized:
        return
    candidates.append(Candidate(normalized, source, score))


def best_candidate(candidates: list[Candidate]) -> Candidate | None:
    if not candidates:
        return None
    deduped: dict[str, Candidate] = {}
    for candidate in candidates:
        existing = deduped.get(candidate.value)
        if existing is None or candidate.score > existing.score:
            deduped[candidate.value] = candidate
    return sorted(deduped.values(), key=lambda item: (-item.score, -len(item.value), item.value))[0]


def extract_date_from_text(text: str, source: str, score: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    for pattern in DATE_PATTERNS:
        for match in pattern.finditer(text):
            normalized = normalize_date_text(match.group('value'))
            add_candidate(candidates, normalized, source, score)
    return candidates


def extract_path_date_candidates(image_path: Path, building_dir: Path) -> list[Candidate]:
    candidates: list[Candidate] = []
    relative_parts = [part for part in image_path.relative_to(building_dir).parts if part.lower() != OUTPUT_DIR_NAME.lower()]
    for part in reversed(relative_parts):
        candidates.extend(extract_date_from_text(part, f'path:{part}', 80))
    return candidates


def extract_exif_date_candidates(image: Image.Image) -> list[Candidate]:
    candidates: list[Candidate] = []
    exif = image.getexif()
    for tag in (36867, 36868, 306):
        raw_value = exif.get(tag)
        if not raw_value:
            continue
        normalized = normalize_date_text(str(raw_value).replace(':', '-', 2))
        if normalized is None:
            normalized = normalize_date_text(str(raw_value))
        add_candidate(candidates, normalized, f'exif:{tag}', 85)
    return candidates


def extract_unit_candidates_from_text(text: str, source: str, score: int, allow_compact_pattern: bool = True) -> list[Candidate]:
    candidates: list[Candidate] = []
    patterns = UNIT_LABEL_PATTERNS if allow_compact_pattern else UNIT_LABEL_PATTERNS[:1]
    for pattern in patterns:
        for match in pattern.finditer(text):
            value = re.sub(r'\s+', ' ', match.group('value').upper()).strip()
            if re.fullmatch(r'20\d{2}', value):
                continue
            if len(re.sub(r'[^0-9]', '', value)) == 0:
                continue
            add_candidate(candidates, value, source, score)
    return candidates


def extract_path_unit_candidates(image_path: Path, building_dir: Path) -> list[Candidate]:
    candidates: list[Candidate] = []
    for part in image_path.relative_to(building_dir).parts:
        candidates.extend(extract_unit_candidates_from_text(part, f'path:{part}', 75, allow_compact_pattern=True))
    return candidates


def extract_serial_candidates(text: str, source: str, score: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    for pattern in SERIAL_PATTERNS:
        for match in pattern.finditer(text):
            value = match.group('value').upper()
            digit_count = len(re.findall(r'\d', value))
            if digit_count < 4:
                continue
            add_candidate(candidates, value, source, score)
    return candidates


def filter_reading_token(token: str, disallowed: set[str]) -> bool:
    if token in disallowed:
        return False
    if token.startswith('20') and len(token) == 8:
        return False
    if token in {'220380', '50100'}:
        return False
    return True


def extract_reading_candidates(text: str, source: str, score: int, disallowed: set[str]) -> list[Candidate]:
    candidates: list[Candidate] = []
    sanitized_text = TIME_PATTERN.sub(' ', text)
    for match in READING_PATTERN.finditer(sanitized_text):
        integer_part = match.group('value')
        if not filter_reading_token(integer_part, disallowed):
            continue
        decimal_part = match.group('decimal')
        value = f'{integer_part}.{decimal_part}' if decimal_part else integer_part
        adjusted_score = score + min(len(integer_part), 8)
        add_candidate(candidates, value, source, adjusted_score)
    return candidates


def preprocess_image(image: Image.Image, threshold: int | None = None, invert: bool = False, scale: int = 4) -> Image.Image:
    grayscale = ImageOps.grayscale(image)
    grayscale = ImageOps.autocontrast(grayscale)
    grayscale = grayscale.resize((grayscale.width * scale, grayscale.height * scale))
    grayscale = grayscale.filter(ImageFilter.SHARPEN)
    if threshold is not None:
        grayscale = grayscale.point(lambda pixel: 255 if pixel > threshold else 0)
    if invert:
        grayscale = ImageOps.invert(grayscale)
    return grayscale


def image_crop(image: Image.Image, left: float, top: float, right: float, bottom: float) -> Image.Image:
    width, height = image.size
    return image.crop((width * left, height * top, width * right, height * bottom))


def ocr_text(image: Image.Image, config: str) -> str:
    text = pytesseract.image_to_string(image, config=config)
    return text.replace('\x0c', ' ').strip()


def extract_date_value(image: Image.Image, image_path: Path, building_dir: Path) -> tuple[Candidate | None, dict[str, str]]:
    debug: dict[str, str] = {}
    candidates = extract_path_date_candidates(image_path, building_dir)
    candidates.extend(extract_exif_date_candidates(image))
    if candidates:
        return best_candidate(candidates), debug

    date_crop = preprocess_image(image_crop(image, 0.70, 0.88, 0.995, 0.995), threshold=120, scale=5)
    date_text = ocr_text(date_crop, '--psm 7')
    debug['date_region'] = date_text[:120]
    candidates.extend(extract_date_from_text(date_text, 'ocr:date-region', 70))

    if not candidates:
        full_text = ocr_text(preprocess_image(image, scale=2), '--psm 11')
        debug['date_full'] = full_text[:160]
        candidates.extend(extract_date_from_text(full_text, 'ocr:full-image', 50))

    return best_candidate(candidates), debug


def extract_meter_identity(image: Image.Image, image_path: Path, building_dir: Path) -> tuple[Candidate | None, Candidate | None, Candidate | None, dict[str, str]]:
    debug: dict[str, str] = {}
    unit_candidates = extract_path_unit_candidates(image_path, building_dir)
    serial_candidates: list[Candidate] = []

    label_crop = preprocess_image(image_crop(image, 0.18, 0.76, 0.80, 0.98), threshold=130, scale=4)
    label_text = ocr_text(label_crop, '--psm 6')
    debug['label_region'] = label_text[:160]
    unit_candidates.extend(extract_unit_candidates_from_text(label_text, 'ocr:label-region', 78, allow_compact_pattern=True))

    center_crop = preprocess_image(image_crop(image, 0.20, 0.28, 0.80, 0.74), scale=3)
    center_text = ocr_text(center_crop, '--psm 6')
    debug['meter_region'] = center_text[:200]
    serial_candidates.extend(extract_serial_candidates(center_text, 'ocr:meter-region', 72))
    unit_candidates.extend(extract_unit_candidates_from_text(center_text, 'ocr:meter-region', 48, allow_compact_pattern=False))

    unit_candidate = best_candidate(unit_candidates)
    serial_candidate = best_candidate(serial_candidates)
    meter_number_candidate = serial_candidate or unit_candidate
    return meter_number_candidate, unit_candidate, serial_candidate, debug


def extract_meter_reading(image: Image.Image, disallowed_tokens: set[str]) -> tuple[Candidate | None, dict[str, str]]:
    debug: dict[str, str] = {}
    candidates: list[Candidate] = []
    crops = [
        ('reading_center', image_crop(image, 0.22, 0.32, 0.78, 0.68), '--psm 11', 62),
        ('reading_window', image_crop(image, 0.28, 0.36, 0.72, 0.58), '--psm 11', 68),
        ('reading_window_bin', image_crop(image, 0.28, 0.36, 0.72, 0.58), '--psm 6 -c tessedit_char_whitelist=0123456789', 72),
    ]

    for name, crop, config, score in crops:
        processed = preprocess_image(crop, scale=4)
        if 'bin' in name:
            processed = preprocess_image(crop, threshold=135, scale=6)
        text = ocr_text(processed, config)
        debug[name] = text[:200]
        candidates.extend(extract_reading_candidates(text, f'ocr:{name}', score, disallowed_tokens))
        if candidates:
            best = best_candidate(candidates)
            if best and best.score >= 74:
                return best, debug

    return best_candidate(candidates), debug


def summarize_confidence(candidate: Candidate | None) -> str:
    if candidate is None:
        return 'missing'
    if candidate.score >= 85:
        return 'high'
    if candidate.score >= 72:
        return 'medium'
    return 'low'


def relative_path(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace('\\', '/')


def resolve_reference_meter(
    building_reference: BuildingReference | None,
    image_path: Path,
    building_dir: Path,
    unit_candidate: Candidate | None,
    meter_number_candidate: Candidate | None,
) -> tuple[ReferenceMeter | None, str | None, list[str]]:
    if building_reference is None:
        return None, None, []

    raw_labels = []
    for candidate in extract_path_unit_candidates(image_path, building_dir):
        if candidate.value and candidate.value not in raw_labels:
            raw_labels.append(candidate.value)
    for candidate in (unit_candidate, meter_number_candidate):
        if candidate and candidate.value and candidate.value not in raw_labels:
            raw_labels.append(candidate.value)

    exact_matches: set[str] = set()
    base_matches: set[str] = set()
    for raw_label in raw_labels:
        exact_aliases, base_aliases = build_label_aliases(raw_label, 'UNIT')
        for alias in exact_aliases:
            exact_matches.update(building_reference.exact_alias_map.get(alias, ()))
        for alias in base_aliases:
            base_matches.update(building_reference.base_alias_map.get(alias, ()))

    if len(exact_matches) == 1:
        matched_number = next(iter(exact_matches))
        return building_reference.meters[matched_number], 'exact', raw_labels
    if len(exact_matches) > 1:
        return None, 'ambiguous', raw_labels

    if len(base_matches) == 1:
        matched_number = next(iter(base_matches))
        return building_reference.meters[matched_number], 'alias', raw_labels
    if len(base_matches) > 1:
        return None, 'ambiguous', raw_labels

    return None, 'missing' if not raw_labels else 'unmatched', raw_labels


def validate_reference_reading(reading_candidate: Candidate | None, reference_meter: ReferenceMeter | None) -> list[str]:
    if reading_candidate is None or reference_meter is None or reference_meter.latest_reading is None:
        return []
    try:
        reading_value = float(reading_candidate.value)
    except ValueError:
        return []
    if reading_value < reference_meter.latest_reading:
        return ['reading-below-last-known']
    return []


def build_document_review(document_path: Path, building_dir: Path) -> dict[str, Any]:
    return {
        'document_path': relative_path(document_path, building_dir),
        'containing_folder': relative_path(document_path.parent, building_dir),
        'file_name': document_path.name,
        'flags': ['unsupported-document-file'],
    }


def describe_match_kind(match_kind: str | None, reference_meter_number: str | None) -> str:
    if match_kind == 'exact' and reference_meter_number:
        return f'Matched directly to canonical meter {reference_meter_number}.'
    if match_kind == 'alias' and reference_meter_number:
        return f'Matched to canonical meter {reference_meter_number} through alias normalization.'
    if match_kind == 'ambiguous':
        return 'Meter label could map to multiple canonical meters and needs review.'
    if match_kind == 'unmatched':
        return 'A meter label was extracted but it did not match the canonical register.'
    if match_kind == 'missing':
        return 'No usable meter label was extracted for canonical matching.'
    return 'No canonical meter match description is available.'


def describe_capture_flags(flags: list[str], reading_value: str | None) -> str:
    if 'reading-below-last-known' in flags:
        return 'A reading was extracted, but it is lower than the last known reference reading and needs manual review.'
    if 'low-confidence-meter-reading' in flags and reading_value is not None:
        return 'A reading was extracted with low OCR confidence and should be verified manually.'
    if 'missing-meter-reading' in flags:
        return 'The image matched a meter, but no usable numeric reading was extracted.'
    if reading_value is not None:
        return 'A reading was extracted from the image.'
    return 'No reading capture outcome could be determined.'


def determine_capture_status(flags: list[str], reading_value: str | None) -> str:
    if 'reading-below-last-known' in flags or 'low-confidence-meter-reading' in flags:
        return 'needs-review'
    if reading_value is not None:
        return 'captured'
    if 'missing-meter-reading' in flags:
        return 'missing-reading'
    return 'unresolved'


def capture_sort_key(capture: dict[str, Any]) -> tuple[str, str]:
    return (str(capture.get('capture_date') or ''), str(capture.get('image_path') or ''))


def build_capture_payload(
    building_dir: Path,
    generated_at: str,
    tesseract_cmd: str,
    building_reference: BuildingReference | None,
    summary: dict[str, Any],
    document_reviews: list[dict[str, Any]],
    extractions: list[dict[str, Any]],
) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}
    unmatched_captures: list[dict[str, Any]] = []

    for extraction in extractions:
        meter_key = extraction.get('reference_meter_number') or extraction.get('meter_number') or extraction.get('unit_label') or extraction.get('file_name')
        capture_record = {
            'capture_date': extraction.get('date'),
            'image_path': extraction.get('image_path'),
            'file_name': extraction.get('file_name'),
            'containing_folder': extraction.get('containing_folder'),
            'extracted_meter_label': extraction.get('meter_number'),
            'extracted_unit_label': extraction.get('unit_label'),
            'extracted_serial_number': extraction.get('serial_number'),
            'extracted_reading': extraction.get('meter_reading'),
            'reading_confidence': extraction.get('meter_reading_confidence'),
            'reference_match_kind': extraction.get('reference_match_kind'),
            'reference_match_inputs': extraction.get('reference_match_inputs') or [],
            'capture_status': determine_capture_status(extraction.get('flags') or [], extraction.get('meter_reading')),
            'capture_description': describe_capture_flags(extraction.get('flags') or [], extraction.get('meter_reading')),
            'match_description': describe_match_kind(extraction.get('reference_match_kind'), extraction.get('reference_meter_number')),
            'flags': extraction.get('flags') or [],
        }

        if extraction.get('reference_meter_number') is None:
            unmatched_captures.append(capture_record)
            continue

        if meter_key not in grouped:
            grouped[meter_key] = {
                'unit_number': extraction.get('reference_meter_number') if extraction.get('reference_meter_type') == 'UNIT' else None,
                'meter_number': extraction.get('reference_meter_number'),
                'meter_type': extraction.get('reference_meter_type'),
                'latest_reference_reading': extraction.get('reference_last_reading'),
                'latest_reference_reading_date': extraction.get('reference_last_reading_date'),
                'captured_reading_count': 0,
                'missing_reading_capture_count': 0,
                'needs_review_capture_count': 0,
                'observed_labels': set(),
                'capture_dates': set(),
                'captures': [],
            }

        record = grouped[meter_key]
        if extraction.get('meter_number'):
            record['observed_labels'].add(extraction['meter_number'])
        if extraction.get('unit_label'):
            record['observed_labels'].add(extraction['unit_label'])
        if extraction.get('date'):
            record['capture_dates'].add(extraction['date'])
        record['captures'].append(capture_record)

        capture_status = capture_record['capture_status']
        if capture_status == 'captured':
            record['captured_reading_count'] += 1
        elif capture_status == 'missing-reading':
            record['missing_reading_capture_count'] += 1
        elif capture_status == 'needs-review':
            record['needs_review_capture_count'] += 1

    meter_captures = []
    status_counter = Counter()
    for meter_number in sorted(grouped):
        record = grouped[meter_number]
        record['captures'].sort(key=capture_sort_key)
        record['observed_labels'] = sorted(record['observed_labels'])
        record['capture_dates'] = sorted(record['capture_dates'])

        if record['captured_reading_count'] > 0 and record['needs_review_capture_count'] == 0:
            record['meter_capture_status'] = 'captured'
            record['meter_capture_description'] = 'At least one reading was captured and no review-only capture blocks it.'
        elif record['needs_review_capture_count'] > 0:
            record['meter_capture_status'] = 'needs-review'
            record['meter_capture_description'] = 'One or more captures produced a reading that needs manual review before use.'
        elif record['missing_reading_capture_count'] > 0:
            record['meter_capture_status'] = 'missing-reading'
            record['meter_capture_description'] = 'A meter image exists, but no usable numeric reading was extracted.'
        else:
            record['meter_capture_status'] = 'unresolved'
            record['meter_capture_description'] = 'The meter capture outcome is unresolved.'

        status_counter.update([record['meter_capture_status']])
        meter_captures.append(record)

    unmatched_captures.sort(key=capture_sort_key)

    capture_summary = {
        'total_meter_capture_records': len(meter_captures),
        'total_unmatched_captures': len(unmatched_captures),
        'meter_capture_statuses': dict(sorted(status_counter.items())),
        'documents_requiring_review': len(document_reviews),
        'images_with_meter_reading': summary.get('images_with_meter_reading', 0),
        'images_without_meter_reading': summary.get('total_images', 0) - summary.get('images_with_meter_reading', 0),
        'reference_register_resolved': summary.get('reference_register_resolved', False),
    }

    return {
        'building_name': building_dir.name,
        'generated_at': generated_at,
        'tesseract_cmd': tesseract_cmd,
        'source_extraction_file': str((building_dir / OUTPUT_DIR_NAME / OUTPUT_FILE_NAME).resolve()),
        'reference_register': {
            'resolved': building_reference is not None,
            'scheme_name': building_reference.scheme_name if building_reference else None,
            'sheet_name': building_reference.sheet_name if building_reference else None,
            'sheet_slug': building_reference.sheet_slug if building_reference else None,
            'source_path': building_reference.source_path if building_reference else None,
            'meter_count': len(building_reference.meters) if building_reference else 0,
        },
        'summary': capture_summary,
        'meter_captures': meter_captures,
        'unmatched_captures': unmatched_captures,
        'documents_requiring_review': document_reviews,
    }


def process_image(image_path: Path, building_dir: Path, building_reference: BuildingReference | None) -> dict[str, Any]:
    image = Image.open(image_path)
    date_candidate, date_debug = extract_date_value(image, image_path, building_dir)
    meter_number_candidate, unit_candidate, serial_candidate, identity_debug = extract_meter_identity(image, image_path, building_dir)

    disallowed_tokens = set()
    if date_candidate:
        disallowed_tokens.update(re.findall(r'\d{4,8}', date_candidate.value))
    if serial_candidate:
        disallowed_tokens.update(re.findall(r'\d{4,8}', serial_candidate.value))
    if unit_candidate:
        disallowed_tokens.update(re.findall(r'\d{1,3}', unit_candidate.value))

    reading_candidate, reading_debug = extract_meter_reading(image, disallowed_tokens)

    flags = []
    if meter_number_candidate is None:
        flags.append('missing-meter-number')
    if serial_candidate is None:
        flags.append('missing-serial-number')
    if reading_candidate is None:
        flags.append('missing-meter-reading')
    if date_candidate is None:
        flags.append('missing-date')
    if summarize_confidence(meter_number_candidate) == 'low':
        flags.append('low-confidence-meter-number')
    if summarize_confidence(reading_candidate) == 'low':
        flags.append('low-confidence-meter-reading')
    if summarize_confidence(serial_candidate) == 'low':
        flags.append('low-confidence-serial-number')

    reference_meter, reference_match_kind, raw_reference_labels = resolve_reference_meter(
        building_reference,
        image_path,
        building_dir,
        unit_candidate,
        meter_number_candidate,
    )
    if building_reference and reference_match_kind == 'missing':
        flags.append('missing-reference-meter-match')
    elif building_reference and reference_match_kind == 'unmatched':
        flags.append('unmatched-reference-meter')
    elif building_reference and reference_match_kind == 'ambiguous':
        flags.append('ambiguous-reference-meter-match')
    flags.extend(validate_reference_reading(reading_candidate, reference_meter))

    return {
        'image_path': relative_path(image_path, building_dir),
        'containing_folder': relative_path(image_path.parent, building_dir),
        'file_name': image_path.name,
        'date': date_candidate.value if date_candidate else None,
        'date_source': date_candidate.source if date_candidate else None,
        'date_confidence': summarize_confidence(date_candidate),
        'meter_number': meter_number_candidate.value if meter_number_candidate else None,
        'meter_number_source': meter_number_candidate.source if meter_number_candidate else None,
        'meter_number_kind': 'serial-number' if meter_number_candidate and serial_candidate and meter_number_candidate.value == serial_candidate.value else ('unit-label' if meter_number_candidate else None),
        'meter_number_confidence': summarize_confidence(meter_number_candidate),
        'unit_label': unit_candidate.value if unit_candidate else None,
        'unit_label_source': unit_candidate.source if unit_candidate else None,
        'serial_number': serial_candidate.value if serial_candidate else None,
        'serial_number_source': serial_candidate.source if serial_candidate else None,
        'meter_reading': reading_candidate.value if reading_candidate else None,
        'meter_reading_source': reading_candidate.source if reading_candidate else None,
        'meter_reading_confidence': summarize_confidence(reading_candidate),
        'reference_scheme_name': building_reference.scheme_name if building_reference else None,
        'reference_sheet_slug': building_reference.sheet_slug if building_reference else None,
        'reference_meter_number': reference_meter.meter_number if reference_meter else None,
        'reference_meter_type': reference_meter.meter_type if reference_meter else None,
        'reference_last_reading': reference_meter.latest_reading if reference_meter else None,
        'reference_last_reading_date': reference_meter.latest_reading_date if reference_meter else None,
        'reference_match_kind': reference_match_kind,
        'reference_match_inputs': raw_reference_labels,
        'flags': flags,
        'ocr_samples': {
            **date_debug,
            **identity_debug,
            **reading_debug,
        },
    }


def process_building(building_dir: Path, workers: int, limit_images: int | None) -> dict[str, Any]:
    building_reference = resolve_building_reference(building_dir)
    all_image_files = collect_image_files(building_dir)
    document_files = collect_document_files(building_dir)
    image_files = all_image_files
    if limit_images is not None:
        image_files = image_files[:limit_images]
    flagged_folders = collect_flagged_folders(building_dir, all_image_files + document_files)
    extractions: list[dict[str, Any]] = []
    document_reviews = [build_document_review(path, building_dir) for path in document_files]

    if image_files:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            future_map = {
                executor.submit(process_image, image_path, building_dir, building_reference): image_path
                for image_path in image_files
            }
            for future in concurrent.futures.as_completed(future_map):
                image_path = future_map[future]
                try:
                    extractions.append(future.result())
                except Exception as error:  # noqa: BLE001
                    extractions.append({
                        'image_path': relative_path(image_path, building_dir),
                        'containing_folder': relative_path(image_path.parent, building_dir),
                        'file_name': image_path.name,
                        'date': None,
                        'meter_number': None,
                        'unit_label': None,
                        'serial_number': None,
                        'meter_reading': None,
                        'reference_scheme_name': building_reference.scheme_name if building_reference else None,
                        'reference_sheet_slug': building_reference.sheet_slug if building_reference else None,
                        'reference_meter_number': None,
                        'reference_meter_type': None,
                        'reference_last_reading': None,
                        'reference_last_reading_date': None,
                        'reference_match_kind': None,
                        'reference_match_inputs': [],
                        'flags': [f'processing-error:{error}'],
                        'ocr_samples': {},
                    })

    extractions.sort(key=lambda item: item['image_path'])
    flag_counter = Counter()
    for extraction in extractions:
        flag_counter.update(extraction.get('flags', []))
    for document_review in document_reviews:
        flag_counter.update(document_review.get('flags', []))

    summary = {
        'total_images': len(extractions),
        'total_documents_requiring_review': len(document_reviews),
        'folders_without_images': len(flagged_folders),
        'images_with_meter_number': sum(1 for item in extractions if item.get('meter_number')),
        'images_with_serial_number': sum(1 for item in extractions if item.get('serial_number')),
        'images_with_meter_reading': sum(1 for item in extractions if item.get('meter_reading')),
        'images_with_date': sum(1 for item in extractions if item.get('date')),
        'images_with_reference_match': sum(1 for item in extractions if item.get('reference_meter_number')),
        'reference_register_resolved': building_reference is not None,
        'reference_register_meter_count': len(building_reference.meters) if building_reference else 0,
        'flags': dict(sorted(flag_counter.items())),
    }

    output_dir = building_dir / OUTPUT_DIR_NAME
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        'building_name': building_dir.name,
        'generated_at': now_iso(),
        'tesseract_cmd': pytesseract.pytesseract.tesseract_cmd,
        'reference_register': {
            'resolved': building_reference is not None,
            'scheme_name': building_reference.scheme_name if building_reference else None,
            'sheet_name': building_reference.sheet_name if building_reference else None,
            'sheet_slug': building_reference.sheet_slug if building_reference else None,
            'source_path': building_reference.source_path if building_reference else None,
            'meter_count': len(building_reference.meters) if building_reference else 0,
        },
        'summary': summary,
        'folders_without_images': flagged_folders,
        'documents_requiring_review': document_reviews,
        'images': extractions,
    }
    output_path = output_dir / OUTPUT_FILE_NAME
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding='utf-8')

    capture_payload = build_capture_payload(
        building_dir=building_dir,
        generated_at=payload['generated_at'],
        tesseract_cmd=pytesseract.pytesseract.tesseract_cmd,
        building_reference=building_reference,
        summary=summary,
        document_reviews=document_reviews,
        extractions=extractions,
    )
    capture_output_path = output_dir / CAPTURE_OUTPUT_FILE_NAME
    capture_output_path.write_text(json.dumps(capture_payload, indent=2, ensure_ascii=True), encoding='utf-8')

    print(
        f'Processed {building_dir.name}: {summary["total_images"]} images, '
        f'{summary["images_with_meter_reading"]} readings, '
        f'{summary["images_with_reference_match"]} reference matches, '
        f'{summary["total_documents_requiring_review"]} documents to review, '
        f'{summary["folders_without_images"]} flagged folders',
        flush=True,
    )
    return {
        'building_name': building_dir.name,
        'output_path': str(output_path),
        'capture_output_path': str(capture_output_path),
        'summary': summary,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Extract meter metadata from building image folders into per-building JSON files.')
    parser.add_argument('--building', action='append', dest='buildings', help='Limit processing to a specific building folder name. Can be supplied multiple times.')
    parser.add_argument('--workers', type=int, default=4, help='Maximum number of concurrent image workers per building.')
    parser.add_argument('--limit-images', type=int, default=None, help='Process only the first N images per building. Useful for validation runs.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    configure_tesseract()

    results = []
    for building_dir in iter_building_dirs(args.buildings):
        results.append(process_building(building_dir, args.workers, args.limit_images))

    summary_path = BUILDINGS_DIR / OUTPUT_DIR_NAME / 'building-image-extraction-summary.json'
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps({'generated_at': now_iso(), 'buildings': results}, indent=2, ensure_ascii=True),
        encoding='utf-8',
    )
    print(f'Wrote global summary: {summary_path}', flush=True)


if __name__ == '__main__':
    main()