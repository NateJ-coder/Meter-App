/**
 * capture-shared.js - Shared capture record logic for reader and on-site flows
 */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { parseDecimalInput } from './app.js';

function toNumberOrNull(value) {
    const parsed = parseDecimalInput(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export function resolvePreviousBaseline({ meterLastReading, meterReplaced = false, previousOverrideValue = null }) {
    const normalizedLast = meterLastReading == null ? null : Number(meterLastReading);

    if (meterReplaced) {
        return {
            effectivePreviousReading: 0,
            previousOverridden: normalizedLast !== 0
        };
    }

    const parsedOverride = toNumberOrNull(previousOverrideValue);
    if (parsedOverride == null) {
        return {
            effectivePreviousReading: normalizedLast ?? 0,
            previousOverridden: false
        };
    }

    return {
        effectivePreviousReading: parsedOverride,
        previousOverridden: normalizedLast == null ? true : parsedOverride !== normalizedLast
    };
}

function buildDefaultCaptureFlags({
    hasPhoto,
    hadExistingPhoto,
    photoStorageFailed,
    meterReplaced,
    previousOverridden,
    effectivePreviousReading,
    meterLastReading,
    previousOverrideSource
}) {
    const flags = [];

    if ((!hasPhoto && !hadExistingPhoto) || photoStorageFailed) {
        flags.push({
            type: 'no-photo',
            severity: 'medium',
            message: photoStorageFailed
                ? 'Photo could not be saved — upload failed on this device'
                : 'Reading submitted without meter photo',
            description: photoStorageFailed
                ? 'The reader selected a photo but it could not be stored. Re-capture from review if possible.'
                : 'Photo evidence was not captured. Review this reading manually.'
        });
    }

    if (meterReplaced) {
        flags.push({
            type: 'meter-replaced',
            severity: 'low',
            message: 'Meter replacement indicated by reader',
            description: 'Consumption baseline reset to 0 for this capture.'
        });
    }

    if (previousOverridden && !meterReplaced) {
        flags.push({
            type: 'previous-overridden',
            severity: 'low',
            message: `Previous reading overridden by reader: ${effectivePreviousReading} kWh (was ${meterLastReading ?? 0} kWh)`,
            description: 'Reader manually corrected the previous reading baseline.',
            source: previousOverrideSource || 'manual_override'
        });
    }

    return flags;
}

export function buildCaptureReadingRecord({
    meter,
    cycleId,
    readingValue,
    readingDate,
    notes,
    capturedBy,
    capturedById,
    photoPayload,
    hasPhoto,
    hadExistingPhoto = false,
    photoStorageFailed = false,
    meterReplaced = false,
    previousOverrideValue = null,
    previousOverrideSource = 'manual_override',
    additionalFlags = [],
    additionalFields = {}
}) {
    const { effectivePreviousReading, previousOverridden } = resolvePreviousBaseline({
        meterLastReading: meter?.last_reading ?? null,
        meterReplaced,
        previousOverrideValue
    });

    const defaultFlags = buildDefaultCaptureFlags({
        hasPhoto,
        hadExistingPhoto,
        photoStorageFailed,
        meterReplaced,
        previousOverridden,
        effectivePreviousReading,
        meterLastReading: meter?.last_reading ?? null,
        previousOverrideSource
    });

    const readingDraft = {
        meter_id: meter.id,
        cycle_id: cycleId,
        reading_value: readingValue,
        previous_reading: effectivePreviousReading,
        reading_date: readingDate,
        photo: photoPayload?.photo || '',
        photo_name: photoPayload?.photo_name || '',
        photo_storage_mode: photoPayload?.photo_storage_mode || '',
        photo_storage_path: photoPayload?.photo_storage_path || '',
        notes: notes || '',
        consumption: readingValue - effectivePreviousReading,
        captured_by: capturedBy,
        captured_by_id: capturedById,
        review_status: 'pending',
        flags: [...additionalFlags, ...defaultFlags],
        ...(meterReplaced ? { meter_replaced: true } : {}),
        ...(previousOverridden && !meterReplaced ? { previous_reading_source: previousOverrideSource } : {}),
        ...additionalFields
    };

    readingDraft.flags = [...readingDraft.flags, ...validation.validateReading(readingDraft)];

    return {
        reading: readingDraft,
        effectivePreviousReading,
        previousOverridden
    };
}

export function saveCaptureReading({ existingReading, reading, meter, meterUpdateExtras = {} }) {
    if (existingReading) {
        storage.update('readings', existingReading.id, reading);
    } else {
        storage.create('readings', reading);
    }

    storage.update('meters', meter.id, {
        last_reading: reading.reading_value,
        last_reading_date: reading.reading_date,
        ...meterUpdateExtras
    });
}

export function getMeterDisplayDescriptor(meter) {
    const serial = String(
        meter?.serial_number
        || meter?.meter_serial
        || meter?.serial
        || meter?.serial_no
        || ''
    ).trim();

    const label = String(meter?.location_description || meter?.meter_label || '').trim();

    return {
        label,
        serial
    };
}
