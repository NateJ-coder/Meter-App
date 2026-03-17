import { storage } from './storage.js';

export const READING_TRANSFER_SCHEMA = 'fuzio-reading-transfer';
export const READING_TRANSFER_VERSION = 1;

function sanitizeFileName(value, fallback = 'reading-transfer') {
    return String(value || fallback)
        .trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || fallback;
}

function downloadJsonFile(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function findMatchingScheme(sourceScheme) {
    if (!sourceScheme) {
        return null;
    }

    return storage.getAll('schemes').find((scheme) =>
        scheme.id === sourceScheme.id || scheme.name === sourceScheme.name
    ) || null;
}

function findMatchingCycle(sourceCycle, targetSchemeId) {
    if (!sourceCycle || !targetSchemeId) {
        return null;
    }

    return storage.getAll('cycles').find((cycle) => {
        const sameId = cycle.id === sourceCycle.id;
        const samePeriod = cycle.scheme_id === targetSchemeId &&
            cycle.start_date === sourceCycle.start_date &&
            cycle.end_date === sourceCycle.end_date;

        return sameId || samePeriod;
    }) || null;
}

function findMatchingMeter(sourceReading, targetSchemeId) {
    const meters = storage.getAll('meters').filter((meter) => meter.scheme_id === targetSchemeId);

    return meters.find((meter) =>
        meter.id === sourceReading.meter_id || meter.meter_number === sourceReading.meter_number
    ) || null;
}

export function buildReadingTransferPackage({ scheme, cycle, readerProfile, readings, workflowMeters }) {
    const safeSchemeName = sanitizeFileName(scheme?.name || 'scheme');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const packagedReadings = readings.map((reading) => {
        const meter = workflowMeters.find((entry) => entry.id === reading.meter_id);

        return {
            meter_id: reading.meter_id,
            meter_number: meter?.meter_number || '',
            meter_type: meter?.meter_type || '',
            meter_name: meter?.meter_name || '',
            unit_id: meter?.unit_id || null,
            unit_number: meter?.unit_info?.unit_number || '',
            building_name: meter?.unit_info?.building_name || '',
            cycle_id: reading.cycle_id,
            reading_value: reading.reading_value,
            previous_reading: reading.previous_reading ?? null,
            reading_date: reading.reading_date,
            notes: reading.notes || '',
            photo: reading.photo || '',
            photo_name: reading.photo_name || '',
            consumption: reading.consumption ?? null,
            flags: Array.isArray(reading.flags) ? reading.flags : [],
            review_status: reading.review_status || 'pending',
            submitted_at: reading.submitted_at || '',
            submitted_by_name: reading.submitted_by_name || '',
            submitted_by_contact_details: reading.submitted_by_contact_details || '',
            submitted_by_email: reading.submitted_by_email || '',
            submitted_by_phone: reading.submitted_by_phone || '',
            submission_type: reading.submission_type || '',
            captured_by: reading.captured_by || '',
            captured_by_id: reading.captured_by_id || null,
            captured_by_email: reading.captured_by_email || '',
            captured_by_contact_details: reading.captured_by_contact_details || ''
        };
    });

    return {
        source: READING_TRANSFER_SCHEMA,
        version: READING_TRANSFER_VERSION,
        exported_at: new Date().toISOString(),
        scheme: scheme ? {
            id: scheme.id,
            name: scheme.name
        } : null,
        cycle: cycle ? {
            id: cycle.id,
            scheme_id: cycle.scheme_id,
            start_date: cycle.start_date,
            end_date: cycle.end_date,
            status: cycle.status
        } : null,
        reader: readerProfile ? {
            id: readerProfile.id || null,
            name: readerProfile.name || '',
            email: readerProfile.email || '',
            phone: readerProfile.phone || '',
            contact_details: readerProfile.contactDetails || '',
            role: readerProfile.role || '',
            is_guest: Boolean(readerProfile.isGuest)
        } : null,
        readings: packagedReadings,
        filename: `reading-transfer-${safeSchemeName}-${timestamp}.json`
    };
}

export function downloadReadingTransferPackage(packageData) {
    const filename = packageData?.filename || `reading-transfer-${Date.now()}.json`;
    downloadJsonFile(packageData, filename);
}

export function importReadingTransferPackage(packageData) {
    if (!packageData || packageData.source !== READING_TRANSFER_SCHEMA) {
        throw new Error('Invalid reading package. Expected a Fuzio reading transfer file.');
    }

    if (packageData.version !== READING_TRANSFER_VERSION) {
        throw new Error(`Unsupported package version: ${packageData.version}`);
    }

    if (!Array.isArray(packageData.readings) || packageData.readings.length === 0) {
        throw new Error('The reading package does not contain any readings.');
    }

    const targetScheme = findMatchingScheme(packageData.scheme);
    if (!targetScheme) {
        throw new Error(`No matching scheme found for package scheme: ${packageData.scheme?.name || 'Unknown'}`);
    }

    const targetCycle = findMatchingCycle(packageData.cycle, targetScheme.id);
    if (!targetCycle) {
        throw new Error('No matching cycle found on this dashboard. Open or recreate the correct cycle before importing.');
    }

    const results = {
        schemeName: targetScheme.name,
        cyclePeriod: `${targetCycle.start_date} to ${targetCycle.end_date}`,
        created: 0,
        updated: 0,
        skipped: 0,
        issues: []
    };

    packageData.readings.forEach((sourceReading) => {
        const targetMeter = findMatchingMeter(sourceReading, targetScheme.id);

        if (!targetMeter) {
            results.skipped += 1;
            results.issues.push(`Meter not found: ${sourceReading.meter_number || sourceReading.meter_id}`);
            return;
        }

        const existingReading = storage.getAll('readings').find((reading) =>
            reading.cycle_id === targetCycle.id && reading.meter_id === targetMeter.id
        );

        const readingPayload = {
            meter_id: targetMeter.id,
            cycle_id: targetCycle.id,
            reading_value: sourceReading.reading_value,
            reading_date: sourceReading.reading_date,
            notes: sourceReading.notes || '',
            photo: sourceReading.photo || '',
            photo_name: sourceReading.photo_name || '',
            consumption: sourceReading.consumption,
            flags: Array.isArray(sourceReading.flags) ? sourceReading.flags : [],
            review_status: sourceReading.review_status || 'pending',
            submitted_at: sourceReading.submitted_at || '',
            submitted_by_name: sourceReading.submitted_by_name || '',
            submitted_by_contact_details: sourceReading.submitted_by_contact_details || '',
            submitted_by_email: sourceReading.submitted_by_email || '',
            submitted_by_phone: sourceReading.submitted_by_phone || '',
            submission_type: sourceReading.submission_type || '',
            captured_by: sourceReading.captured_by || '',
            captured_by_id: sourceReading.captured_by_id || null,
            captured_by_email: sourceReading.captured_by_email || '',
            captured_by_contact_details: sourceReading.captured_by_contact_details || '',
            previous_reading: sourceReading.previous_reading ?? null,
            import_source: READING_TRANSFER_SCHEMA,
            imported_at: new Date().toISOString()
        };

        if (existingReading) {
            storage.update('readings', existingReading.id, readingPayload);
            results.updated += 1;
        } else {
            storage.create('readings', readingPayload);
            results.created += 1;
        }

        storage.update('meters', targetMeter.id, { last_reading: sourceReading.reading_value });
    });

    return results;
}