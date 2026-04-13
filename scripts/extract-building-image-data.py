from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from shutil import which
from typing import Any

from PIL import Image, ImageFilter, ImageOps
import pytesseract


ROOT_DIR = Path(__file__).resolve().parents[1]
BUILDINGS_DIR = ROOT_DIR / 'Buildings' / 'buildings'
OUTPUT_DIR_NAME = 'cleaned images'
OUTPUT_FILE_NAME = 'meter-image-extractions.json'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}
COMMON_TESSERACT_PATHS = [
    Path(r'C:\Program Files\Tesseract-OCR\tesseract.exe'),
    Path(r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe'),
]

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


def collect_flagged_folders(building_dir: Path, image_files: list[Path]) -> list[dict[str, Any]]:
    folders_with_image_descendants: set[Path] = set()
    for image_path in image_files:
        current = image_path.parent
        while True:
            folders_with_image_descendants.add(current)
            if current == building_dir:
                break
            current = current.parent

    flagged = []
    for folder in sorted(path for path in building_dir.rglob('*') if path.is_dir() and not is_output_path(path)):
        if folder not in folders_with_image_descendants:
            flagged.append({
                'folder': str(folder.relative_to(building_dir)).replace('\\', '/'),
                'reason': 'folder-has-no-image-descendants',
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


def process_image(image_path: Path, building_dir: Path) -> dict[str, Any]:
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
        'flags': flags,
        'ocr_samples': {
            **date_debug,
            **identity_debug,
            **reading_debug,
        },
    }


def process_building(building_dir: Path, workers: int, limit_images: int | None) -> dict[str, Any]:
    all_image_files = collect_image_files(building_dir)
    image_files = all_image_files
    if limit_images is not None:
        image_files = image_files[:limit_images]
    flagged_folders = collect_flagged_folders(building_dir, all_image_files)
    extractions: list[dict[str, Any]] = []

    if image_files:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            future_map = {
                executor.submit(process_image, image_path, building_dir): image_path
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
                        'flags': [f'processing-error:{error}'],
                        'ocr_samples': {},
                    })

    extractions.sort(key=lambda item: item['image_path'])
    flag_counter = Counter()
    for extraction in extractions:
        flag_counter.update(extraction.get('flags', []))

    summary = {
        'total_images': len(extractions),
        'folders_without_images': len(flagged_folders),
        'images_with_meter_number': sum(1 for item in extractions if item.get('meter_number')),
        'images_with_serial_number': sum(1 for item in extractions if item.get('serial_number')),
        'images_with_meter_reading': sum(1 for item in extractions if item.get('meter_reading')),
        'images_with_date': sum(1 for item in extractions if item.get('date')),
        'flags': dict(sorted(flag_counter.items())),
    }

    output_dir = building_dir / OUTPUT_DIR_NAME
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        'building_name': building_dir.name,
        'generated_at': now_iso(),
        'tesseract_cmd': pytesseract.pytesseract.tesseract_cmd,
        'summary': summary,
        'folders_without_images': flagged_folders,
        'images': extractions,
    }
    output_path = output_dir / OUTPUT_FILE_NAME
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding='utf-8')

    print(
        f'Processed {building_dir.name}: {summary["total_images"]} images, '
        f'{summary["images_with_meter_reading"]} readings, '
        f'{summary["folders_without_images"]} flagged folders',
        flush=True,
    )
    return {
        'building_name': building_dir.name,
        'output_path': str(output_path),
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