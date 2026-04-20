import { storage } from './storage.js';

const EPSILON = 0.01;

function pushAggregatedIssue(issuesByCode, code, severity, message, sampleValue = null) {
    const existing = issuesByCode.get(code);
    if (existing) {
        existing.count += 1;
        if (sampleValue && existing.samples.length < 5 && !existing.samples.includes(sampleValue)) {
            existing.samples.push(sampleValue);
        }
        return;
    }

    issuesByCode.set(code, {
        code,
        severity,
        message,
        count: 1,
        samples: sampleValue ? [sampleValue] : []
    });
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

function toTimestamp(value) {
    if (!value) {
        return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortIssues(issues) {
    const severityRank = { error: 0, warning: 1, info: 2 };
    return issues.slice().sort((left, right) => {
        const leftRank = severityRank[left.severity] ?? 99;
        const rightRank = severityRank[right.severity] ?? 99;
        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        if (left.count !== right.count) {
            return right.count - left.count;
        }

        return left.message.localeCompare(right.message);
    });
}

function buildLatestImportSummary(storageApi) {
    const latestBatch = storageApi.getImportBatches()[0] || null;
    if (!latestBatch) {
        return {
            latestBatch: null,
            info: [{
                code: 'no-import-batch',
                severity: 'info',
                message: 'No import batch audit record found yet.',
                count: 1,
                samples: []
            }]
        };
    }

    return {
        latestBatch,
        info: []
    };
}

export function parseDeveloperReviewReport(options = {}) {
    const storageApi = options.storageApi || storage;
    const issuesByCode = new Map();

    const schemes = storageApi.getAll('schemes');
    const buildings = storageApi.getAll('buildings');
    const units = storageApi.getAll('units');
    const meters = storageApi.getAll('meters');
    const cycles = storageApi.getAll('cycles');
    const readings = storageApi.getAll('readings');
    const importBatchSummary = buildLatestImportSummary(storageApi);

    const schemeIds = new Set(schemes.map((scheme) => scheme.id));
    const buildingIds = new Set(buildings.map((building) => building.id));
    const unitIds = new Set(units.map((unit) => unit.id));
    const meterIds = new Set(meters.map((meter) => meter.id));
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));

    schemes.forEach((scheme) => {
        if (!hasValue(scheme.id)) {
            pushAggregatedIssue(issuesByCode, 'scheme-missing-id', 'error', 'Scheme records are missing ids.', scheme.name || '(unknown scheme)');
        }

        if (!hasValue(scheme.name)) {
            pushAggregatedIssue(issuesByCode, 'scheme-missing-name', 'warning', 'Scheme records are missing names.', scheme.id || '(missing id)');
        }
    });

    buildings.forEach((building) => {
        if (!hasValue(building.name)) {
            pushAggregatedIssue(issuesByCode, 'building-missing-name', 'warning', 'Building records are missing names.', building.id || '(missing id)');
        }

        if (!hasValue(building.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'building-missing-scheme', 'error', 'Building records are missing scheme references.', building.id || building.name || '(unknown building)');
        } else if (!schemeIds.has(building.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'building-broken-scheme-ref', 'error', 'Building records reference schemes that do not exist in app storage.', `${building.id || building.name} -> ${building.scheme_id}`);
        }
    });

    units.forEach((unit) => {
        if (!hasValue(unit.unit_number)) {
            pushAggregatedIssue(issuesByCode, 'unit-missing-number', 'warning', 'Unit records are missing unit numbers.', unit.id || '(missing id)');
        }

        if (!hasValue(unit.building_id)) {
            pushAggregatedIssue(issuesByCode, 'unit-missing-building', 'error', 'Unit records are missing building references.', unit.id || unit.unit_number || '(unknown unit)');
        } else if (!buildingIds.has(unit.building_id)) {
            pushAggregatedIssue(issuesByCode, 'unit-broken-building-ref', 'error', 'Unit records reference buildings that do not exist in app storage.', `${unit.id || unit.unit_number} -> ${unit.building_id}`);
        }
    });

    meters.forEach((meter) => {
        const meterType = String(meter.meter_type || '').toUpperCase();

        if (!hasValue(meter.meter_number)) {
            pushAggregatedIssue(issuesByCode, 'meter-missing-number', 'warning', 'Meter records are missing meter numbers.', meter.id || '(missing id)');
        }

        if (!hasValue(meter.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'meter-missing-scheme', 'error', 'Meter records are missing scheme references.', meter.id || meter.meter_number || '(unknown meter)');
        } else if (!schemeIds.has(meter.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'meter-broken-scheme-ref', 'error', 'Meter records reference schemes that do not exist in app storage.', `${meter.id || meter.meter_number} -> ${meter.scheme_id}`);
        }

        if (!['BULK', 'COMMON', 'UNIT', 'CHECK', 'UNKNOWN'].includes(meterType)) {
            pushAggregatedIssue(issuesByCode, 'meter-invalid-type', 'warning', 'Meter records use unexpected meter types.', `${meter.id || meter.meter_number} -> ${meterType || '(blank)'}`);
        }

        if (meterType === 'UNIT' && !hasValue(meter.unit_id)) {
            pushAggregatedIssue(issuesByCode, 'unit-meter-missing-unit', 'error', 'Unit meters are missing linked units.', meter.id || meter.meter_number || '(unknown meter)');
        }

        if (hasValue(meter.unit_id) && !unitIds.has(meter.unit_id)) {
            pushAggregatedIssue(issuesByCode, 'meter-broken-unit-ref', 'error', 'Meters reference units that do not exist in app storage.', `${meter.id || meter.meter_number} -> ${meter.unit_id}`);
        }
    });

    cycles.forEach((cycle) => {
        if (!hasValue(cycle.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'cycle-missing-scheme', 'error', 'Cycle records are missing scheme references.', cycle.id || cycle.name || '(unknown cycle)');
        } else if (!schemeIds.has(cycle.scheme_id)) {
            pushAggregatedIssue(issuesByCode, 'cycle-broken-scheme-ref', 'error', 'Cycle records reference schemes that do not exist in app storage.', `${cycle.id || cycle.name} -> ${cycle.scheme_id}`);
        }

        if (!hasValue(cycle.start_date) || !hasValue(cycle.end_date)) {
            pushAggregatedIssue(issuesByCode, 'cycle-missing-dates', 'warning', 'Cycle records are missing start or end dates.', cycle.id || cycle.name || '(unknown cycle)');
        }

        const cycleStatus = String(cycle.status || '').toUpperCase();
        if (!['OPEN', 'CLOSED'].includes(cycleStatus)) {
            pushAggregatedIssue(issuesByCode, 'cycle-invalid-status', 'warning', 'Cycle records use unexpected statuses.', `${cycle.id || cycle.name} -> ${cycleStatus || '(blank)'}`);
        }
    });

    readings.forEach((reading) => {
        const readingId = reading.id || `${reading.meter_id || 'unknown-meter'}:${reading.cycle_id || 'unknown-cycle'}`;

        if (!hasValue(reading.meter_id)) {
            pushAggregatedIssue(issuesByCode, 'reading-missing-meter', 'error', 'Readings are missing meter references.', readingId);
        } else if (!meterIds.has(reading.meter_id)) {
            pushAggregatedIssue(issuesByCode, 'reading-broken-meter-ref', 'error', 'Readings reference meters that do not exist in app storage.', `${readingId} -> ${reading.meter_id}`);
        }

        if (!hasValue(reading.cycle_id)) {
            pushAggregatedIssue(issuesByCode, 'reading-missing-cycle', 'error', 'Readings are missing cycle references.', readingId);
        } else if (!cycleById.has(reading.cycle_id)) {
            pushAggregatedIssue(issuesByCode, 'reading-broken-cycle-ref', 'error', 'Readings reference cycles that do not exist in app storage.', `${readingId} -> ${reading.cycle_id}`);
        }

        if (!isFiniteNumber(reading.reading_value)) {
            pushAggregatedIssue(issuesByCode, 'reading-missing-value', 'error', 'Readings are missing valid numeric reading values.', readingId);
        }

        if (!hasValue(reading.reading_date)) {
            pushAggregatedIssue(issuesByCode, 'reading-missing-date', 'warning', 'Readings are missing reading dates.', readingId);
        }

        if (hasValue(reading.reading_date) && hasValue(reading.cycle_id)) {
            const cycle = cycleById.get(reading.cycle_id);
            const readingTime = toTimestamp(reading.reading_date);
            const cycleStart = toTimestamp(cycle?.start_date);
            const cycleEnd = toTimestamp(cycle?.end_date);

            if (cycle && readingTime > 0 && cycleStart > 0 && cycleEnd > 0 && (readingTime < cycleStart || readingTime > cycleEnd)) {
                pushAggregatedIssue(issuesByCode, 'reading-outside-cycle-window', 'warning', 'Readings fall outside their linked cycle date windows.', readingId);
            }
        }

        const hasPrevious = reading.previous_reading == null || isFiniteNumber(reading.previous_reading);
        const hasConsumption = reading.consumption == null || isFiniteNumber(reading.consumption);

        if (!hasPrevious) {
            pushAggregatedIssue(issuesByCode, 'reading-invalid-previous', 'warning', 'Readings contain non-numeric previous-reading values.', readingId);
        }

        if (!hasConsumption) {
            pushAggregatedIssue(issuesByCode, 'reading-invalid-consumption', 'warning', 'Readings contain non-numeric consumption values.', readingId);
        }

        if (isFiniteNumber(reading.reading_value) && isFiniteNumber(reading.previous_reading) && isFiniteNumber(reading.consumption)) {
            const expectedConsumption = reading.reading_value - reading.previous_reading;
            const mismatch = Math.abs(expectedConsumption - reading.consumption);
            const rolloverApplied = Boolean(reading.rollover_applied);

            if (!rolloverApplied && mismatch > EPSILON) {
                pushAggregatedIssue(issuesByCode, 'reading-logic-mismatch', 'error', 'Readings contain consumption values that do not reconcile to current minus previous.', readingId);
            }

            if (!rolloverApplied && reading.consumption < 0) {
                pushAggregatedIssue(issuesByCode, 'reading-negative-consumption', 'error', 'Readings contain negative consumption without rollover handling.', readingId);
            }
        }

        if (String(reading.imported_from || '').startsWith('utility_dash') || String(reading.import_source || '').includes('utility')) {
            if (!hasValue(reading.validation_status) || !hasValue(reading.review_status)) {
                pushAggregatedIssue(issuesByCode, 'imported-reading-missing-status', 'warning', 'Imported readings are missing validation or review statuses.', readingId);
            }
        }
    });

    const issues = sortIssues([
        ...sortIssues(Array.from(issuesByCode.values())),
        ...importBatchSummary.info
    ]);

    return {
        generatedAt: new Date().toISOString(),
        latestBatch: importBatchSummary.latestBatch,
        summary: {
            schemes: schemes.length,
            buildings: buildings.length,
            units: units.length,
            meters: meters.length,
            cycles: cycles.length,
            readings: readings.length,
            errors: issues.filter((issue) => issue.severity === 'error').length,
            warnings: issues.filter((issue) => issue.severity === 'warning').length,
            info: issues.filter((issue) => issue.severity === 'info').length
        },
        issues
    };
}

export const developerReviewParser = {
    parseDeveloperReviewReport
};