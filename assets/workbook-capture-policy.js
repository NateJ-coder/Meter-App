/**
 * workbook-capture-policy.js
 *
 * Loads workbook-derived capture guidance and resolves the best policy hint
 * for the active meter in phone/web capture flows.
 */

const WORKBOOK_POLICY_PATH = 'source-documents/03-extracted-outputs/gemini-cleaning/ud-extraction-and-data-check-normalized-latest.json';

let policyIndexCache = null;
let policyLoadPromise = null;

function normalizeToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeSerial(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function normalizePolicy(value) {
    const policy = String(value || '').trim().toLowerCase();
    const allowed = new Set(['capture_required', 'skip_allowed', 'client_submitted', 'unknown']);
    return allowed.has(policy) ? policy : 'unknown';
}

function collectPolicyRecords(payload) {
    const accepted = Array.isArray(payload?.accepted) ? payload.accepted : [];
    return accepted.filter((record) => normalizePolicy(record?.capture_policy) !== 'unknown');
}

function chooseBetterRecord(existingRecord, incomingRecord) {
    if (!existingRecord) {
        return incomingRecord;
    }

    const existingConfidence = Number(existingRecord?.confidence || 0);
    const incomingConfidence = Number(incomingRecord?.confidence || 0);
    if (incomingConfidence > existingConfidence) {
        return incomingRecord;
    }

    if (incomingConfidence === existingConfidence) {
        const existingHasSkipReason = Boolean(String(existingRecord?.skip_reason || '').trim());
        const incomingHasSkipReason = Boolean(String(incomingRecord?.skip_reason || '').trim());
        if (incomingHasSkipReason && !existingHasSkipReason) {
            return incomingRecord;
        }
    }

    return existingRecord;
}

function buildPolicyIndex(records) {
    const bySerial = new Map();
    const byBuildingLabel = new Map();
    const byLabel = new Map();

    records.forEach((record) => {
        const serialKey = normalizeSerial(record?.serial_number_clean);
        const labelKey = normalizeToken(record?.meter_label_clean);
        const buildingKey = normalizeToken(record?.building_clean);
        const buildingLabelKey = buildingKey && labelKey ? `${buildingKey}|${labelKey}` : '';

        if (serialKey) {
            bySerial.set(serialKey, chooseBetterRecord(bySerial.get(serialKey), record));
        }

        if (buildingLabelKey) {
            byBuildingLabel.set(buildingLabelKey, chooseBetterRecord(byBuildingLabel.get(buildingLabelKey), record));
        }

        if (labelKey) {
            byLabel.set(labelKey, chooseBetterRecord(byLabel.get(labelKey), record));
        }
    });

    return {
        loadedAt: new Date().toISOString(),
        totalRecords: records.length,
        bySerial,
        byBuildingLabel,
        byLabel
    };
}

function mapPolicyRecordToHint(record, matchType) {
    if (!record) {
        return null;
    }

    return {
        capturePolicy: normalizePolicy(record.capture_policy),
        skipReason: String(record.skip_reason || '').trim(),
        rationale: String(record.rationale || '').trim(),
        confidence: Number(record.confidence || 0),
        sourceRowIndex: Number(record.row_index || 0) || null,
        sourceBuilding: String(record.building_clean || '').trim(),
        sourceMeterLabel: String(record.meter_label_clean || '').trim(),
        sourceSerial: String(record.serial_number_clean || '').trim(),
        matchType
    };
}

function getExplicitMeterPolicyHint(meter) {
    const capturePolicy = normalizePolicy(meter?.capture_policy || meter?.workbook_capture_policy);
    if (!capturePolicy || capturePolicy === 'unknown') {
        return null;
    }

    return {
        capturePolicy,
        skipReason: String(meter?.skip_reason || meter?.workbook_skip_reason || '').trim(),
        rationale: String(meter?.policy_rationale || meter?.workbook_policy_rationale || '').trim(),
        confidence: Number(meter?.policy_confidence || meter?.workbook_policy_confidence || 1),
        sourceRowIndex: meter?.source_row_index || meter?.workbook_source_row_index || null,
        sourceBuilding: String(meter?.source_building || meter?.workbook_source_building || '').trim(),
        sourceMeterLabel: String(meter?.source_meter_label || meter?.workbook_source_meter_label || '').trim(),
        sourceSerial: String(meter?.source_serial || meter?.workbook_source_serial || '').trim(),
        matchType: 'meter-field'
    };
}

function safeFetchPolicyPayload() {
    return fetch(WORKBOOK_POLICY_PATH, { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Policy file request failed (${response.status})`);
            }
            return response.json();
        });
}

export async function preloadWorkbookCapturePolicy() {
    if (policyIndexCache) {
        return policyIndexCache;
    }

    if (!policyLoadPromise) {
        policyLoadPromise = safeFetchPolicyPayload()
            .then((payload) => {
                const records = collectPolicyRecords(payload);
                policyIndexCache = buildPolicyIndex(records);
                return policyIndexCache;
            })
            .catch((error) => {
                console.warn('Workbook capture policy unavailable:', error.message);
                policyIndexCache = null;
                return null;
            })
            .finally(() => {
                policyLoadPromise = null;
            });
    }

    return policyLoadPromise;
}

export function getWorkbookCapturePolicyForMeter(meter, context = {}) {
    const explicitHint = getExplicitMeterPolicyHint(meter);
    if (explicitHint) {
        return explicitHint;
    }

    if (!policyIndexCache) {
        return null;
    }

    const meterSerial = normalizeSerial(
        meter?.serial_number
        || meter?.meter_serial
        || meter?.serial
        || meter?.serial_no
    );

    const meterLabel = normalizeToken(
        meter?.location_description
        || meter?.meter_label
        || ''
    );

    const buildingName = normalizeToken(
        context?.buildingName
        || context?.building
        || ''
    );

    if (meterSerial && policyIndexCache.bySerial.has(meterSerial)) {
        return mapPolicyRecordToHint(policyIndexCache.bySerial.get(meterSerial), 'serial');
    }

    const buildingLabelKey = buildingName && meterLabel ? `${buildingName}|${meterLabel}` : '';
    if (buildingLabelKey && policyIndexCache.byBuildingLabel.has(buildingLabelKey)) {
        return mapPolicyRecordToHint(policyIndexCache.byBuildingLabel.get(buildingLabelKey), 'building-label');
    }

    if (meterLabel && policyIndexCache.byLabel.has(meterLabel)) {
        return mapPolicyRecordToHint(policyIndexCache.byLabel.get(meterLabel), 'label');
    }

    return null;
}
