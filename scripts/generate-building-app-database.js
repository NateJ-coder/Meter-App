const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE = path.resolve(__dirname, '..', 'source-documents', '03-extracted-outputs', 'utility-dash-app', 'utility-dash-app-payload.json');
const DEFAULT_MANIFEST = path.resolve(__dirname, '..', 'DataMigration', 'outputs', 'reviews', 'workbook-sheet-export-manifest.json');
const DEFAULT_NORMALIZED_DIR = path.resolve(__dirname, '..', 'DataMigration', 'outputs', 'sheet-normalized');
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '..', 'Buildings', 'app-database');
const DEFAULT_BUILDINGS_ROOT = path.resolve(__dirname, '..', 'Buildings', 'buildings');
const METER_NUMBER_NOTE = 'meter_number currently equals the legacy meter label because no distinct serial-number field was found in the extracted sources';

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

function stripCompletedSuffix(value) {
    return String(value || '')
        .replace(/\s*-\s*completed$/i, '')
        .replace(/\s*-\s*march\s*completed$/i, '')
        .trim();
}

function parseArgs(argv) {
    const options = {
        source: DEFAULT_SOURCE,
        manifest: DEFAULT_MANIFEST,
        normalizedDir: DEFAULT_NORMALIZED_DIR,
        outputDir: DEFAULT_OUTPUT_DIR,
        buildingsRoot: DEFAULT_BUILDINGS_ROOT,
        onlyBuilding: null,
        overwrite: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const nextArg = argv[index + 1];

        if (arg === '--source' && nextArg) {
            options.source = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--manifest' && nextArg) {
            options.manifest = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--normalized-dir' && nextArg) {
            options.normalizedDir = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--output-dir' && nextArg) {
            options.outputDir = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--buildings-root' && nextArg) {
            options.buildingsRoot = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--building' && nextArg) {
            options.onlyBuilding = slugify(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--overwrite') {
            options.overwrite = true;
        }
    }

    return options;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listBuildingFolders(buildingsRoot) {
    if (!fs.existsSync(buildingsRoot)) {
        return [];
    }

    return fs.readdirSync(buildingsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
            name: entry.name,
            fullPath: path.join(buildingsRoot, entry.name),
            normalized: normalizeKey(stripCompletedSuffix(entry.name)),
            compact: normalizeCompactKey(stripCompletedSuffix(entry.name))
        }));
}

function findBuildingFolder(folderEntries, candidates) {
    const expandedCandidates = candidates
        .filter(Boolean)
        .flatMap((candidate) => {
            const baseValue = String(candidate).trim();
            const values = [baseValue];
            if (/^the\s+/i.test(baseValue)) {
                values.push(baseValue.replace(/^the\s+/i, '').trim());
            }
            return values;
        });

    for (const candidate of expandedCandidates) {
        const normalized = normalizeKey(candidate);
        const exact = folderEntries.find((entry) => entry.normalized === normalized);
        if (exact) {
            return exact.fullPath;
        }
    }

    for (const candidate of expandedCandidates) {
        const compact = normalizeCompactKey(candidate);
        const exact = folderEntries.find((entry) => entry.compact === compact);
        if (exact) {
            return exact.fullPath;
        }
    }

    return null;
}

function indexNormalizedSheets(manifest, manifestPath, normalizedDir) {
    const buildingSheets = (manifest.sheets || []).filter((sheet) => sheet.sheet_category === 'building');
    const manifestDir = path.dirname(manifestPath);

    return buildingSheets.map((sheet) => {
        const relativeNormalizedPath = String(sheet.normalized_json || '').replace(/\\/g, path.sep);
        const normalizedPath = path.resolve(manifestDir, '..', relativeNormalizedPath);
        const fallbackPath = path.resolve(normalizedDir, `${sheet.sheet_slug}.normalized.json`);
        const filePath = fs.existsSync(normalizedPath) ? normalizedPath : fallbackPath;

        return {
            ...sheet,
            filePath,
            payload: loadJson(filePath),
            nameKey: normalizeKey(sheet.sheet_name),
            slugKey: slugify(sheet.sheet_slug),
            schemeKey: normalizeKey(sheet.sheet_name)
        };
    });
}

function matchNormalizedSheet(indexedSheets, scheme, building) {
    const candidates = [
        building?.source_reference,
        building?.name,
        scheme?.name,
        scheme?.source_reference,
        scheme?.id ? scheme.id.replace(/^scheme-/, '') : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        const candidateKey = normalizeKey(candidate);
        const exactName = indexedSheets.find((sheet) => sheet.nameKey === candidateKey);
        if (exactName) {
            return exactName;
        }
    }

    for (const candidate of candidates) {
        const candidateSlug = slugify(candidate);
        const exactSlug = indexedSheets.find((sheet) => sheet.slugKey === candidateSlug);
        if (exactSlug) {
            return exactSlug;
        }
    }

    return null;
}

