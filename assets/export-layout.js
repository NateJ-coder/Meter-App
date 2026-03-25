import { storage } from './storage.js';
import { getEffectiveReviewStatus, getPreviousReadingDisplayValue } from './app.js';

const REPORT_LAYOUT_VERSION = 'pre-reference-v1';

function sanitizeLayoutSegment(value) {
    const normalized = String(value || 'untitled')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

    return normalized || 'untitled';
}

function sortByName(valueA, valueB) {
    return String(valueA || '').localeCompare(String(valueB || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
    });
}

function getReadingSortKey(reading) {
    return new Date(
        reading?.reading_date || reading?.updated_at || reading?.created_at || 0
    ).getTime();
}

function buildLatestReadingsMap(readings) {
    const latestReadingsByMeter = new Map();

    readings.forEach(reading => {
        const existing = latestReadingsByMeter.get(reading.meter_id);

        if (!existing || getReadingSortKey(reading) >= getReadingSortKey(existing)) {
            latestReadingsByMeter.set(reading.meter_id, reading);
        }
    });

    return latestReadingsByMeter;
}

function normalizeFlag(flag, source) {
    return {
        source,
        type: flag?.type || 'FLAG',
        severity: flag?.severity || 'medium',
        message: flag?.message || flag?.description || '',
        description: flag?.description || flag?.message || ''
    };
}

function sumConsumptions(items) {
    return items.reduce((total, item) => total + (Number(item?.consumption) || 0), 0);
}

function buildMeterEntry(meter, reading, cycle) {
    const autoFlags = Array.isArray(reading?.flags)
        ? reading.flags.map(flag => normalizeFlag(flag, 'auto'))
        : [];
    const manualFlags = Array.isArray(reading?.manual_flags)
        ? reading.manual_flags.map(flag => normalizeFlag(flag, 'manual'))
        : [];
    const flags = [...autoFlags, ...manualFlags];

    return {
        meterId: meter.id,
        meterNumber: meter.meter_number,
        meterType: meter.meter_type,
        meterLocation: meter.meter_location || '',
        meterStatus: meter.status || 'ACTIVE',
        readingId: reading?.id || null,
        previousReading: reading ? getPreviousReadingDisplayValue(reading, meter) : (meter.last_reading ?? 0),
        currentReading: reading?.reading_value ?? null,
        consumption: reading?.consumption ?? null,
        readingDate: reading?.reading_date || null,
        capturedBy: reading?.captured_by || null,
        contactDetails: reading?.captured_by_contact_details || reading?.submitted_by_contact_details || '',
        reviewStatus: reading ? getEffectiveReviewStatus(reading, cycle) : 'missing',
        flags,
        hasPhoto: Boolean(reading?.photo),
        notes: reading?.notes || reading?.admin_notes || '',
        rawReading: reading || null
    };
}

function buildBuildingEntry(building, units) {
    const meterEntries = units.flatMap(unit => unit.meters);
    const readCount = meterEntries.filter(meter => meter.currentReading != null).length;
    const flaggedCount = meterEntries.filter(meter => meter.flags.length > 0).length;

    return {
        buildingId: building.id,
        buildingName: building.name,
        buildingSlug: sanitizeLayoutSegment(building.name),
        unitCount: units.length,
        meterCount: meterEntries.length,
        readCount,
        unreadCount: meterEntries.length - readCount,
        flaggedCount,
        totalConsumption: sumConsumptions(meterEntries),
        units
    };
}

function buildOutputFiles(layoutRoot, scheme, cycle, buildings, units, schemeStats) {
    const schemeSlug = sanitizeLayoutSegment(scheme.name);
    const cycleKey = `${cycle.start_date}-to-${cycle.end_date}`;
    const schemeFilename = `01-scheme-report-${schemeSlug}-${cycleKey}.xlsx`;

    const files = [
        {
            type: 'scheme-report',
            scope: 'scheme',
            entityId: scheme.id,
            entityName: scheme.name,
            filename: schemeFilename,
            relativePath: `${layoutRoot}/${schemeFilename}`,
            readCount: schemeStats.readingsCaptured,
            totalCount: schemeStats.totalUnitMeters,
            flaggedCount: schemeStats.flaggedReadings
        }
    ];

    buildings.forEach(building => {
        const filename = `02-building-report-${building.buildingSlug}-${cycleKey}.xlsx`;
        files.push({
            type: 'building-report',
            scope: 'building',
            entityId: building.buildingId,
            entityName: building.buildingName,
            filename,
            relativePath: `${layoutRoot}/buildings/${building.buildingSlug}/${filename}`,
            readCount: building.readCount,
            totalCount: building.meterCount,
            flaggedCount: building.flaggedCount
        });
    });

    units.forEach(unit => {
        const unitSlug = sanitizeLayoutSegment(unit.unitNumber);
        const filename = `03-unit-report-${unit.buildingSlug}-${unitSlug}-${cycleKey}.xlsx`;
        files.push({
            type: 'unit-report',
            scope: 'unit',
            entityId: unit.unitId,
            entityName: `${unit.buildingName} / ${unit.unitNumber}`,
            filename,
            relativePath: `${layoutRoot}/buildings/${unit.buildingSlug}/units/${unitSlug}/${filename}`,
            readCount: unit.readCount,
            totalCount: unit.meterCount,
            flaggedCount: unit.flaggedCount
        });
    });

    return files;
}

