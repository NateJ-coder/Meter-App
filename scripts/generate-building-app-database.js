'use strict';

/**
 * generate-building-app-database.js
 *
 * Regenerates Buildings/app-database/*.app-database.json files sourced
 * EXCLUSIVELY from the Buildings/buildings/ folder.
 *
 * Data sources (in priority order per building):
 *   1. meter-capture-readings.json  (e.g., Azores)
 *   2. *.xlsx files                 (e.g., Bonifay, Phanda Lodge, Vista Del Monte)
 *   3. Image filenames              (unit existence confirmation only; no readings)
 *
 * Historical pipeline sources (utility-dash-app-payload.json,
 * DataMigration/outputs/) are NOT consulted.
 *
 * Configuration preserved from existing app-database:
 *   - building / scheme identity records (IDs are kept stable for Firebase)
 *   - units / meters registry (pq_factor, meter_type, etc.)
 *   - charge_modes and settings_snapshot (billing configuration)
 *
 * Historical data removed from output:
 *   - cycles              → []
 *   - historical_readings → []
 *   - legacy_meter_map    → []
 *
 * meter.last_reading / meter.last_reading_date are updated ONLY from folder
 * data.  Meters with no matching folder entry keep their existing last_reading
 * value (it is still the last confirmed reading; we simply have no newer
 * folder data for them yet).
 *
 * Usage:
 *   node scripts/generate-building-app-database.js
 *   node scripts/generate-building-app-database.js --building azores
 */

const fs = require('fs');
const path = require('path');
const DEFAULT_NORMALIZED_DIR = path.resolve(__dirname, '..', 'DataMigration', 'outputs', 'sheet-normalized');
const DEFAULT_APP_DB_DIR = path.resolve(__dirname, '..', 'Buildings', 'app-database');
const DEFAULT_BUILDINGS_ROOT = path.resolve(__dirname, '..', 'Buildings', 'buildings');

/** Month abbreviation → zero-padded month number */
const MONTH_ABBR = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

// ─── String helpers ────────────────────────────────────────────────────────

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'unknown';
}

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCompactKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function stripFolderSuffix(value) {
    return String(value || '')
        .replace(/\s*-\s*completed$/i, '')
        .replace(/\s*-\s*march\s*completed$/i, '')
        .trim();
}

function padUnit(n, width) {
    return String(n).padStart(width || 2, '0');
}

// ─── Date extraction ───────────────────────────────────────────────────────

/**
 * Extract ALL dates found in a text string and return them as ISO strings.
 * Recognises:
 *   • YYYY.MM.DD / YYYY-MM-DD / YYYY_MM_DD  (ISO-style)
 *   • DD.MM.YYYY / DD-MM-YYYY               (European day-first)
 *   • 3Mar 2026 / 12Apr 2026                (verbal)
 */
function extractAllDatesFromText(text) {
    const t = String(text || '');
    const results = [];

    // ISO-style: 2026.03.31, 2026-03-31, 2026_03_31
    for (const m of t.matchAll(/(20\d{2})[.\-_](\d{2})[.\-_](\d{2})/g)) {
        results.push(`${m[1]}-${m[2]}-${m[3]}`);
    }

    // European day-first: 01.04.2026, 12-04-2026 (only when year is 4 digits at end)
    for (const m of t.matchAll(/\b(\d{2})[.\-](\d{2})[.\-](20\d{2})\b/g)) {
        const dd = m[1], mm = m[2], yyyy = m[3];
        // Validate plausible month/day ranges
        if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
            results.push(`${yyyy}-${mm}-${dd}`);
        }
    }

    // Verbal: 3Mar 2026, 12Apr 2026
    for (const m of t.matchAll(/(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/gi)) {
        const day = padUnit(parseInt(m[1]));
        const month = MONTH_ABBR[m[2].toLowerCase()];
        results.push(`${m[3]}-${month}-${day}`);
    }

    return results;
}

/**
 * Extract the LAST (most recent) date found in a file path or name string.
 */
function extractLatestDateFromText(text) {
    const dates = extractAllDatesFromText(text);
    if (!dates.length) return null;
    return dates.sort().pop();
}

/**
 * Walk a building folder and return the latest date found across all
 * file names and directory names.
 */