function deriveNonNumericReadingRows(normalizedPayload) {
    return (normalizedPayload.electricity_rows || [])
        .map((row) => {
            const badReadings = (row.readings || [])
                .filter((reading) => {
                    if (reading.reading_value != null) {
                        return false;
                    }

                    const rawValue = reading.reading_value_raw;
                    return rawValue != null && String(rawValue).trim() !== '';
                })
                .map((reading) => ({
                    column_index: reading.column_index ?? null,
                    reading_label: reading.reading_label ?? null,
                    reading_date_raw: reading.reading_date_raw ?? null,
                    reading_date: reading.reading_date ?? null,
                    reading_value_raw: reading.reading_value_formula || reading.reading_value_raw || null
                }));

            if (!badReadings.length) {
                return null;
            }

            return {
                source_row: row.source_row ?? null,
                legacy_label: row.legacy_label ?? null,
                meter_type: row.meter_type ?? null,
                bad_reading_count: badReadings.length,
                bad_readings: badReadings
            };
        })
        .filter(Boolean);
}

function buildDataQuality(normalizedPayload) {
    return {
        review_flags: Array.isArray(normalizedPayload.review_flags) ? normalizedPayload.review_flags : [],
        non_numeric_reading_rows: deriveNonNumericReadingRows(normalizedPayload),
        meter_number_note: METER_NUMBER_NOTE
    };
}

function buildPayloadForScheme(sourcePayload, sourcePath, normalizedSheet, buildingFolderPath, scheme) {
    const building = (sourcePayload.buildings || []).find((item) => item.scheme_id === scheme.id);
    if (!building) {
        throw new Error(`No building found for scheme ${scheme.id}`);
    }

    const buildingId = building.id;
    const units = (sourcePayload.units || []).filter((item) => item.building_id === buildingId);
    const meters = (sourcePayload.meters || []).filter((item) => item.scheme_id === scheme.id);
    const meterIds = new Set(meters.map((item) => item.id));
    const cycles = (sourcePayload.cycles || []).filter((item) => item.scheme_id === scheme.id);
    const cycleIds = new Set(cycles.map((item) => item.id));
    const historicalReadings = (sourcePayload.readings || []).filter((item) => meterIds.has(item.meter_id) || cycleIds.has(item.cycle_id));
    const legacyMeterMap = (sourcePayload.legacy_meter_map || []).filter((item) => meterIds.has(item.meter_id));
    const buildingSlug = scheme.id.replace(/^scheme-/, '') || slugify(building.name || scheme.name);

    return {
        record_type: 'building-app-database',
        building_slug: buildingSlug,
        generated_at: new Date().toISOString(),
        source_references: {
            normalized_sheet_json: normalizedSheet?.filePath || null,
            utility_dash_app_payload_json: sourcePath,
            building_source_folder: buildingFolderPath || null
        },
        building,
        scheme,
        settings_snapshot: normalizedSheet?.payload?.settings_snapshot || {},
        charge_modes: Array.isArray(normalizedSheet?.payload?.charge_modes) ? normalizedSheet.payload.charge_modes : [],
        cycles,
        units,
        meters,
        legacy_meter_map: legacyMeterMap,
        historical_readings: historicalReadings,
        data_quality: normalizedSheet ? buildDataQuality(normalizedSheet.payload) : buildDataQuality({})
    };
}

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writePayload(outputPath, payload) {
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const sourcePayload = loadJson(options.source);
    const manifest = loadJson(options.manifest);
    const indexedSheets = indexNormalizedSheets(manifest, options.manifest, options.normalizedDir);
    const buildingFolders = listBuildingFolders(options.buildingsRoot);

    ensureDirectory(options.outputDir);

    const results = [];
    const skipped = [];

    for (const scheme of sourcePayload.schemes || []) {
        const building = (sourcePayload.buildings || []).find((item) => item.scheme_id === scheme.id);
        if (!building) {
            skipped.push({ scheme: scheme.name, reason: 'missing-building-record' });
            continue;
        }

        const normalizedSheet = matchNormalizedSheet(indexedSheets, scheme, building);
        const buildingSlug = scheme.id.replace(/^scheme-/, '') || slugify(building.name || scheme.name);
        if (options.onlyBuilding && buildingSlug !== options.onlyBuilding) {
            continue;
        }

        const outputPath = path.join(options.outputDir, `${buildingSlug}.app-database.json`);
        if (fs.existsSync(outputPath) && !options.overwrite) {
            skipped.push({ scheme: scheme.name, reason: 'existing-output', outputPath });
            continue;
        }

        const buildingFolderPath = findBuildingFolder(
            buildingFolders,
            [building.name, scheme.name, building.source_reference, normalizedSheet?.sheet_name]
        );

        const payload = buildPayloadForScheme(sourcePayload, options.source, normalizedSheet, buildingFolderPath, scheme);
        writePayload(outputPath, payload);

        results.push({
            scheme: scheme.name,
            building: building.name,
            buildingSlug,
            outputPath,
            normalizedSheet: normalizedSheet?.sheet_name || null,
            buildingFolderPath,
            units: payload.units.length,
            meters: payload.meters.length,
            cycles: payload.cycles.length,
            historicalReadings: payload.historical_readings.length,
            reviewFlags: payload.data_quality.review_flags.length,
            nonNumericRows: payload.data_quality.non_numeric_reading_rows.length
        });
    }

    console.log(JSON.stringify({
        source: options.source,
        manifest: options.manifest,
        outputDir: options.outputDir,
        generated: results,
        skipped
    }, null, 2));
}

main();