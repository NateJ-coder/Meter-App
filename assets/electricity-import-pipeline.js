import { storage } from './storage.js';
import { getValidationConfig } from './validation.js';

/**
 * @typedef {Object} ElectricityImportRow
 * @property {string=} schemeId
 * @property {string=} schemeName
 * @property {string=} buildingId
 * @property {string=} buildingName
 * @property {string=} unitId
 * @property {string=} unitNumber
 * @property {string=} meterId
 * @property {string=} meterNumber
 * @property {string=} meterType
 * @property {string=} rowType
 * @property {string|number} readingValue
 * @property {string=} readingDate
 * @property {string=} cycleId
 * @property {string=} sourceFile
 * @property {string|number=} sourceRowReference
 * @property {string|number=} maxRegisterValue
 * @property {string=} notes
 */

/**
 * @typedef {Object} PipelineIssue
 * @property {string} code
 * @property {'warning'|'error'} severity
 * @property {string} message
 * @property {Object<string, any>=} details
 */

/**
 * @typedef {Object} PipelineFlag
 * @property {string} code
 * @property {'low'|'medium'|'high'} severity
 * @property {string} message
 * @property {Object<string, any>=} details
 */

/**
 * @typedef {Object} StagedElectricityReading
 * @property {'electricity'} serviceType
 * @property {'UNIT'|'BULK'|'COMMON'} rowType
 * @property {string|null} schemeId
 * @property {string|null} schemeName
 * @property {string|null} buildingId
 * @property {string|null} buildingName
 * @property {string|null} unitId
 * @property {string|null} unitNumber
 * @property {string|null} meterId
 * @property {string|null} meterNumber
 * @property {number|null} currentReading
 * @property {string|null} readingDate
 * @property {string|null} cycleId
 * @property {string|null} sourceFile
 * @property {string|null} sourceRowReference
 * @property {number|null} maxRegisterValue
 * @property {string} notes
 * @property {ElectricityImportRow} raw
 * @property {PipelineIssue[]} issues
 */

const ELECTRICITY_SERVICE = 'electricity';
const DEFAULT_ROW_TYPE = 'UNIT';

function normalizeLookupToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function parseNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (value == null) {
        return null;
    }

    const input = String(value).trim();
    if (!input || input === '#########') {
        return null;
    }

    let normalized = input.replace(/[\s\u00A0']/g, '');

    if (normalized.includes(',') && normalized.includes('.')) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (normalized.includes(',')) {
        const parts = normalized.split(',');
        normalized = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIsoDate(value) {
    if (!value) {
        return null;
    }

    const trimmed = String(value).trim();
    if (!trimmed || trimmed === '#########') {
        return null;
    }

    const normalized = trimmed.replace(/\//g, '-');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString().slice(0, 10);
}

function normalizeRowType(value) {
    const normalized = String(value || DEFAULT_ROW_TYPE).trim().toUpperCase();

    if (normalized.startsWith('BULK') || normalized === 'BUL') {
        return 'BULK';
    }

    if (normalized.startsWith('COM')) {
        return 'COMMON';
    }

    return 'UNIT';
}

function buildIssue(code, severity, message, details = undefined) {
    return { code, severity, message, details };
}

function buildFlag(code, severity, message, details = undefined) {
    return { code, severity, message, details };
}

function getEntityDateValue(record) {
    const candidate = record?.reading_date || record?.updated_at || record?.created_at || null;
    if (!candidate) {
        return 0;
    }

    const parsed = new Date(String(candidate).replace(/\//g, '-'));
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isValidHistoricalReading(reading) {
    if (!reading || !isFiniteNumber(reading.reading_value)) {
        return false;
    }

    const reviewStatus = String(reading.review_status || '').toLowerCase();
    const validationStatus = String(reading.validation_status || '').toLowerCase();

    return reviewStatus !== 'rejected' && validationStatus !== 'rejected';
}

function sortByNewest(left, right) {
    return getEntityDateValue(right) - getEntityDateValue(left);
}

function findUniqueMatch(collection, predicate) {
    const matches = collection.filter(predicate);

    if (matches.length === 1) {
        return { value: matches[0], ambiguous: false };
    }

    return {
        value: null,
        ambiguous: matches.length > 1,
        matches
    };
}

function resolveByIdOrName(collection, id, name, nameField = 'name') {
    if (id) {
        return collection.find((item) => item.id === id) || null;
    }

    if (!name) {
        return null;
    }

    const normalizedTarget = normalizeLookupToken(name);
    return collection.find((item) => normalizeLookupToken(item[nameField]) === normalizedTarget) || null;
}

function getHistoricalConsumptions(storageApi, meterId, beforeDate = null) {
    return storageApi.getReadings()
        .filter((reading) => reading.meter_id === meterId && isFiniteNumber(reading.consumption))
        .filter((reading) => {
            if (!beforeDate) {
                return true;
            }

            const readingTime = getEntityDateValue(reading);
            const cutoff = new Date(beforeDate).getTime();
            return readingTime > 0 && readingTime < cutoff;
        })
        .sort(sortByNewest);
}

export function createElectricityReadingStagingRow(rawRow) {
    const issues = [];
    const currentReading = parseNumber(rawRow.readingValue);
    const readingDate = normalizeIsoDate(rawRow.readingDate);
    const maxRegisterValue = parseNumber(rawRow.maxRegisterValue);

    if (!isFiniteNumber(currentReading)) {
        issues.push(buildIssue('invalid-reading-value', 'error', 'Reading value must be a valid number.'));
    }

    if (!readingDate) {
        issues.push(buildIssue('invalid-reading-date', 'error', 'Reading date must be a valid date.'));
    }

    return {
        serviceType: ELECTRICITY_SERVICE,
        rowType: normalizeRowType(rawRow.rowType || rawRow.meterType),
        schemeId: rawRow.schemeId || null,
        schemeName: rawRow.schemeName || null,
        buildingId: rawRow.buildingId || null,
        buildingName: rawRow.buildingName || null,
        unitId: rawRow.unitId || null,
        unitNumber: rawRow.unitNumber || null,
        meterId: rawRow.meterId || null,
        meterNumber: rawRow.meterNumber || null,
        currentReading,
        readingDate,
        cycleId: rawRow.cycleId || null,
        sourceFile: rawRow.sourceFile || null,
        sourceRowReference: rawRow.sourceRowReference == null ? null : String(rawRow.sourceRowReference),
        maxRegisterValue,
        notes: String(rawRow.notes || '').trim(),
        raw: rawRow,
        issues
    };
}

export function resolveElectricityReadingReferences(stagedRow, options = {}) {
    const storageApi = options.storageApi || storage;
    const issues = [];

    let scheme = resolveByIdOrName(storageApi.getSchemes(), stagedRow.schemeId, stagedRow.schemeName);
    let building = null;
    let unit = null;
    let meter = null;

    const schemeBuildings = scheme ? storageApi.getBuildings(scheme.id) : storageApi.getBuildings();
    building = resolveByIdOrName(schemeBuildings, stagedRow.buildingId, stagedRow.buildingName);

    const buildingUnits = building ? storageApi.getUnits(building.id) : storageApi.getUnits();
    unit = resolveByIdOrName(buildingUnits, stagedRow.unitId, stagedRow.unitNumber, 'unit_number');

    let meterCandidates = storageApi.getMeters();
    meterCandidates = meterCandidates.filter((candidate) => {
        const serviceType = String(candidate.service_type || ELECTRICITY_SERVICE).toLowerCase();
        return serviceType === ELECTRICITY_SERVICE;
    });

    if (scheme) {
        meterCandidates = meterCandidates.filter((candidate) => candidate.scheme_id === scheme.id);
    }

    if (stagedRow.meterId) {
        meter = meterCandidates.find((candidate) => candidate.id === stagedRow.meterId) || null;
    }

    if (!meter && stagedRow.meterNumber) {
        const normalizedMeterNumber = normalizeLookupToken(stagedRow.meterNumber);
        const match = findUniqueMatch(
            meterCandidates,
            (candidate) => normalizeLookupToken(candidate.meter_number) === normalizedMeterNumber
        );

        meter = match.value;

        if (!meter && match.ambiguous) {
            issues.push(buildIssue(
                'ambiguous-meter-number',
                'error',
                'Meter number matched multiple electricity meters.',
                { meterNumber: stagedRow.meterNumber }
            ));
        }
    }

    if (!meter && unit && stagedRow.rowType === 'UNIT') {
        const match = findUniqueMatch(
            meterCandidates,
            (candidate) => candidate.unit_id === unit.id && String(candidate.meter_type || '').toUpperCase() === 'UNIT'
        );

        meter = match.value;

        if (!meter && match.ambiguous) {
            issues.push(buildIssue(
                'ambiguous-unit-meter',
                'error',
                'Unit resolved, but multiple unit meters exist for that unit.',
                { unitId: unit.id }
            ));
        }
    }

    if (!meter && scheme && stagedRow.rowType !== 'UNIT') {
        const targetType = stagedRow.rowType;
        const match = findUniqueMatch(
            meterCandidates,
            (candidate) => String(candidate.meter_type || '').toUpperCase() === targetType
        );

        meter = match.value;

        if (!meter && match.ambiguous) {
            issues.push(buildIssue(
                'ambiguous-scheme-meter',
                'error',
                `${targetType} row resolved to multiple scheme-level meters.`,
                { schemeId: scheme.id, rowType: targetType }
            ));
        }
    }

    if (meter && !scheme) {
        scheme = storageApi.get('schemes', meter.scheme_id) || null;
    }

    if (meter && meter.unit_id && !unit) {
        unit = storageApi.get('units', meter.unit_id) || null;
    }

    if (unit && !building) {
        building = storageApi.get('buildings', unit.building_id) || null;
    }

    if (!scheme) {
        issues.push(buildIssue('unresolved-scheme', 'error', 'Unable to resolve the scheme for this row.'));
    }

    if (stagedRow.rowType === 'UNIT' && !unit) {
        issues.push(buildIssue('unresolved-unit', 'error', 'Unable to resolve the unit for this unit-meter row.'));
    }

    if (!meter) {
        issues.push(buildIssue('unresolved-meter', 'error', 'Unable to resolve the electricity meter for this row.'));
    }

    return {
        scheme,
        building,
        unit,
        meter,
        issues
    };
}

export function findMostRecentValidPreviousReading(stagedRow, resolution, options = {}) {
    const storageApi = options.storageApi || storage;
    const issues = [];

    if (!resolution.meter) {
        issues.push(buildIssue('missing-meter-context', 'error', 'Cannot resolve previous reading without a meter.'));
        return { previousReading: null, issues };
    }

    const cutoffTime = stagedRow.readingDate ? new Date(stagedRow.readingDate).getTime() : null;
    const historicalReadings = storageApi.getReadings()
        .filter((reading) => reading.meter_id === resolution.meter.id)
        .filter(isValidHistoricalReading)
        .filter((reading) => {
            if (!cutoffTime) {
                return true;
            }

            const readingTime = getEntityDateValue(reading);
            return readingTime > 0 && readingTime < cutoffTime;
        })
        .sort(sortByNewest);

    const latestHistorical = historicalReadings[0] || null;
    if (latestHistorical) {
        return {
            previousReading: {
                source: 'reading_history',
                readingId: latestHistorical.id,
                readingValue: latestHistorical.reading_value,
                readingDate: latestHistorical.reading_date || null,
                cycleId: latestHistorical.cycle_id || null,
                consumption: latestHistorical.consumption ?? null
            },
            issues
        };
    }

    if (isFiniteNumber(resolution.meter.last_reading)) {
        return {
            previousReading: {
                source: 'meter_register',
                readingId: null,
                readingValue: resolution.meter.last_reading,
                readingDate: resolution.meter.last_reading_date || null,
                cycleId: null,
                consumption: null
            },
            issues
        };
    }

    issues.push(buildIssue('missing-previous-reading', 'error', 'No prior valid reading could be found for this meter.'));
    return { previousReading: null, issues };
}

export function calculateElectricityConsumption(stagedRow, previousReading, resolution) {
    const issues = [];

    if (!previousReading || !isFiniteNumber(previousReading.readingValue)) {
        issues.push(buildIssue('missing-previous-reading', 'error', 'Consumption cannot be calculated without a previous reading.'));
        return {
            previousReadingValue: null,
            consumption: null,
            rolloverApplied: false,
            issues
        };
    }

    const previousValue = previousReading.readingValue;
    const currentValue = stagedRow.currentReading;
    const rawConsumption = currentValue - previousValue;

    if (rawConsumption >= 0) {
        return {
            previousReadingValue: previousValue,
            consumption: rawConsumption,
            rolloverApplied: false,
            issues
        };
    }

    const explicitMaxRegisterValue = stagedRow.maxRegisterValue
        ?? parseNumber(resolution?.meter?.max_register_value)
        ?? parseNumber(resolution?.meter?.register_rollover_value);

    if (isFiniteNumber(explicitMaxRegisterValue) && explicitMaxRegisterValue > previousValue) {
        return {
            previousReadingValue: previousValue,
            consumption: explicitMaxRegisterValue - previousValue + currentValue,
            rolloverApplied: true,
            issues
        };
    }

    issues.push(buildIssue(
        'backward-reading',
        'error',
        'Current reading is lower than the previous reading and no explicit rollover boundary was provided.',
        {
            currentReading: currentValue,
            previousReading: previousValue
        }
    ));

    return {
        previousReadingValue: previousValue,
        consumption: null,
        rolloverApplied: false,
        issues
    };
}

export function applyElectricityToleranceChecks(stagedRow, resolution, previousReading, consumptionResult, options = {}) {
    const storageApi = options.storageApi || storage;
    const schemeId = resolution.scheme?.id || null;
    const config = options.config || getValidationConfig(schemeId);
    const flags = [];

    if (!resolution.meter || !isFiniteNumber(consumptionResult.consumption)) {
        return flags;
    }

    const currentConsumption = consumptionResult.consumption;
    const previousValue = previousReading?.readingValue;
    const history = getHistoricalConsumptions(storageApi, resolution.meter.id, stagedRow.readingDate);
    const averageWindow = history.slice(0, config.minHistoryCycles);
    const averageConsumption = averageWindow.length
        ? averageWindow.reduce((sum, entry) => sum + entry.consumption, 0) / averageWindow.length
        : 0;
    const previousConsumption = isFiniteNumber(previousReading?.consumption)
        ? previousReading.consumption
        : history[0]?.consumption ?? 0;

    if (!consumptionResult.rolloverApplied && isFiniteNumber(previousValue) && stagedRow.currentReading < previousValue) {
        flags.push(buildFlag(
            'backward-reading',
            'high',
            `Current reading ${stagedRow.currentReading} is lower than previous reading ${previousValue}.`
        ));
    }

    if (config.zeroTolerance && currentConsumption === 0 && isFiniteNumber(previousValue) && previousValue > 0) {
        flags.push(buildFlag('zero-consumption', 'medium', 'Consumption is zero for a meter with prior usage history.'));
    }

    if (isFiniteNumber(previousValue) && stagedRow.currentReading === previousValue) {
        flags.push(buildFlag('unchanged-reading', 'medium', 'Current reading is unchanged from the previous reading.'));
    }

    if (averageConsumption > 0 && currentConsumption > averageConsumption * config.spikeMultiplier) {
        flags.push(buildFlag(
            'spike',
            'high',
            `Consumption ${currentConsumption.toFixed(2)} exceeds ${config.spikeMultiplier}x the historical average ${averageConsumption.toFixed(2)}.`,
            {
                averageConsumption,
                currentConsumption,
                spikeMultiplier: config.spikeMultiplier
            }
        ));
    }

    if (previousConsumption > 0) {
        const percentageIncrease = ((currentConsumption - previousConsumption) / previousConsumption) * 100;
        if (percentageIncrease > config.percentageThreshold) {
            flags.push(buildFlag(
                'percentage-spike',
                'medium',
                `Consumption increased ${percentageIncrease.toFixed(1)}% from the prior cycle.`,
                {
                    previousConsumption,
                    currentConsumption,
                    percentageThreshold: config.percentageThreshold
                }
            ));
        }
    }

    return flags;
}

export function buildElectricityReadingCreatePayload(stagedRow, resolution, previousReading, consumptionResult, flags) {
    if (!resolution.meter || !isFiniteNumber(consumptionResult.consumption)) {
        return null;
    }

    const validationStatus = flags.length > 0 ? 'needs_review' : 'validated';

    return {
        meter_id: resolution.meter.id,
        cycle_id: stagedRow.cycleId,
        reading_date: stagedRow.readingDate,
        reading_value: stagedRow.currentReading,
        previous_reading: consumptionResult.previousReadingValue,
        consumption: consumptionResult.consumption,
        service_type: ELECTRICITY_SERVICE,
        row_type: stagedRow.rowType,
        flags: flags.map((flag) => ({
            type: flag.code,
            severity: flag.severity,
            message: flag.message,
            details: flag.details || null
        })),
        review_status: flags.length > 0 ? 'pending' : 'approved',
        validation_status: validationStatus,
        validation_reason: flags.map((flag) => flag.message).join(' | '),
        source_file: stagedRow.sourceFile,
        source_row_reference: stagedRow.sourceRowReference,
        import_source: 'electricity_import_pipeline',
        imported_at: new Date().toISOString(),
        notes: stagedRow.notes,
        rollover_applied: consumptionResult.rolloverApplied
    };
}

export function processElectricityReadingImport(rawRow, options = {}) {
    const stagedReading = createElectricityReadingStagingRow(rawRow);
    const resolution = resolveElectricityReadingReferences(stagedReading, options);
    const previousLookup = findMostRecentValidPreviousReading(stagedReading, resolution, options);
    const consumption = calculateElectricityConsumption(stagedReading, previousLookup.previousReading, resolution);
    const flags = applyElectricityToleranceChecks(
        stagedReading,
        resolution,
        previousLookup.previousReading,
        consumption,
        options
    );

    const issues = [
        ...stagedReading.issues,
        ...resolution.issues,
        ...previousLookup.issues,
        ...consumption.issues
    ];

    const blockingIssues = issues.filter((issue) => issue.severity === 'error');
    const validationStatus = blockingIssues.length > 0
        ? 'rejected'
        : flags.length > 0
            ? 'needs_review'
            : 'ready';

    // Water can plug in here later by routing on stagedReading.serviceType and delegating
    // to a parallel water-specific resolver and consumption service instead of branching
    // on spreadsheet sections.
    const readingPayload = buildElectricityReadingCreatePayload(
        stagedReading,
        resolution,
        previousLookup.previousReading,
        consumption,
        flags
    );

    return {
        stagedReading,
        resolution,
        previousReading: previousLookup.previousReading,
        consumption,
        flags,
        issues,
        blockingIssues,
        validationStatus,
        readyForCreate: blockingIssues.length === 0,
        readingPayload,
        // Dispute-pack generation can later subscribe to the same resolved payload and flags,
        // after the reading has been persisted and review workflow identifiers exist.
        disputePackContext: null
    };
}

export const electricityImportPipeline = {
    createElectricityReadingStagingRow,
    resolveElectricityReadingReferences,
    findMostRecentValidPreviousReading,
    calculateElectricityConsumption,
    applyElectricityToleranceChecks,
    buildElectricityReadingCreatePayload,
    processElectricityReadingImport
};