function findLatestDateFromFolder(buildingFolderPath) {
    const all = [];
    try {
        walkDir(buildingFolderPath, (fullPath) => {
            for (const d of extractAllDatesFromText(path.basename(fullPath))) {
                all.push(d);
            }
        });
        // Also check subfolder names
        const scanDirs = (dir) => {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                for (const d of extractAllDatesFromText(entry.name)) {
                    all.push(d);
                }
                if (entry.isDirectory()) scanDirs(path.join(dir, entry.name));
            }
        };
        scanDirs(buildingFolderPath);
    } catch (_) { /* ignore */ }
    if (!all.length) return null;
    return all.sort().pop();
}

/**
 * Given a reading date string (YYYY-MM-DD), return a { start_date, end_date }
 * pair suitable for a billing cycle.
 *
 * start_date = first day of the same month.
 * end_date   = the reading date.
 * If they would be equal (reading on the 1st), back start up to the first
 * of the previous month so the cycle always spans a range.
 */
function cycleWindowFromDate(dateStr) {
    if (!dateStr) return null;
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    if (!yyyy || !mm || !dd) return null;
    const startSameMonth = `${yyyy}-${padUnit(mm)}-01`;
    if (startSameMonth === dateStr) {
        // Reading is on the 1st — back start to first of previous month
        const prev = new Date(yyyy, mm - 2, 1); // month is 0-based
        const py = prev.getFullYear();
        const pm = padUnit(prev.getMonth() + 1);
        return { start_date: `${py}-${pm}-01`, end_date: dateStr };
    }
    return { start_date: startSameMonth, end_date: dateStr };
}

// ─── Building folder discovery ─────────────────────────────────────────────

function listBuildingFolders(buildingsRoot) {
    if (!fs.existsSync(buildingsRoot)) {
        return [];
    }
    return fs.readdirSync(buildingsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({
            name: e.name,
            fullPath: path.join(buildingsRoot, e.name),
            normalized: normalizeKey(stripFolderSuffix(e.name)),
            compact: normalizeCompactKey(stripFolderSuffix(e.name))
        }));
}

function findBuildingFolder(folderEntries, candidates) {
    const keys = candidates
        .filter(Boolean)
        .flatMap((c) => {
            const v = String(c).trim();
            const list = [v];
            if (/^the\s+/i.test(v)) {
                list.push(v.replace(/^the\s+/i, '').trim());
            }
            return list;
        });

    for (const c of keys) {
        const match = folderEntries.find((e) => e.normalized === normalizeKey(c));
        if (match) {
            return match.fullPath;
        }
    }
    for (const c of keys) {
        const match = folderEntries.find((e) => e.compact === normalizeCompactKey(c));
        if (match) {
            return match.fullPath;
        }
    }
    return null;
}

// ─── Directory walk ────────────────────────────────────────────────────────

function walkDir(dir, collector) {
    if (!fs.existsSync(dir)) {
        return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(full, collector);
        } else {
            collector(full, entry.name);
        }
    }
}

// ─── Source 1: meter-capture-readings.json ─────────────────────────────────

function loadCaptureReadings(buildingFolderPath) {
    const found = [];
    walkDir(buildingFolderPath, (fullPath, name) => {
        if (name === 'meter-capture-readings.json') {
            found.push(fullPath);
        }
    });
    if (!found.length) {
        return null;
    }
    found.sort();
    try {
        return JSON.parse(fs.readFileSync(found[found.length - 1], 'utf8'));
    } catch (_) {
        return null;
    }
}

/**
 * Build a Map<UNIT_LABEL_UPPER, {reading, date, source}> from a
 * meter-capture-readings JSON payload.
 *
 * Priority per capture entry:
 *   1. extracted_reading from the first capture with a valid numeric value
 *   2. latest_reference_reading (last confirmed reading from the reference register)
 *
 * Only entries that yield a numeric reading are included in the map.
 * The presence of an entry in meter_captures confirms the meter is active;
 * the buildings folder is treated as the authoritative source of truth.
 */