export function getCycleExportLayout(cycleId, filters = {}) {
    const cycle = storage.get('cycles', cycleId);
    if (!cycle) {
        return null;
    }

    const scheme = storage.get('schemes', cycle.scheme_id);
    if (!scheme) {
        return null;
    }

    const buildings = storage.getBuildings(scheme.id)
        .slice()
        .sort((buildingA, buildingB) => sortByName(buildingA.name, buildingB.name));
    const buildingById = new Map(buildings.map(building => [building.id, building]));
    const allUnits = storage.getAll('units')
        .filter(unit => buildingById.has(unit.building_id))
        .sort((unitA, unitB) => {
            const buildingA = buildingById.get(unitA.building_id);
            const buildingB = buildingById.get(unitB.building_id);
            const buildingCompare = sortByName(buildingA?.name, buildingB?.name);
            return buildingCompare !== 0
                ? buildingCompare
                : sortByName(unitA.unit_number, unitB.unit_number);
        });

    const allMeters = storage.getMeters(scheme.id);
    const unitMeters = allMeters
        .filter(meter => meter.meter_type === 'UNIT')
        .slice()
        .sort((meterA, meterB) => sortByName(meterA.meter_number, meterB.meter_number));
    const bulkMeters = allMeters.filter(meter => meter.meter_type === 'BULK');

    const readings = storage.getReadings(cycle.id);
    const latestReadingsByMeter = buildLatestReadingsMap(readings);

    let visibleUnits = allUnits;
    if (filters.unitId) {
        visibleUnits = visibleUnits.filter(unit => unit.id === filters.unitId);
    }

    if (filters.meterType === 'BULK') {
        visibleUnits = [];
    }

    const unitEntries = visibleUnits.map(unit => {
        const building = buildingById.get(unit.building_id);
        const meters = unitMeters
            .filter(meter => meter.unit_id === unit.id)
            .map(meter => buildMeterEntry(meter, latestReadingsByMeter.get(meter.id), cycle));

        const readCount = meters.filter(meter => meter.currentReading != null).length;
        const flaggedCount = meters.filter(meter => meter.flags.length > 0).length;
        const reviewStatuses = Array.from(new Set(meters.map(meter => meter.reviewStatus)));

        return {
            unitId: unit.id,
            unitNumber: unit.unit_number,
            ownerName: unit.owner_name || '',
            buildingId: building?.id || null,
            buildingName: building?.name || 'Unknown Building',
            buildingSlug: sanitizeLayoutSegment(building?.name || 'unknown-building'),
            meterCount: meters.length,
            readCount,
            unreadCount: meters.length - readCount,
            flaggedCount,
            totalConsumption: sumConsumptions(meters),
            reviewStatuses,
            meters
        };
    });

    const buildingEntries = buildings
        .map(building => {
            const units = unitEntries.filter(unit => unit.buildingId === building.id);
            if (units.length === 0) {
                return null;
            }

            return buildBuildingEntry(building, units);
        })
        .filter(Boolean);

    let bulkKWh = 0;
    bulkMeters.forEach(bulkMeter => {
        const reading = latestReadingsByMeter.get(bulkMeter.id);
        if (reading?.consumption != null) {
            bulkKWh += Number(reading.consumption) || 0;
        }
    });

    const sumUnitsKWh = sumConsumptions(unitEntries.flatMap(unit => unit.meters));
    const commonKWh = bulkKWh - sumUnitsKWh;
    const lossesPercent = bulkKWh > 0 ? (commonKWh / bulkKWh) * 100 : 0;
    const totalUnitMeters = unitEntries.reduce((total, unit) => total + unit.meterCount, 0);
    const readingsCaptured = unitEntries.reduce((total, unit) => total + unit.readCount, 0);
    const flaggedReadings = unitEntries.reduce((total, unit) => total + unit.flaggedCount, 0);

    const schemeStats = {
        totalBuildings: buildingEntries.length,
        totalUnits: unitEntries.length,
        totalUnitMeters,
        readingsCaptured,
        notRead: totalUnitMeters - readingsCaptured,
        flaggedReadings,
        pendingReviews: unitEntries.flatMap(unit => unit.meters).filter(meter => meter.reviewStatus === 'pending').length,
        approvedReadings: unitEntries.flatMap(unit => unit.meters).filter(meter => meter.reviewStatus === 'approved').length,
        totalConsumption: sumUnitsKWh,
        bulkKWh,
        sumUnitsKWh,
        commonKWh,
        lossesPercent,
        completionRate: totalUnitMeters > 0 ? (readingsCaptured / totalUnitMeters) * 100 : 0
    };

    const schemeSlug = sanitizeLayoutSegment(scheme.name);
    const layoutRoot = `exports/${schemeSlug}/${cycle.start_date}-to-${cycle.end_date}`;
    const outputFiles = buildOutputFiles(layoutRoot, scheme, cycle, buildingEntries, unitEntries, schemeStats);

    return {
        layoutVersion: REPORT_LAYOUT_VERSION,
        generatedAt: new Date().toISOString(),
        filters: {
            unitId: filters.unitId || null,
            meterType: filters.meterType || null
        },
        cycle: {
            id: cycle.id,
            start_date: cycle.start_date,
            end_date: cycle.end_date,
            status: cycle.status
        },
        scheme: {
            id: scheme.id,
            name: scheme.name,
            address: scheme.address || '',
            slug: schemeSlug
        },
        schemeStats,
        buildings: buildingEntries,
        units: unitEntries,
        outputRoot: layoutRoot,
        outputFiles
    };
}

export { sanitizeLayoutSegment };