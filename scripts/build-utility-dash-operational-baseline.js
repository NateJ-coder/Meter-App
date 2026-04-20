const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE = path.resolve(__dirname, '..', 'source-documents', '03-extracted-outputs', 'utility-dash-app', 'utility-dash-app-payload.json');
const DEFAULT_OUTPUT = path.resolve(__dirname, '..', 'source-documents', '03-extracted-outputs', 'utility-dash-app', 'utility-dash-operational-baseline.json');
const DEFAULT_HISTORY_WINDOW = 3;
const BUILDINGS_ROOT = path.resolve(__dirname, '..', 'Buildings', 'buildings');
const CAPTURE_OUTPUT_FILENAME = 'meter-capture-readings.json';

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'unknown';
}

function listCapturePayloadPaths(rootDir) {
    const results = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.forEach((entry) => {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                return;
            }

            if (entry.isFile() && entry.name === CAPTURE_OUTPUT_FILENAME) {
                results.push(fullPath);
            }
        });
    }

    if (fs.existsSync(rootDir)) {
        walk(rootDir);
    }

    return results.sort();
}

function getMonthBounds(dateValue) {
    const date = new Date(`${dateValue}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }

    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

    return {
        monthKey: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
    };
}

function inferCaptureDateFromPath(pathValue) {
    const text = String(pathValue || '');
    const fullDateMatch = text.match(/(20\d{2})[._-](\d{2})[._-](\d{2})/);
    if (fullDateMatch) {
        return `${fullDateMatch[1]}-${fullDateMatch[2]}-${fullDateMatch[3]}`;
    }

    const monthMatch = text.match(/(20\d{2})[._-](\d{2})/);
    if (monthMatch) {
        return `${monthMatch[1]}-${monthMatch[2]}-01`;
    }

    return null;
}

function parseReadingValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (value == null) {
        return null;
    }

    const normalized = String(value).replace(/[^0-9.]+/g, '');
    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildCaptureFlag(flagCode) {
    const severityMap = {
        'reading-below-last-known': 'high',
        'missing-meter-reading': 'high',
        'low-confidence-meter-reading': 'medium',
        'unsupported-document-file': 'medium',
        'missing-serial-number': 'low'
    };

    const messageMap = {
        'reading-below-last-known': 'Imported OCR reading is lower than the prior trusted reference reading.',
        'missing-meter-reading': 'A capture exists for this meter, but no usable numeric reading was extracted.',
        'low-confidence-meter-reading': 'The imported OCR reading has low confidence and should be reviewed.',
        'unsupported-document-file': 'A source document needs manual review before the cycle is considered complete.',
        'missing-serial-number': 'The capture does not include a serial number.'
    };

    return {
        type: flagCode,
        severity: severityMap[flagCode] || 'medium',
        message: messageMap[flagCode] || flagCode,
        description: messageMap[flagCode] || flagCode
    };
}

function isTrustedImportedCapture(captureStatus, flags) {
    return captureStatus === 'captured' && !flags.some((flag) => flag.type === 'reading-below-last-known');
}

function choosePreferredCapture(existingCapture, nextCapture) {
    const rank = {
        captured: 0,
        'needs-review': 1,
        'missing-reading': 2
    };

    if (!existingCapture) {
        return nextCapture;
    }

    const existingRank = rank[existingCapture.capture_status] ?? 99;
    const nextRank = rank[nextCapture.capture_status] ?? 99;
    if (nextRank !== existingRank) {
        return nextRank < existingRank ? nextCapture : existingCapture;
    }

    return String(nextCapture.capture_date || '').localeCompare(String(existingCapture.capture_date || '')) >= 0
        ? nextCapture
        : existingCapture;
}

function augmentWithImportedCaptureCycles(sourcePayload) {
    const capturePayloadPaths = listCapturePayloadPaths(BUILDINGS_ROOT);
    if (capturePayloadPaths.length === 0) {
        return {
            ...sourcePayload,
            metadata: {
                ...(sourcePayload.metadata || {}),
                imported_capture_summary: {
                    files: 0,
                    cycles: 0,
                    readings: 0,
                    trusted_meter_updates: 0,
                    skipped_captures: 0
                }
            }
        };
    }

    const schemes = (sourcePayload.schemes || []).map((scheme) => ({ ...scheme }));
    const buildings = (sourcePayload.buildings || []).map((building) => ({ ...building }));
    const units = (sourcePayload.units || []).map((unit) => ({ ...unit }));
    const meters = (sourcePayload.meters || []).map((meter) => ({ ...meter }));
    const cycles = (sourcePayload.cycles || []).map((cycle) => ({ ...cycle }));
    const readings = (sourcePayload.readings || []).map((reading) => ({ ...reading }));

    const schemeByKey = new Map(schemes.map((scheme) => [normalizeKey(scheme.name), scheme]));
    const meterBySchemeAndNumber = new Map(
        meters.map((meter) => [`${meter.scheme_id}::${normalizeKey(meter.meter_number)}`, meter])
    );
    const existingCycleIds = new Set(cycles.map((cycle) => cycle.id));
    const existingReadingIds = new Set(readings.map((reading) => reading.id));
    const touchedMeterIds = new Set();

    const summary = {
        files: capturePayloadPaths.length,
        cycles: 0,
        readings: 0,
        trusted_meter_updates: 0,
        skipped_captures: 0
    };

    capturePayloadPaths.forEach((capturePath) => {
        const capturePayload = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
        const schemeName = capturePayload.reference_register?.scheme_name;
        const scheme = schemeByKey.get(normalizeKey(schemeName));
        if (!scheme) {
            summary.skipped_captures += 1;
            return;
        }

        const captureGroups = new Map();
        (capturePayload.meter_captures || []).forEach((meterCapture) => {
            (meterCapture.captures || []).forEach((capture) => {
                const resolvedCaptureDate = capture.capture_date || inferCaptureDateFromPath(capture.containing_folder) || inferCaptureDateFromPath(capture.image_path);
                const bounds = getMonthBounds(resolvedCaptureDate);
                if (!bounds) {
                    summary.skipped_captures += 1;
                    return;
                }

                const groupKey = `${scheme.id}::${bounds.monthKey}`;
                const group = captureGroups.get(groupKey) || {
                    bounds,
                    sourceFolders: new Set(),
                    capturesByMeterNumber: new Map()
                };

                group.sourceFolders.add(capture.containing_folder || 'unknown-folder');
                const existingCapture = group.capturesByMeterNumber.get(meterCapture.meter_number);
                group.capturesByMeterNumber.set(
                    meterCapture.meter_number,
                    {
                        meterCapture,
                        capture: choosePreferredCapture(existingCapture?.capture, {
                            ...capture,
                            capture_date: resolvedCaptureDate
                        })
                    }
                );
                captureGroups.set(groupKey, group);
            });
        });

        captureGroups.forEach((group) => {
            const cycleId = `cycle-${slugify(scheme.name)}-${group.bounds.monthKey}-image-upload`;
            if (!existingCycleIds.has(cycleId)) {
                cycles.push({
                    id: cycleId,
                    scheme_id: scheme.id,
                    name: `Imported Capture ${group.bounds.monthKey}`,
                    start_date: group.bounds.startDate,
                    end_date: group.bounds.endDate,
                    status: 'CLOSED',
                    created_at: capturePayload.generated_at || new Date().toISOString(),
                    imported_from: 'image_capture_upload',
                    opened_via: 'import',
                    closed_at: capturePayload.generated_at || new Date().toISOString(),
                    closed_via: 'import',
                    source_reference: Array.from(group.sourceFolders).sort().join(' | ')
                });
                existingCycleIds.add(cycleId);
                summary.cycles += 1;
            }

            group.capturesByMeterNumber.forEach(({ meterCapture, capture }) => {
                const meter = meterBySchemeAndNumber.get(`${scheme.id}::${normalizeKey(meterCapture.meter_number)}`);
                if (!meter) {
                    summary.skipped_captures += 1;
                    return;
                }

                const readingValue = parseReadingValue(capture.extracted_reading);
                if (readingValue == null) {
                    return;
                }

                const flags = (capture.flags || []).map(buildCaptureFlag);
                const trustedCapture = isTrustedImportedCapture(capture.capture_status, flags);
                const previousReading = meterCapture.latest_reference_reading ?? meter.last_reading ?? null;
                const readingId = `reading-${slugify(scheme.name)}-${slugify(meter.id)}-${capture.capture_date}-image-upload`;

                if (existingReadingIds.has(readingId)) {
                    return;
                }

                readings.push({
                    id: readingId,
                    meter_id: meter.id,
                    cycle_id: cycleId,
                    reading_date: capture.capture_date,
                    reading_value: readingValue,
                    previous_reading: previousReading,
                    consumption: previousReading == null ? null : readingValue - previousReading,
                    reading_type: 'actual',
                    capture_method: 'image_ocr_import',
                    review_status: trustedCapture ? 'approved' : 'pending',
                    validation_status: trustedCapture ? 'validated' : 'needs_review',
                    validation_reason: trustedCapture ? '' : flags.map((flag) => flag.message).join(' | ') || capture.capture_description || 'Imported image capture needs review.',
                    flags,
                    source_file: capturePayload.source_extraction_file || capturePath,
                    source_row_reference: capture.image_path || capture.file_name || meterCapture.meter_number,
                    imported_from: 'image_capture_upload',
                    imported_at: capturePayload.generated_at || new Date().toISOString(),
                    notes: capture.capture_description || meterCapture.meter_capture_description || '',
                    created_at: capturePayload.generated_at || new Date().toISOString()
                });
                existingReadingIds.add(readingId);
                summary.readings += 1;

                if (trustedCapture) {
                    const previousTimestamp = toComparableTime({ reading_date: meter.last_reading_date, created_at: meter.created_at });
                    const nextTimestamp = toComparableTime({ reading_date: capture.capture_date, created_at: capturePayload.generated_at });
                    if (!touchedMeterIds.has(meter.id) || nextTimestamp >= previousTimestamp) {
                        meter.last_reading = readingValue;
                        meter.last_reading_date = capture.capture_date;
                        touchedMeterIds.add(meter.id);
                    }
                }
            });
        });
    });

    summary.trusted_meter_updates = touchedMeterIds.size;

    return {
        metadata: {
            ...(sourcePayload.metadata || {}),
            imported_capture_summary: summary
        },
        schemes,
        buildings,
        units,
        meters,
        cycles,
        readings,
        legacy_meter_map: sourcePayload.legacy_meter_map || []
    };
}

function parseArgs(argv) {
    const options = {
        source: DEFAULT_SOURCE,
        output: DEFAULT_OUTPUT,
        historyWindow: DEFAULT_HISTORY_WINDOW
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const nextArg = argv[index + 1];

        if (arg === '--source' && nextArg) {
            options.source = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--output' && nextArg) {
            options.output = path.resolve(nextArg);
            index += 1;
            continue;
        }

        if (arg === '--history-window' && nextArg) {
            const parsed = Number.parseInt(nextArg, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.historyWindow = parsed;
            }
            index += 1;
        }
    }

    return options;
}

function toComparableTime(record) {
    const candidate = record?.reading_date || record?.updated_at || record?.created_at || null;
    if (!candidate) {
        return 0;
    }

    const timestamp = new Date(candidate).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildCounts(payload) {
    return {
        schemes: payload.schemes?.length || 0,
        buildings: payload.buildings?.length || 0,
        units: payload.units?.length || 0,
        meters: payload.meters?.length || 0,
        cycles: payload.cycles?.length || 0,
        readings: payload.readings?.length || 0,
        legacy_meter_map: payload.legacy_meter_map?.length || 0
    };
}

function retainRecentReadings(readings, historyWindow) {
    const readingsByMeter = new Map();

    readings.forEach((reading) => {
        const items = readingsByMeter.get(reading.meter_id) || [];
        items.push(reading);
        readingsByMeter.set(reading.meter_id, items);
    });

    const retainedReadings = [];

    readingsByMeter.forEach((meterReadings) => {
        meterReadings
            .sort((left, right) => toComparableTime(right) - toComparableTime(left))
            .slice(0, historyWindow)
            .forEach((reading) => retainedReadings.push(reading));
    });

    retainedReadings.sort((left, right) => toComparableTime(left) - toComparableTime(right));
    return retainedReadings;
}

function buildOperationalBaseline(sourcePayload, historyWindow) {
    const enrichedPayload = augmentWithImportedCaptureCycles(sourcePayload);
    const retainedReadings = retainRecentReadings(enrichedPayload.readings || [], historyWindow);
    const retainedCycleIds = new Set(retainedReadings.map((reading) => reading.cycle_id));

    const retainedCycles = (enrichedPayload.cycles || []).filter((cycle) => {
        const status = String(cycle.status || '').toUpperCase();
        return retainedCycleIds.has(cycle.id) || status === 'OPEN';
    });

    const originalCounts = buildCounts(enrichedPayload);
    const baselinePayload = {
        metadata: {
            ...(enrichedPayload.metadata || {}),
            import_strategy: 'operational_baseline',
            history_window_per_meter: historyWindow,
            original_counts: originalCounts,
            retained_counts: {
                schemes: enrichedPayload.schemes?.length || 0,
                buildings: enrichedPayload.buildings?.length || 0,
                units: enrichedPayload.units?.length || 0,
                meters: enrichedPayload.meters?.length || 0,
                cycles: retainedCycles.length,
                readings: retainedReadings.length,
                legacy_meter_map: 0
            },
            baseline_generated_at: new Date().toISOString(),
            notes: [
                ...new Set([
                    ...((enrichedPayload.metadata && enrichedPayload.metadata.notes) || []),
                    `Operational baseline keeps up to ${historyWindow} most recent readings per meter for app runtime use.`,
                    'Imported capture uploads are materialized as closed cycles using folder-derived capture dates so the next cycle starts from the correct validation baseline.',
                    'Older reading history and the legacy meter map remain in the full Utility Dash payload for reference and audit backfill.'
                ])
            ]
        },
        schemes: enrichedPayload.schemes || [],
        buildings: enrichedPayload.buildings || [],
        units: enrichedPayload.units || [],
        meters: enrichedPayload.meters || [],
        cycles: retainedCycles,
        readings: retainedReadings,
        legacy_meter_map: []
    };

    return baselinePayload;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const rawPayload = JSON.parse(fs.readFileSync(options.source, 'utf8'));
    const baselinePayload = buildOperationalBaseline(rawPayload, options.historyWindow);

    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(baselinePayload, null, 2));

    const stats = fs.statSync(options.output);
    console.log(JSON.stringify({
        source: options.source,
        output: options.output,
        historyWindow: options.historyWindow,
        retainedCounts: baselinePayload.metadata.retained_counts,
        outputBytes: stats.size
    }, null, 2));
}

main();