function buildReadingMapFromCapture(captureData) {
    const map = new Map();
    if (!captureData || !Array.isArray(captureData.meter_captures)) {
        return map;
    }

    for (const capture of captureData.meter_captures) {
        const key = String(capture.unit_number || capture.meter_number || '').trim().toUpperCase();
        if (!key) {
            continue;
        }

        let reading = null;
        let readingDate = null;
        let readingSource = null;

        for (const c of capture.captures || []) {
            if (c.extracted_reading != null) {
                const val = parseFloat(c.extracted_reading);
                if (Number.isFinite(val)) {
                    reading = val;
                    readingDate = c.capture_date || null;
                    readingSource = 'captured_image';
                    break;
                }
            }
        }

        if (reading == null && capture.latest_reference_reading != null) {
            reading = capture.latest_reference_reading;
            readingDate = capture.latest_reference_reading_date || null;
            readingSource = 'reference_register';
        }

        if (reading != null) {
            map.set(key, { reading, date: readingDate, source: readingSource });
        }
    }

    return map;
}

// ─── Source 2: Excel files ─────────────────────────────────────────────────

let _XLSX = null;
function requireXLSX() {
    if (!_XLSX) {
        _XLSX = require('xlsx');
    }
    return _XLSX;
}

function findExcelFiles(buildingFolderPath) {
    const results = [];
    walkDir(buildingFolderPath, (fullPath, name) => {
        if (/\.xlsx$/i.test(name)) {
            results.push(fullPath);
        }
    });
    return results;
}

/**
 * Pick the most recent Excel file from a list, scored by the latest date
 * found in the full file path string.
 * Returns { path, date } — date may be null.
 */
function pickMostRecentExcel(excelPaths) {
    if (!excelPaths.length) {
        return null;
    }
    const scored = excelPaths.map((p) => ({
        path: p,
        date: extractLatestDateFromText(p) || '0000-00-00'
    }));
    scored.sort((a, b) => b.date.localeCompare(a.date));
    return scored[0];
}

/** Detect the index of the "Closing Reading" column from a header row. */
function detectClosingReadingCol(headerRow) {
    if (!Array.isArray(headerRow)) {
        return 2;
    }
    for (let i = 0; i < headerRow.length; i++) {
        if (String(headerRow[i] || '').toLowerCase().includes('closing')) {
            return i;
        }
    }
    return 2;
}

/** Detect the index of the unit/door identifier column from a header row. */
function detectUnitIdentifierCol(headerRow) {
    if (!Array.isArray(headerRow)) {
        return 0;
    }
    for (let i = 0; i < headerRow.length; i++) {
        const h = String(headerRow[i] || '').toLowerCase();
        if (h.includes('unit') || h.includes('door')) {
            return i;
        }
    }
    return 0;
}

/**
 * Parse an Excel file and return a Map<UNIT_LABEL_UPPER, {reading, date, source}>.
 *
 * @param {string}   excelPath    - absolute path to the .xlsx file
 * @param {Function} unitLabelFn  - converts raw cell value → unit label string (or null to skip row)
 * @param {string}   fallbackDate - ISO date string derived from the file path
 */
function buildReadingMapFromExcel(excelPath, unitLabelFn, fallbackDate) {
    const map = new Map();
    try {
        const xlsx = requireXLSX();
        const wb = xlsx.readFile(excelPath);
        const sheetName = wb.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        if (rows.length < 2) {
            return map;
        }

        const headerRow = rows[0];
        const unitCol = detectUnitIdentifierCol(headerRow);
        const closingCol = detectClosingReadingCol(headerRow);

        for (const row of rows.slice(1)) {
            const rawUnit = row[unitCol];
            if (rawUnit == null || rawUnit === '') {
                continue;
            }
            const rawClosing = row[closingCol];
            if (rawClosing == null) {
                continue;
            }
            const closing = parseFloat(rawClosing);
            if (!Number.isFinite(closing)) {
                continue;
            }
            const unitLabel = unitLabelFn(rawUnit);
            if (!unitLabel) {
                continue;
            }
            map.set(unitLabel.toUpperCase(), {
                reading: closing,
                date: fallbackDate || null,
                source: 'excel_closing_reading'
            });
        }
    } catch (err) {
        console.error(`  [WARN] Could not parse Excel at ${excelPath}: ${err.message}`);
    }
    return map;
}

// ─── Building-specific unit label formatters ───────────────────────────────
//
// Convert raw Excel cell values into the canonical meter_number used in the
// app-database (e.g., "BC 01", "PH 03", "VD 12").  The label MUST match
// the meter.meter_number in the existing app-database so the lookup succeeds.

const UNIT_LABEL_FORMATTERS = {
    bonifay: (raw) => {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? `BC ${padUnit(n)}` : null;
    },
    'phanda-lodge': (raw) => {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? `PH ${padUnit(n)}` : null;
    },
    'vista-del-monte': (raw) => {
        const m = String(raw).match(/^Unit\s+(\d+)$/i);
        if (!m) {
            return null;
        }
        return `VD ${padUnit(parseInt(m[1], 10))}`;
    }
};

// ─── Reading resolution entry point ────────────────────────────────────────

/**
 * Given a building slug and its source folder path, load the most
 * authoritative reading data available from the folder.
 *
 * Returns:
 *   {
 *     source:     'capture_json' | 'excel' | 'none',
 *     map:        Map<UNIT_LABEL_UPPER, {reading, date, source}>,
 *     sourceFile: string | null,
 *     sourceDate: string | null
 *   }
 */
function resolveReadingsFromFolder(buildingSlug, buildingFolderPath) {
    // Priority 1: meter-capture-readings.json
    const captureData = loadCaptureReadings(buildingFolderPath);
    if (captureData) {
        const map = buildReadingMapFromCapture(captureData);
        if (map.size > 0) {
            return {
                source: 'capture_json',
                map,
                sourceFile: captureData.source_extraction_file || null,
                sourceDate: captureData.generated_at ? captureData.generated_at.slice(0, 10) : null
            };
        }
    }

    // Priority 2: Excel files (only for buildings with a known label formatter)
    const labelFn = UNIT_LABEL_FORMATTERS[buildingSlug];
    if (labelFn) {
        const excelPaths = findExcelFiles(buildingFolderPath);
        if (excelPaths.length) {
            const picked = pickMostRecentExcel(excelPaths);
            const map = buildReadingMapFromExcel(picked.path, labelFn, picked.date);
            if (map.size > 0) {
                return {
                    source: 'excel',
                    map,
                    sourceFile: picked.path,
                    sourceDate: picked.date
                };
            }
        }
    }

    // Priority 3: scan all file/folder names for any date evidence
    const folderDate = findLatestDateFromFolder(buildingFolderPath);
    return { source: 'none', map: new Map(), sourceFile: null, sourceDate: folderDate };
}

// ─── App-database builder ──────────────────────────────────────────────────

/**
 * Produce a clean app-database record from the existing database +
 * folder-derived readings.
 *
 * Invariants:
 *  • cycles and historical_readings are always []  (pipeline data removed)
 *  • legacy_meter_map is always []
 *  • data_pipeline = 'buildings_folder_only'
 *  • Meters whose meter_number matches a folder reading get last_reading updated.
 *  • Meters not in the folder map keep their existing last_reading unchanged.
 *    (They still have a valid last-known reading; we simply have no newer
 *     folder data for them and do NOT assume a reading exists.)
 */
function buildCleanDatabase(existingDb, readingInfo, buildingFolderPath) {
    const metersUpdated = (existingDb.meters || []).map((meter) => {
        const key = String(meter.meter_number || '').trim().toUpperCase();
        const entry = readingInfo.map.get(key);
        if (entry) {
            return {
                ...meter,
                last_reading: entry.reading,
                last_reading_date: entry.date || meter.last_reading_date
            };
        }
        return { ...meter };
    });

    const matchedCount = (existingDb.meters || []).filter((m) =>
        readingInfo.map.has(String(m.meter_number || '').trim().toUpperCase())
    ).length;

    const noteBySource = {
        capture_json: 'Readings sourced from meter-capture-readings.json in building folder. Historical pipeline removed.',
        excel: 'Readings sourced from most recent Excel file in building folder. Historical pipeline removed.',
        none: 'No structured reading data found in building folder. Meter last_reading values retained from prior configuration. Historical pipeline removed.'
    };

    // Synthesize a CLOSED cycle from the folder reading date
    const cycles = [];
    const schemeId = existingDb.scheme && existingDb.scheme.id;
    const readingDate = readingInfo.sourceDate || null;
    if (schemeId && readingDate) {
        const window = cycleWindowFromDate(readingDate);
        if (window) {
            const buildingSlug = existingDb.building_slug || 'unknown';
            cycles.push({
                id: `cycle-${buildingSlug}-${window.end_date}`,
                scheme_id: schemeId,
                start_date: window.start_date,
                end_date: window.end_date,
                status: 'CLOSED',
                imported_from: 'buildings_folder'
            });
        }
    }

    return {
        record_type: 'building-app-database',
        building_slug: existingDb.building_slug,
        generated_at: new Date().toISOString(),
        data_pipeline: 'buildings_folder_only',
        source_references: {
            buildings_folder: buildingFolderPath || null,
            reading_source_type: readingInfo.source,
            reading_source_file: readingInfo.sourceFile || null,
            reading_source_date: readingDate,
            meters_with_folder_reading: matchedCount,
            note: noteBySource[readingInfo.source] || noteBySource.none
        },
        building: existingDb.building,
        scheme: existingDb.scheme,
        settings_snapshot: existingDb.settings_snapshot || {},
        charge_modes: Array.isArray(existingDb.charge_modes) ? existingDb.charge_modes : [],
        cycles,
        units: existingDb.units || [],
        meters: metersUpdated,
        legacy_meter_map: [],
        historical_readings: []
    };
}

// ─── CLI argument parsing ──────────────────────────────────────────────────

function parseArgs(argv) {
    const opts = {
        appDbDir: DEFAULT_APP_DB_DIR,
        buildingsRoot: DEFAULT_BUILDINGS_ROOT,
        onlySlug: null
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--building' && next) {
            opts.onlySlug = slugify(next);
            i++;
        }
        if (arg === '--app-db-dir' && next) {
            opts.appDbDir = path.resolve(next);
            i++;
        }
        if (arg === '--buildings-root' && next) {
            opts.buildingsRoot = path.resolve(next);
            i++;
        }
    }
    return opts;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(opts.appDbDir)) {
        console.error(`App-database directory not found: ${opts.appDbDir}`);
        process.exitCode = 1;
        return;
    }

    const buildingFolders = listBuildingFolders(opts.buildingsRoot);

    const dbFiles = fs.readdirSync(opts.appDbDir)
        .filter((f) => f.endsWith('.app-database.json'))
        .sort()
        .filter((f) => !opts.onlySlug || f.startsWith(`${opts.onlySlug}.`));

    if (!dbFiles.length) {
        console.error(`No app-database files matched${opts.onlySlug ? ` slug "${opts.onlySlug}"` : ''}.`);
        process.exitCode = 1;
        return;
    }

    const results = [];

    for (const dbFile of dbFiles) {
        const dbPath = path.join(opts.appDbDir, dbFile);
        const existingDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const slug = existingDb.building_slug || dbFile.replace('.app-database.json', '');

        const candidates = [
            existingDb.building && existingDb.building.name,
            existingDb.scheme && existingDb.scheme.name,
            existingDb.building && existingDb.building.source_reference,
            slug
        ];
        const buildingFolderPath = findBuildingFolder(buildingFolders, candidates);

        const readingInfo = buildingFolderPath
            ? resolveReadingsFromFolder(slug, buildingFolderPath)
            : { source: 'none', map: new Map(), sourceFile: null, sourceDate: null };

        const cleanDb = buildCleanDatabase(existingDb, readingInfo, buildingFolderPath);
        fs.writeFileSync(dbPath, JSON.stringify(cleanDb, null, 2));

        results.push({
            slug,
            buildingFolder: buildingFolderPath ? path.basename(buildingFolderPath) : '(not found)',
            readingSource: readingInfo.source,
            metersWithFolderReading: cleanDb.source_references.meters_with_folder_reading,
            totalUnits: cleanDb.units.length,
            totalMeters: cleanDb.meters.length,
            cyclesRemoved: (existingDb.cycles || []).length,
            historicalReadingsRemoved: (existingDb.historical_readings || []).length
        });
    }

    const totalCyclesRemoved = results.reduce((s, r) => s + r.cyclesRemoved, 0);
    const totalReadingsRemoved = results.reduce((s, r) => s + r.historicalReadingsRemoved, 0);

    console.log(JSON.stringify({
        buildingsRoot: opts.buildingsRoot,
        appDbDir: opts.appDbDir,
        dataPipeline: 'buildings_folder_only',
        summary: {
            buildingsProcessed: results.length,
            totalCyclesRemoved,
            totalHistoricalReadingsRemoved: totalReadingsRemoved
        },
        results
    }, null, 2));
}

main();
